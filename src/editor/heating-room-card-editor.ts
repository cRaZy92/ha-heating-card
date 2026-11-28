import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t, type I18nKey } from '../i18n';
import type { Hass, TrvConfig } from '../types';
import {
  addTrv,
  applyScheduleForm,
  cleanConfig,
  detectPrefixes,
  quickFill,
  removeTrv,
  scheduleFormData,
  setPrimary,
  setUseSchedule,
  updateTrv,
  type EditorConfig,
  type ScheduleForm,
} from './form-model';

const DEFAULT_SHOW_BATTERY = 'low';
const DEFAULT_BATTERY_WARNING = 25;

const entity = (filter: Record<string, unknown>) => ({ entity: { filter } });

const GENERAL_SCHEMA = [
  { name: 'name', selector: { text: {} } },
  { name: 'icon', selector: { icon: { placeholder: 'mdi:radiator' } } },
  { name: 'boiler', selector: entity({ domain: ['switch', 'input_boolean'] }) },
  {
    name: '',
    type: 'grid',
    schema: [
      { name: 'temperature', selector: entity({ domain: 'sensor', device_class: 'temperature' }) },
      { name: 'humidity', selector: entity({ domain: 'sensor', device_class: 'humidity' }) },
    ],
  },
];

const TRV_SCHEMA = [
  { name: 'climate', required: true, selector: entity({ domain: 'climate' }) },
  {
    name: '',
    type: 'grid',
    schema: [
      { name: 'valve', selector: entity({ domain: 'sensor' }) },
      { name: 'battery', selector: entity({ domain: 'sensor', device_class: 'battery' }) },
    ],
  },
];

const SCHEDULE_SCHEMA = [
  { name: 'enabled', required: true, selector: entity({ domain: 'input_boolean' }) },
  {
    name: '',
    type: 'grid',
    schema: [
      { name: 'night_temp', required: true, selector: entity({ domain: 'input_number' }) },
      { name: 'day_temp', required: true, selector: entity({ domain: 'input_number' }) },
      { name: 'weekday_day', required: true, selector: entity({ domain: 'input_datetime' }) },
      { name: 'weekday_night', required: true, selector: entity({ domain: 'input_datetime' }) },
      { name: 'weekend_day', selector: entity({ domain: 'input_datetime' }) },
      { name: 'weekend_night', selector: entity({ domain: 'input_datetime' }) },
    ],
  },
];

const LABEL: Record<string, I18nKey> = {
  name: 'ed_name',
  icon: 'ed_icon',
  boiler: 'ed_boiler',
  temperature: 'ed_temperature',
  humidity: 'ed_humidity',
  climate: 'ed_climate',
  valve: 'ed_valve',
  battery: 'ed_battery',
  primary: 'ed_primary',
  use_schedule: 'ed_use_schedule',
  quick_fill: 'ed_quick_fill',
  enabled: 'ed_enabled',
  night_temp: 'ed_night_temp',
  day_temp: 'ed_day_temp',
  weekday_day: 'ed_weekday_day',
  weekday_night: 'ed_weekday_night',
  weekend_day: 'ed_weekend_day',
  weekend_night: 'ed_weekend_night',
  show_battery: 'ed_show_battery',
  battery_warning: 'ed_battery_warning',
};

const HELP: Record<string, I18nKey> = {
  use_schedule: 'ed_use_schedule_help',
  quick_fill: 'ed_quick_fill_help',
};

let haComponentsLoading: Promise<void> | undefined;

/**
 * HA lazy-loads ha-form and its selectors. Opening a built-in card's editor once makes HA
 * load them, so our forms render even if no other editor was opened first.
 */
function loadHaComponents(): Promise<void> {
  if (customElements.get('ha-form') && customElements.get('ha-entity-picker')) return Promise.resolve();
  haComponentsLoading ??= (async () => {
    try {
      const helpers = await (window as any).loadCardHelpers?.();
      const card = await helpers?.createCardElement({ type: 'entities', entities: [] });
      await card?.constructor?.getConfigElement?.();
    } catch (err) {
      console.warn('heating-room-card: could not preload HA form components', err);
    }
  })();
  return haComponentsLoading;
}

