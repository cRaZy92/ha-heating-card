import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { formatTime, parseTime } from '../schedule';
import { snap } from '../dial-math';

export interface EditorValues {
  nightTemp: number | null;
  dayTemp: number | null;
  weekdayDay: number | null;
  weekdayNight: number | null;
  weekendDay: number | null;
  weekendNight: number | null;
}

export interface NumberLimits {
  min: number;
  max: number;
  step: number;
}

type TempKey = 'nightTemp' | 'dayTemp';
type TimeKey = 'weekdayDay' | 'weekdayNight' | 'weekendDay' | 'weekendNight';

const EMPTY: EditorValues = {
  nightTemp: null,
  dayTemp: null,
  weekdayDay: null,
  weekdayNight: null,
  weekendDay: null,
  weekendNight: null,
};

@customElement('hrc-editor')
export class HrcEditor extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ attribute: false }) initial: EditorValues = EMPTY;
  @property({ attribute: false }) nightLimits: NumberLimits = { min: 5, max: 30, step: 0.5 };
  @property({ attribute: false }) dayLimits: NumberLimits = { min: 5, max: 30, step: 0.5 };
  @property({ attribute: false }) labels = {
    night: 'Night',
    day: 'Day',
    weekdays: 'Weekdays',
    weekend: 'Weekend',
    save: 'Save',
    cancel: 'Cancel',
  };
  @property() decimal = '.';

  @state() private work: EditorValues = EMPTY;
  /** `initial` as it was when the editor opened; save diffs against this, not the live value. */
  private base: EditorValues = EMPTY;

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  protected willUpdate(changed: PropertyValues) {
    if (changed.has('open') && this.open) {
      this.base = { ...this.initial };
      this.work = { ...this.initial };
    }
  }

  protected updated(changed: PropertyValues) {
    if (!changed.has('open')) return;
    if (this.open) window.addEventListener('keydown', this.onKeyDown);
    else window.removeEventListener('keydown', this.onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private close() {
    this.dispatchEvent(new CustomEvent('hrc-close', { bubbles: true, composed: true }));
  }

  private save() {
    const changed: Partial<EditorValues> = {};
    for (const key of Object.keys(this.work) as (keyof EditorValues)[]) {
      if (this.work[key] !== null && this.work[key] !== this.base[key]) changed[key] = this.work[key];
    }
    this.dispatchEvent(new CustomEvent('hrc-save', { detail: changed, bubbles: true, composed: true }));
    this.close();
  }

  private stepTemp(key: TempKey, limits: NumberLimits, dir: 1 | -1) {
    const cur = this.work[key];
    const next = cur === null ? limits.min : snap(cur + dir * limits.step, limits.step, limits.min);
    this.work = { ...this.work, [key]: Math.min(limits.max, Math.max(limits.min, next)) };
  }

  private setTime(key: TimeKey, e: Event) {
    const minutes = parseTime((e.target as HTMLInputElement).value);
    if (minutes !== null) this.work = { ...this.work, [key]: minutes };
  }

  private renderStepper(key: TempKey, cls: string, icon: string, label: string, limits: NumberLimits) {
    const v = this.work[key];
    return html`
      <div class="stepper ${cls}">
        <span class="name"><ha-icon icon=${icon}></ha-icon>${label}</span>
        <button class="minus" aria-label="−" @click=${() => this.stepTemp(key, limits, -1)}>−</button>
        <span class="val">${v === null ? '—' : `${v.toFixed(1).replace('.', this.decimal)} °C`}</span>
        <button class="plus" aria-label="+" @click=${() => this.stepTemp(key, limits, 1)}>+</button>
      </div>
    `;
  }

  private renderTime(key: TimeKey, icon: string) {
    const v = this.work[key];
    return html`
      <label class="time">
        <ha-icon icon=${icon}></ha-icon>
        <input type="time" step="600" name=${key} .value=${v === null ? '' : formatTime(v)} @change=${(e: Event) => this.setTime(key, e)} />
      </label>
    `;
  }

  protected render() {
    if (!this.open) return nothing;
    const L = this.labels;
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <div class="sheet" role="dialog" aria-modal="true">
        ${this.renderStepper('nightTemp', 'night', 'mdi:weather-night', L.night, this.nightLimits)}
        ${this.renderStepper('dayTemp', 'day', 'mdi:white-balance-sunny', L.day, this.dayLimits)}
        <div class="times">
          <span class="group">${L.weekdays}</span>
          ${this.renderTime('weekdayDay', 'mdi:white-balance-sunny')} ${this.renderTime('weekdayNight', 'mdi:weather-night')}
          <span class="group">${L.weekend}</span>
          ${this.renderTime('weekendDay', 'mdi:white-balance-sunny')} ${this.renderTime('weekendNight', 'mdi:weather-night')}
        </div>
        <div class="actions">
          <button class="cancel" @click=${this.close}>${L.cancel}</button>
          <button class="save" @click=${this.save}>${L.save}</button>
        </div>
      </div>
    `;
  }

  static styles = css`
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999;
    }
    .sheet {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1000;
      box-sizing: border-box;
      max-height: 90vh;
      overflow-y: auto;
      padding: 20px 16px calc(16px + env(safe-area-inset-bottom));
      border-radius: 20px 20px 0 0;
      background: var(--card-background-color, var(--ha-card-background, #1c1c1c));
      color: var(--primary-text-color);
      display: flex;
      flex-direction: column;
      gap: 14px;
      animation: slide-up 0.2s ease-out;
    }
    @media (min-width: 600px) {
      .sheet {
        left: 50%;
        right: auto;
        bottom: auto;
        top: 50%;
        width: 420px;
        transform: translate(-50%, -50%);
        border-radius: 20px;
        animation: none;
      }
    }
    @keyframes slide-up {
      from {
        transform: translateY(100%);
      }
      to {
        transform: translateY(0);
      }
    }
    ha-icon {
      --mdc-icon-size: 20px;
    }
    .night ha-icon,
    .time ha-icon[icon='mdi:weather-night'] {
      color: #5c6bc0;
    }
    .day ha-icon,
    .time ha-icon[icon='mdi:white-balance-sunny'] {
      color: var(--mdc-theme-secondary, var(--accent-color, #ff9800));
    }
    .stepper {
      display: grid;
      grid-template-columns: 1fr 48px 6em 48px;
      align-items: center;
      gap: 8px;
    }
    .name {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
    }
    .val {
      text-align: center;
      font-size: 20px;
      font-variant-numeric: tabular-nums;
    }
    button {
      font: inherit;
      color: inherit;
      border: none;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .plus,
    .minus {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      font-size: 24px;
      background: rgba(127, 127, 127, 0.18);
    }
    .times {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: center;
      gap: 6px 12px;
    }
    .group {
      grid-column: 1 / -1;
      font-weight: 500;
      margin-top: 4px;
    }
    .time {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }
    input[type='time'] {
      flex: 1;
      min-width: 0;
      font: inherit;
      font-size: 16px;
      padding: 8px 6px;
      border-radius: 10px;
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4));
      background: transparent;
      color: inherit;
      color-scheme: light dark;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 4px;
    }
    .actions button {
      padding: 10px 22px;
      border-radius: 22px;
      font-weight: 500;
    }
    .cancel {
      background: transparent;
    }
    .save {
      background: var(--mdc-theme-secondary, var(--accent-color, #ff9800));
      color: #fff;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'hrc-editor': HrcEditor;
  }
}
