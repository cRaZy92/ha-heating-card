import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './components/hrc-dial';
import './components/hrc-schedule';
import './components/hrc-editor';
import type { EditorValues, NumberLimits } from './components/hrc-editor';
import { normalizeConfig } from './config';
import { evaluateStatus, type StatusKind } from './status';
import { expectedTemp, formatTime, readSchedule } from './schedule';
import { decimalSeparator, t, type I18nKey } from './i18n';
import type { Hass, HassEntity, NormalizedConfig } from './types';

const PENDING_TIMEOUT_MS = 10_000;
const NOW_REFRESH_MS = 60_000;
const ERROR_VISIBLE_MS = 5_000;

const STATUS_KEY: Record<StatusKind, I18nKey> = {
  unavailable: 'status_unavailable',
  off: 'status_off',
  idle: 'status_idle',
  wants_heat: 'status_wants_heat',
  heating: 'status_heating',
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
  @state() private editorOpen = false;
  @state() private now = new Date();
  @state() private errorVisible = false;

  private pendingTimer?: ReturnType<typeof setTimeout>;
  private nowTimer?: ReturnType<typeof setInterval>;
  private errorTimer?: ReturnType<typeof setTimeout>;

  setConfig(raw: unknown) {
    this.config = normalizeConfig(raw);
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: 12 };
  }

  static getStubConfig() {
    return {
      trvs: [{ climate: 'climate.trv', valve: 'sensor.trv_valve', battery: 'sensor.trv_battery' }],
      boiler: 'switch.boiler',
      schedule: {
        enabled: 'input_boolean.room_on_off',
        night_temp: 'input_number.room_night_temp',
        day_temp: 'input_number.room_day_temp',
        weekday: { day: 'input_datetime.room_day_time', night: 'input_datetime.room_night_time' },
        weekend: { day: 'input_datetime.room_day_time_weekend', night: 'input_datetime.room_night_time_weekend' },
      },
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this.nowTimer = setInterval(() => (this.now = new Date()), NOW_REFRESH_MS);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.nowTimer);
    clearTimeout(this.errorTimer);
    this.errorVisible = false;
    this.clearPending();
  }

  /** Only re-render when an entity this card uses actually changed. */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!changed.has('hass') || changed.size > 1 || !this.config) return true;
    const old = changed.get('hass') as Hass | undefined;
    if (!old || !this.hass) return true;
    return this.watchedEntities().some((id) => old.states[id] !== this.hass!.states[id]);
  }

  protected willUpdate(changed: PropertyValues) {
    if (changed.has('hass') && this.pendingValue !== null && this.targetTemp() === this.pendingValue) {
      this.clearPending();
    }
  }

  private watchedEntities(): string[] {
    const c = this.config!;
    const s = c.schedule;
    return [
      c.climate,
      ...(c.boiler ? [c.boiler] : []),
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
    if (value === this.targetTemp()) {
      // HA already reports this value, so no confirming update will arrive — don't mark it pending.
      this.clearPending();
    } else {
      clearTimeout(this.pendingTimer);
      this.pendingValue = value;
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

  /**
   * Battery chips in the dial's top-left corner. `low` (default): only the lowest battery below
   * `battery_warning`. `always`: every TRV battery, low ones highlighted.
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
    if (shown.length === 0) return nothing;

    return html`<div class="batteries">
      ${shown.map(
        ({ id, level }) => html`<button class="battery-chip ${low(level) ? 'low' : ''}" @click=${() => this.moreInfo(id)}>
          <ha-icon icon=${batteryIcon(level, low(level))}></ha-icon>${Math.round(level)}%
        </button>`,
      )}
    </div>`;
  }

  protected render() {
    if (!this.config || !this.hass) return nothing;
    const c = this.config;
    const hass = this.hass;
    const climate = this.entity(c.climate);
    const schedule = readSchedule(hass, c);
    const status = evaluateStatus(hass, c);
    const decimal = decimalSeparator(hass);
    const name = c.name ?? climate?.attributes?.friendly_name ?? c.climate;
    const value = this.pendingValue ?? this.targetTemp();

    return html`
      <ha-card>
        ${this.renderHeader(schedule.enabled, name)}
        ${this.errorVisible
          ? html`<div class="error" role="alert">
              <ha-icon icon="mdi:alert-circle-outline"></ha-icon>${t(hass, 'error_save')}
            </div>`
          : nothing}
        <div class="dial-wrap">
        ${this.renderBatteries()}
        <hrc-dial
          .value=${value}
          .min=${numAttr(climate, 'min_temp') ?? 5}
          .max=${numAttr(climate, 'max_temp') ?? 30}
          .step=${numAttr(climate, 'target_temp_step') ?? 0.5}
          .current=${numAttr(climate, 'current_temperature')}
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
    .battery-chip ha-icon {
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
    .batteries {
      position: absolute;
      top: 4px;
      left: 6px;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }
    .battery-chip {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 0;
      font-size: 13px;
      font-weight: 500;
      color: var(--secondary-text-color);
    }
    .battery-chip.low {
      color: var(--error-color, #db4437);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'heating-room-card': HeatingRoomCard;
  }
  interface Window {
    customCards?: { type: string; name: string; description: string; preview?: boolean }[];
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'heating-room-card',
  name: 'Heating Room Card',
  description: 'Room heating: setpoint dial, heating status and weekday/weekend schedule.',
});
