import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { DAY_MINUTES, formatTime, isWeekend, timelineSegments, type ScheduleSnapshot } from '../schedule';

type RowKind = 'weekday' | 'weekend' | 'every-day';

@customElement('hrc-schedule')
export class HrcSchedule extends LitElement {
  @property({ attribute: false }) schedule!: ScheduleSnapshot;
  @property({ attribute: false }) now: Date = new Date();
  @property({ attribute: false }) labels: { weekdays: string; weekend: string; everyDay?: string } = {
    weekdays: 'Weekdays',
    weekend: 'Weekend',
    everyDay: 'Every day',
  };
  @property() decimal = '.';

  protected willUpdate(changed: PropertyValues) {
    if (changed.has('schedule')) this.toggleAttribute('disabled', !this.schedule?.enabled);
  }

  private temp(v: number | null): string {
    return v === null ? '—' : `${v.toFixed(1).replace('.', this.decimal)}°`;
  }

  private edit() {
    this.dispatchEvent(new CustomEvent('hrc-edit', { bubbles: true, composed: true }));
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.edit();
    }
  }

  private renderRow(kind: RowKind) {
    const times = (kind === 'weekend' ? this.schedule.weekend : this.schedule.weekday) ?? { day: null, night: null };
    const label =
      kind === 'every-day' ? (this.labels.everyDay ?? 'Every day') : kind === 'weekday' ? this.labels.weekdays : this.labels.weekend;
    const today = kind === 'every-day' || isWeekend(this.now) === (kind === 'weekend');
    const complete = times.day !== null && times.night !== null;
    const segs = complete ? timelineSegments(times.day!, times.night!) : [];
    const nowPct = ((this.now.getHours() * 60 + this.now.getMinutes()) / DAY_MINUTES) * 100;
    const range = complete ? `${formatTime(times.day!)}–${formatTime(times.night!)}` : '—';

    return html`
      <div class="row ${kind} ${today ? 'today' : ''}">
        <span class="label">${label}</span>
        <div class="bar">
          ${segs.map(
            (s) => html`<div
              class="seg ${s.period}"
              style="left: ${(s.start / DAY_MINUTES) * 100}%; width: ${((s.end - s.start) / DAY_MINUTES) * 100}%"
            ></div>`,
          )}
          ${today ? html`<div class="now-marker" style="left: ${nowPct}%"></div>` : nothing}
        </div>
        <span class="range">${range}</span>
      </div>
    `;
  }

  protected render() {
    if (!this.schedule) return nothing;
    return html`
      <div class="schedule" role="button" tabindex="0" @click=${this.edit} @keydown=${this.onKey}>
        <div class="temps">
          <span class="t night"><ha-icon icon="mdi:weather-night"></ha-icon>${this.temp(this.schedule.nightTemp)}</span>
          <span class="t day"><ha-icon icon="mdi:white-balance-sunny"></ha-icon>${this.temp(this.schedule.dayTemp)}</span>
          <ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon>
        </div>
        ${this.schedule.weekend ? html`${this.renderRow('weekday')} ${this.renderRow('weekend')}` : this.renderRow('every-day')}
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      --night-color: #5c6bc0;
      --day-color: var(--mdc-theme-secondary, var(--accent-color, #ff9800));
    }
    :host([disabled]) .schedule {
      opacity: 0.5;
    }
    .schedule {
      cursor: pointer;
      border-radius: 12px;
      padding: 8px 12px;
      outline: none;
      -webkit-tap-highlight-color: transparent;
    }
    .schedule:focus-visible,
    .schedule:hover {
      background: rgba(127, 127, 127, 0.08);
    }
    .temps {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 15px;
      font-weight: 500;
      color: var(--primary-text-color);
      margin-bottom: 6px;
    }
    .t {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .t ha-icon {
      --mdc-icon-size: 18px;
    }
    .night ha-icon {
      color: var(--night-color);
    }
    .day ha-icon {
      color: var(--day-color);
    }
    .chevron {
      margin-left: auto;
      color: var(--secondary-text-color);
    }
    .row {
      display: grid;
      grid-template-columns: 6.5em 1fr auto;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--secondary-text-color);
      padding: 3px 0;
    }
    .row.today {
      color: var(--primary-text-color);
      font-weight: 500;
    }
    .label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bar {
      position: relative;
      height: 10px;
      border-radius: 5px;
      overflow: hidden;
      background: var(--divider-color, rgba(127, 127, 127, 0.25));
    }
    .row:not(.today) .bar {
      opacity: 0.6;
    }
    .seg {
      position: absolute;
      top: 0;
      bottom: 0;
    }
    .seg.night {
      background: var(--night-color);
    }
    .seg.day {
      background: var(--day-color);
    }
    .now-marker {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      margin-left: -1px;
      background: var(--primary-text-color, #fff);
    }
    .range {
      font-variant-numeric: tabular-nums;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'hrc-schedule': HrcSchedule;
  }
}
