import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './components/hrc-dial';
import './components/hrc-schedule';
import './components/hrc-editor';
import type { EditorValues, NumberLimits } from './components/hrc-editor';
import { normalizeConfig } from './config';
import './editor/heating-room-card-editor';
import { configProblems, stubConfig } from './editor/form-model';
import { evaluateStatus, type StatusKind } from './status';
import { offlineTrvs, outOfSyncTrvs } from './health';
import { expectedTemp, formatTime, readSchedule } from './schedule';
import { decimalSeparator, t, type I18nKey } from './i18n';
import type { Hass, HassEntity, NormalizedConfig } from './types';

/**
 * Safety net only: battery TRVs (e.g. Shelly BLU) can take tens of seconds to report a new
 * setpoint, so a pending value normally ends when HA reports a changed setpoint, not on a timer.
 */
const PENDING_TIMEOUT_MS = 60_000;
const NOW_REFRESH_MS = 60_000;
const ERROR_VISIBLE_MS = 5_000;
/**
 * How long the TRVs' setpoints may differ before the card flags it. Sync automations and battery
 * TRVs need a while to catch up after every change, so a short mismatch is normal.
 */
const SYNC_GRACE_MS = 3 * 60_000;

const STATUS_KEY: Record<StatusKind, I18nKey> = {
  unavailable: 'status_unavailable',
  off: 'status_off',
  idle: 'status_idle',
  wants_heat: 'status_wants_heat',
  heating: 'status_heating',
};

const SETUP_LABEL: Record<string, I18nKey> = {
  trvs: 'ed_climate',
  'schedule.enabled': 'ed_enabled',
  'schedule.night_temp': 'ed_night_temp',
  'schedule.day_temp': 'ed_day_temp',
  'schedule.weekday.day': 'ed_weekday_day',
  'schedule.weekday.night': 'ed_weekday_night',
  'schedule.weekend.day': 'ed_weekend_day',
  'schedule.weekend.night': 'ed_weekend_night',
};