@customElement('heating-room-card-editor')
export class HeatingRoomCardEditor extends LitElement {
  @property({ attribute: false }) hass?: Hass;
  @state() private config: EditorConfig = {};
  @state() private quickPrefix = '';

  setConfig(config: EditorConfig) {
    this.config = { ...config };
  }

  connectedCallback() {
    super.connectedCallback();
    void loadHaComponents().then(() => this.requestUpdate());
  }

  private change(next: EditorConfig) {
    this.config = next;
    const config = cleanConfig({ type: 'custom:heating-room-card', ...next });
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }

  private label = (s: { name: string }) => (LABEL[s.name] ? t(this.hass, LABEL[s.name]) : s.name);
  private helper = (s: { name: string }) => (HELP[s.name] ? t(this.hass, HELP[s.name]) : undefined);

  private form(section: string, data: object, schema: unknown[], onChange: (value: any) => void) {
    return html`<ha-form
      data-section=${section}
      .hass=${this.hass}
      .data=${data}
      .schema=${schema}
      .computeLabel=${this.label}
      .computeHelper=${this.helper}
      @value-changed=${(e: CustomEvent<{ value: any }>) => {
        e.stopPropagation();
        onChange(e.detail.value ?? {});
      }}
    ></ha-form>`;
  }

  private onGeneral(v: { name?: string; icon?: string; boiler?: string; temperature?: string; humidity?: string }) {
    this.change({
      ...this.config,
      name: v.name,
      icon: v.icon,
      boiler: v.boiler,
      temperature: v.temperature,
      humidity: v.humidity,
    });
  }

  private onDisplay(v: { show_battery?: 'low' | 'always'; battery_warning?: number }) {
    this.change({
      ...this.config,
      show_battery: v.show_battery === DEFAULT_SHOW_BATTERY ? undefined : v.show_battery,
      battery_warning: v.battery_warning === DEFAULT_BATTERY_WARNING ? undefined : v.battery_warning,
    });
  }

  private onQuickFill(v: { quick_fill?: string }) {
    this.quickPrefix = v.quick_fill ?? '';
    const filled = quickFill(this.quickPrefix, this.hass?.states ?? {});
    if (Object.keys(filled).length === 0) return;
    const merged = { ...scheduleFormData(this.config), ...scheduleFormData({ schedule: filled }) };
    this.change(applyScheduleForm(this.config, merged));
  }

  private friendlyName(id: string): string {
    return this.hass?.states[id]?.attributes?.friendly_name ?? id;
  }