function numAttr(entity: HassEntity | undefined, attr: string): number | null {
  const v = entity?.attributes?.[attr];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function numState(entity: HassEntity | undefined): number | null {
  if (!entity || entity.state === '') return null;
  const n = Number(entity.state);
  return Number.isFinite(n) ? n : null;
}

function batteryIcon(level: number, low: boolean): string {
  if (low) return 'mdi:battery-alert-variant-outline';
  const tens = Math.round(level / 10) * 10;
  if (tens >= 100) return 'mdi:battery';
  if (tens <= 0) return 'mdi:battery-outline';
  return `mdi:battery-${tens}`;
}

function limitsOf(entity: HassEntity | undefined): NumberLimits {
  return {
    min: numAttr(entity, 'min') ?? 5,
    max: numAttr(entity, 'max') ?? 30,
    step: numAttr(entity, 'step') ?? 0.5,
  };
}

@customElement('heating-room-card')
export class HeatingRoomCard extends LitElement {
  @property({ attribute: false }) hass?: Hass;
  @state() private config?: NormalizedConfig;
  @state() private pendingValue: number | null = null;
  /** The setpoint HA reported when the pending value was set; any other report ends pending. */
  private pendingFrom: number | null = null;
  @state() private editorOpen = false;
  @state() private now = new Date();
  @state() private errorVisible = false;
  /** Set instead of `config` while the config is incomplete or invalid. */
  @state() private setup?: { missing: string[]; error?: string };
  /** TRVs whose setpoint has differed from the dial's TRV for longer than SYNC_GRACE_MS. */
  @state() private outOfSync: string[] = [];
  private syncTimer?: ReturnType<typeof setTimeout>;

  private pendingTimer?: ReturnType<typeof setTimeout>;
  private nowTimer?: ReturnType<typeof setInterval>;
  private errorTimer?: ReturnType<typeof setTimeout>;

  setConfig(raw: unknown) {
    if (!raw || typeof raw !== 'object') throw new Error('heating-room-card: invalid configuration');
    const missing = configProblems(raw);
    try {
      if (missing.length) throw new Error('incomplete');
      this.config = normalizeConfig(raw);
      this.setup = undefined;
    } catch (err) {
      // Shown in the card instead of HA's red error card, so the editor preview stays useful.
      this.clearPending();
      this.config = undefined;
      this.setup = missing.length ? { missing } : { missing, error: (err as Error).message };
    }
  }

  static getConfigElement() {
    return document.createElement('heating-room-card-editor');
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: 12 };
  }

  static getStubConfig(hass?: Hass) {
    return stubConfig(hass);
  }

  connectedCallback() {
    super.connectedCallback();
    this.nowTimer = setInterval(() => (this.now = new Date()), NOW_REFRESH_MS);
    this.checkSync();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.nowTimer);
    clearTimeout(this.errorTimer);
    this.errorVisible = false;
    this.clearPending();
    this.clearSync();
  }

  /** Only re-render when an entity this card uses actually changed. */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!changed.has('hass') || changed.size > 1 || !this.config) return true;
    const old = changed.get('hass') as Hass | undefined;
    if (!old || !this.hass) return true;
    return this.watchedEntities().some((id) => old.states[id] !== this.hass!.states[id]);
  }

  protected willUpdate(changed: PropertyValues) {
    // Ends on HA confirming our value, or on the setpoint being changed elsewhere (or the TRV going
    // off/unavailable). An update that still shows the old setpoint keeps the pending value.
    if (changed.has('hass') && this.pendingValue !== null && this.config && this.targetTemp() !== this.pendingFrom) {
      this.clearPending();
    }
    if (changed.has('hass') || changed.has('config')) this.checkSync();
  }

  private clearSync() {
    clearTimeout(this.syncTimer);
    this.syncTimer = undefined;
    this.outOfSync = [];
  }

  /** Flags TRVs as out of sync once their setpoints have differed for SYNC_GRACE_MS. */
  private checkSync() {
    if (!this.config || !this.hass) return this.clearSync();
    const ids = outOfSyncTrvs(this.hass, this.config);
    if (ids.length === 0) return this.clearSync();
    if (this.outOfSync.length > 0) {
      // Already flagged: keep the list current, without waiting again.
      if (ids.join() !== this.outOfSync.join()) this.outOfSync = ids;
      return;
    }
    this.syncTimer ??= setTimeout(() => {
      this.syncTimer = undefined;
      this.outOfSync = this.config && this.hass ? outOfSyncTrvs(this.hass, this.config) : [];
    }, SYNC_GRACE_MS);
  }

  private watchedEntities(): string[] {
    const c = this.config!;
    const s = c.schedule;
    return [
      c.climate,
      ...[c.boiler, c.temperature, c.humidity].filter((x): x is string => !!x),
      ...c.trvs.flatMap((trv) => [trv.climate, trv.valve, trv.battery].filter((x): x is string => !!x)),
      s.enabled,
      s.night_temp,
      s.day_temp,
      s.weekday.day,
      s.weekday.night,
      s.weekend.day,
      s.weekend.night,
    ];
  }

  private entity(id: string | undefined): HassEntity | undefined {
    return id ? this.hass?.states[id] : undefined;
  }

  private targetTemp(): number | null {
    const climate = this.entity(this.config!.climate);
    if (!climate || ['off', 'unavailable', 'unknown'].includes(climate.state)) return null;
    return numAttr(climate, 'temperature');
  }

  private clearPending() {
    clearTimeout(this.pendingTimer);
    this.pendingTimer = undefined;
    this.pendingValue = null;
    this.pendingFrom = null;
  }

  /**
   * Call an HA service. Resolves true on success, false on any failure (rejected promise,
   * synchronous throw, or no hass) — never rejects, so nothing goes unhandled.
   */
  private call(domain: string, service: string, data: Record<string, unknown>): Promise<boolean> {
    const fail = (err: unknown) => {
      console.warn(`heating-room-card: ${domain}.${service} failed`, err);
      return false;
    };
    if (!this.hass) return Promise.resolve(fail(new Error('hass not available')));
    try {
      // Called synchronously so the request goes out immediately and in order.
      return Promise.resolve(this.hass.callService(domain, service, data)).then(() => true, fail);
    } catch (err) {
      return Promise.resolve(fail(err));
    }
  }

  private showError() {
    clearTimeout(this.errorTimer);
    this.errorVisible = true;
    this.errorTimer = setTimeout(() => (this.errorVisible = false), ERROR_VISIBLE_MS);
  }

  private moreInfo(entityId: string) {
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
  }

  private async toggleSchedule() {
    if (!(await this.call('input_boolean', 'toggle', { entity_id: this.config!.schedule.enabled }))) this.showError();
  }

  private async onDialChange(e: CustomEvent<{ value: number }>) {
    const value = e.detail.value;
    const reported = this.targetTemp();
    if (value === reported) {
      // HA already reports this value, so no confirming update will arrive — don't mark it pending.
      this.clearPending();
    } else {
      clearTimeout(this.pendingTimer);
      this.pendingValue = value;
      this.pendingFrom = reported;
      this.pendingTimer = setTimeout(() => this.clearPending(), PENDING_TIMEOUT_MS);
    }
    const ok = await this.call('climate', 'set_temperature', { entity_id: this.config!.climate, temperature: value });
    if (!ok) {
      if (this.pendingValue === value) this.clearPending(); // revert to the real value right away
      this.showError();
    }
  }

  private async onEditorSave(e: CustomEvent<Partial<EditorValues>>) {
    const s = this.config!.schedule;
    const d = e.detail;
    const calls: Promise<boolean>[] = [];
    const call = (domain: string, service: string, data: Record<string, unknown>) =>
      calls.push(this.call(domain, service, data));
    if (d.nightTemp != null) call('input_number', 'set_value', { entity_id: s.night_temp, value: d.nightTemp });
    if (d.dayTemp != null) call('input_number', 'set_value', { entity_id: s.day_temp, value: d.dayTemp });
    const times: [keyof EditorValues, string][] = [
      ['weekdayDay', s.weekday.day],
      ['weekdayNight', s.weekday.night],
      ['weekendDay', s.weekend.day],
      ['weekendNight', s.weekend.night],
    ];
    for (const [key, entity_id] of times) {
      const v = d[key];
      if (v != null) call('input_datetime', 'set_datetime', { entity_id, time: `${formatTime(v)}:00` });
    }
    const results = await Promise.all(calls);
    if (results.includes(false)) this.showError();
  }

  private renderHeader(enabled: boolean, name: string) {
    const c = this.config!;
    return html`
      <div class="header">
        <ha-icon class="room-icon ${enabled ? 'active' : ''}" icon=${c.icon}></ha-icon>
        <span class="name">${name}</span>
        <button class="pill ${enabled ? 'on' : ''}" @click=${this.toggleSchedule}>
          <ha-icon icon=${enabled ? 'mdi:toggle-switch' : 'mdi:toggle-switch-off'}></ha-icon>
          ${t(this.hass, enabled ? 'on' : 'off')}
        </button>
        ${c.trvs
          .filter((trv) => trv.valve)
          .map((trv) => {
            const v = numState(this.entity(trv.valve));
            return html`<button class="valve-chip ${enabled ? 'on' : ''}" @click=${() => this.moreInfo(trv.valve!)}>
              <ha-icon icon="mdi:pipe-valve"></ha-icon>${v === null ? '—' : `${Math.round(v)}%`}
            </button>`;
          })}
      </div>
    `;
  }

  /** Badges in the dial's top-left corner: offline TRVs, out-of-sync TRVs, then batteries. */
  private renderBadges() {
    const offline = offlineTrvs(this.hass!, this.config!);
    const name = (id: string) => this.entity(id)?.attributes?.friendly_name ?? id;
    const alerts = [
      ...offline.map(
        (id) => html`<button class="alert-chip offline" title=${name(id)} @click=${() => this.moreInfo(id)}>
          <ha-icon icon="mdi:radiator-off"></ha-icon>${t(this.hass, 'trv_offline')}
        </button>`,
      ),
      ...(this.outOfSync.length
        ? [
            html`<button
              class="alert-chip sync"
              title=${this.outOfSync.map(name).join(', ')}
              @click=${() => this.moreInfo(this.outOfSync[0])}
            >
              <ha-icon icon="mdi:sync-alert"></ha-icon>${t(this.hass, 'trv_out_of_sync')}
            </button>`,
          ]
        : []),
    ];
    const batteries = this.renderBatteries();
    if (alerts.length === 0 && batteries.length === 0) return nothing;
    return html`<div class="badges">${alerts}${batteries}</div>`;
  }

  /**
   * Battery chips. `low` (default): only the lowest battery below `battery_warning`.
   * `always`: every TRV battery, low ones highlighted.
   */
  private renderBatteries() {
    const c = this.config!;
    const levels = c.trvs
      .filter((trv) => trv.battery)
      .map((trv) => ({ id: trv.battery!, level: numState(this.entity(trv.battery)) }))
      .filter((b): b is { id: string; level: number } => b.level !== null);
    const low = (level: number) => level < c.battery_warning;

    let shown = levels;
    if (c.show_battery === 'low') {
      const lowest = levels.filter((b) => low(b.level)).sort((a, b) => a.level - b.level)[0];
      shown = lowest ? [lowest] : [];
    }
    return shown.map(
      ({ id, level }) => html`<button class="battery-chip ${low(level) ? 'low' : ''}" @click=${() => this.moreInfo(id)}>
        <ha-icon icon=${batteryIcon(level, low(level))}></ha-icon>${Math.round(level)}%
      </button>`,
    );
  }

  private renderSetup(setup: { missing: string[]; error?: string }) {
    return html`<ha-card class="setup">
      <ha-icon icon="mdi:radiator"></ha-icon>
      <div>
        <div class="setup-title">${t(this.hass, 'setup_title')}</div>
        ${setup.error
          ? html`<div class="setup-text">${setup.error}</div>`
          : html`<div class="setup-text">
              ${t(this.hass, 'setup_missing')}: ${setup.missing.map((p) => t(this.hass, SETUP_LABEL[p])).join(', ')}
            </div>`}
      </div>
    </ha-card>`;
  }

  protected render() {
    if (this.setup) return this.renderSetup(this.setup);
    if (!this.config || !this.hass) return nothing;
    const c = this.config;
    const hass = this.hass;
    const climate = this.entity(c.climate);
    const schedule = readSchedule(hass, c);
    const status = evaluateStatus(hass, c);
    const decimal = decimalSeparator(hass);
    const name = c.name ?? climate?.attributes?.friendly_name ?? c.climate;
    const value = this.pendingValue ?? this.targetTemp();
    // The room sensor wins when it has a reading; otherwise fall back to the TRV's own.
    const current = numState(this.entity(c.temperature)) ?? numAttr(climate, 'current_temperature');

    return html`
      <ha-card>
        ${this.renderHeader(schedule.enabled, name)}
        ${this.errorVisible
          ? html`<div class="error" role="alert">
              <ha-icon icon="mdi:alert-circle-outline"></ha-icon>${t(hass, 'error_save')}
            </div>`
          : nothing}
        <div class="dial-wrap">
        ${this.renderBadges()}
        <hrc-dial
          .value=${value}
          .min=${numAttr(climate, 'min_temp') ?? 5}
          .max=${numAttr(climate, 'max_temp') ?? 30}
          .step=${numAttr(climate, 'target_temp_step') ?? 0.5}
          .current=${current}
          .humidity=${numState(this.entity(c.humidity))}
          .status=${status}
          .statusLabel=${t(hass, STATUS_KEY[status])}
          .expected=${expectedTemp(schedule, this.now)}
          .hintLabel=${t(hass, 'schedule_hint')}
          .pending=${this.pendingValue !== null}
          .decimal=${decimal}
          @hrc-change=${this.onDialChange}
        ></hrc-dial>
        </div>
        <hrc-schedule
          .schedule=${schedule}
          .now=${this.now}
          .labels=${{ weekdays: t(hass, 'weekdays'), weekend: t(hass, 'weekend') }}
          .decimal=${decimal}
          @hrc-edit=${() => (this.editorOpen = true)}
        ></hrc-schedule>
        <hrc-editor
          .open=${this.editorOpen}
          .initial=${{
            nightTemp: schedule.nightTemp,
            dayTemp: schedule.dayTemp,
            weekdayDay: schedule.weekday.day,
            weekdayNight: schedule.weekday.night,
            weekendDay: schedule.weekend.day,
            weekendNight: schedule.weekend.night,
          }}
          .nightLimits=${limitsOf(this.entity(c.schedule.night_temp))}
          .dayLimits=${limitsOf(this.entity(c.schedule.day_temp))}
          .labels=${{
            night: t(hass, 'night'),
            day: t(hass, 'day'),
            weekdays: t(hass, 'weekdays'),
            weekend: t(hass, 'weekend'),
            save: t(hass, 'save'),
            cancel: t(hass, 'cancel'),
          }}
          .decimal=${decimal}
          @hrc-save=${this.onEditorSave}
          @hrc-close=${() => (this.editorOpen = false)}
        ></hrc-editor>
      </ha-card>
    `;
  }

  static styles = css`
    ha-card.setup {
      display: flex;
      gap: 16px;
      align-items: center;
      padding: 16px;
    }
    ha-card.setup ha-icon {
      color: var(--secondary-text-color);
      flex: none;
    }
    .setup-title {
      font-weight: 500;
      color: var(--primary-text-color);
    }
    .setup-text {
      margin-top: 4px;
      font-size: 14px;
      color: var(--secondary-text-color);
    }
    ha-card {
      display: block;
      padding: 12px 8px 8px;
      --hrc-accent: var(--mdc-theme-secondary, var(--accent-color, #ff9800));
    }
    .header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 6px;
    }
    .room-icon {
      --mdc-icon-size: 28px;
      color: var(--secondary-text-color);
    }
    .room-icon.active {
      color: var(--hrc-accent);
    }
    .name {
      flex: 1;
      min-width: 0;
      font-size: 20px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--primary-text-color);
    }
    button {
      font: inherit;
      border: none;
      background: none;
      color: inherit;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 12px;
      border-radius: 18px;
      font-size: 14px;
      font-weight: 500;
      color: #fff;
      background: var(--disabled-color, #6f6f6f);
      transition: background 0.2s ease;
    }
    .pill.on {
      background: var(--hrc-accent);
    }
    .pill ha-icon,
    .valve-chip ha-icon,
    .battery-chip ha-icon,
    .alert-chip ha-icon {
      --mdc-icon-size: 18px;
    }
    .valve-chip {
      display: inline-flex;
      align-items: center;
      gap: 1px;
      padding: 4px 2px;
      font-size: 13px;
      font-weight: 500;
      color: var(--secondary-text-color);
    }
    .valve-chip.on {
      color: var(--hrc-accent);
    }
    hrc-dial {
      margin: 4px 0 0;
    }
    .error {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 8px 6px 0;
      padding: 6px 10px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      color: var(--error-color, #db4437);
      background: rgba(219, 68, 55, 0.12);
    }
    .error ha-icon {
      --mdc-icon-size: 18px;
    }
    .dial-wrap {
      position: relative;
    }
    .badges {
      position: absolute;
      top: 4px;
      left: 6px;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }
    .battery-chip,
    .alert-chip {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 0;
      font-size: 13px;
      font-weight: 500;
      color: var(--secondary-text-color);
    }
    .alert-chip.sync {
      color: var(--warning-color, #ffa600);
    }
    .battery-chip.low,
    .alert-chip.offline {
      color: var(--error-color, #db4437);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'heating-room-card': HeatingRoomCard;
  }
  interface Window {
    customCards?: { type: string; name: string; description: string; preview?: boolean; documentationURL?: string }[];
  }
}

declare const __CARD_VERSION__: string;
const VERSION = typeof __CARD_VERSION__ === 'string' ? __CARD_VERSION__ : 'dev';
console.info(`%c HEATING-ROOM-CARD %c ${VERSION} `, 'color: #fff; background: #ff9800; font-weight: 700', 'color: #ff9800; background: #222');

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'heating-room-card',
  name: 'Heating Room Card',
  description: 'Room heating: setpoint dial, heating status and weekday/weekend schedule.',
  documentationURL: 'https://github.com/cRaZy92/ha-heating-card',
  preview: true,
});