  protected render() {
    const c = this.config;
    const trvs = c.trvs ?? [];
    const prefixes = detectPrefixes(this.hass?.states ?? {});
    const named = trvs.filter((trv) => trv.climate);
    const primary = c.climate && named.some((trv) => trv.climate === c.climate) ? c.climate : named[0]?.climate;

    return html`
      ${this.form(
        'general',
        { name: c.name, icon: c.icon, boiler: c.boiler, temperature: c.temperature, humidity: c.humidity },
        GENERAL_SCHEMA,
        (v) => this.onGeneral(v),
      )}

      <h3>${t(this.hass, 'ed_trvs')}</h3>
      ${trvs.map(
        (trv, i) => html`<div class="trv">
          <div class="trv-head">
            <span>${t(this.hass, 'ed_trv')} ${i + 1}</span>
            ${trvs.length > 1
              ? html`<button class="remove" title=${t(this.hass, 'ed_remove')} aria-label=${t(this.hass, 'ed_remove')}
                  @click=${() => this.change(removeTrv(this.config, i))}>
                  <ha-icon icon="mdi:delete-outline"></ha-icon>
                </button>`
              : nothing}
          </div>
          ${this.form('trv', trv, TRV_SCHEMA, (v: TrvConfig) => this.change(updateTrv(this.config, i, v)))}
        </div>`,
      )}
      <button class="add" @click=${() => this.change(addTrv(this.config))}>
        <ha-icon icon="mdi:plus"></ha-icon>${t(this.hass, 'ed_add_trv')}
      </button>
      ${named.length > 1
        ? this.form(
            'primary',
            { primary },
            [
              {
                name: 'primary',
                selector: {
                  select: {
                    mode: 'dropdown',
                    options: named.map((trv) => ({ value: trv.climate, label: this.friendlyName(trv.climate) })),
                  },
                },
              },
            ],
            (v: { primary?: string }) => v.primary && this.change(setPrimary(this.config, v.primary)),
          )
        : nothing}
      ${named.length > 1 ? html`<p class="hint">${t(this.hass, 'ed_primary_help')}</p>` : nothing}

      <h3>${t(this.hass, 'ed_schedule')}</h3>
      ${this.form(
        'use_schedule',
        { use_schedule: !!c.schedule },
        [{ name: 'use_schedule', selector: { boolean: {} } }],
        (v: { use_schedule?: boolean }) => this.change(setUseSchedule(this.config, !!v.use_schedule)),
      )}
      ${c.schedule ? this.renderSchedule(prefixes) : nothing}

      <h3>${t(this.hass, 'ed_display')}</h3>
      ${this.renderDisplay()}
    `;
  }

  private renderSchedule(prefixes: string[]) {
    return html`
      ${this.form(
        'quick_fill',
        { quick_fill: this.quickPrefix },
        [
          {
            name: 'quick_fill',
            selector: {
              select: { mode: 'dropdown', custom_value: true, options: prefixes.map((p) => ({ value: p, label: p })) },
            },
          },
        ],
        (v) => this.onQuickFill(v),
      )}
      ${this.form('schedule', scheduleFormData(this.config), SCHEDULE_SCHEMA, (v: ScheduleForm) =>
        this.change(applyScheduleForm(this.config, v)),
      )}
      <p class="hint">${t(this.hass, 'ed_weekend_help')}</p>
    `;
  }

  private renderDisplay() {
    const c = this.config;
    return html`
      ${this.form(
        'display',
        { show_battery: c.show_battery ?? DEFAULT_SHOW_BATTERY, battery_warning: c.battery_warning ?? DEFAULT_BATTERY_WARNING },
        [
          {
            name: '',
            type: 'grid',
            schema: [
              {
                name: 'show_battery',
                selector: {
                  select: {
                    mode: 'dropdown',
                    options: [
                      { value: 'low', label: t(this.hass, 'ed_battery_low') },
                      { value: 'always', label: t(this.hass, 'ed_battery_always') },
                    ],
                  },
                },
              },
              {
                name: 'battery_warning',
                selector: { number: { min: 0, max: 100, step: 1, mode: 'box', unit_of_measurement: '%' } },
              },
            ],
          },
        ],
        (v) => this.onDisplay(v),
      )}
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    h3 {
      margin: 24px 0 8px;
      font-size: 16px;
      font-weight: 500;
      color: var(--primary-text-color);
    }
    .trv {
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
      border-radius: 12px;
      padding: 8px 12px 12px;
      margin-bottom: 12px;
    }
    .trv-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 40px;
      font-weight: 500;
      color: var(--secondary-text-color);
    }
    button {
      font: inherit;
      color: var(--primary-color);
      background: none;
      border: none;
      cursor: pointer;
      border-radius: 20px;
    }
    button:hover {
      background: rgba(127, 127, 127, 0.12);
    }
    .remove {
      width: 40px;
      height: 40px;
      color: var(--secondary-text-color);
    }
    .add {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 40px;
      padding: 0 16px 0 12px;
      margin-bottom: 12px;
      font-weight: 500;
    }
    .hint {
      margin: 4px 0 0;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'heating-room-card-editor': HeatingRoomCardEditor;
  }
}
