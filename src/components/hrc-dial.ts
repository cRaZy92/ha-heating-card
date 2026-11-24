import { LitElement, html, svg, css, nothing } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { ARC_START_DEG, ARC_SWEEP_DEG, angleToValue, angularDistance, hitsArc, pointToAngle, tempColor, valueToAngle } from '../dial-math';
import type { StatusKind } from '../status';

const VB_W = 300;
const VB_H = 260;
const CX = 150;
const CY = 150;
const R = 120;
const STROKE = 24;
const HIT_TOLERANCE = 20;
/** A drag only starts within this many degrees of the knob; the rest of the arc lets the page scroll. */
const KNOB_GRAB_DEG = 30;

function polar(angleDeg: number, r = R): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function arcPath(a0: number, a1: number): string {
  if (a1 - a0 < 0.01) return '';
  const [x0, y0] = polar(a0);
  const [x1, y1] = polar(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
}

@customElement('hrc-dial')
export class HrcDial extends LitElement {
  @property({ type: Number }) value: number | null = null;
  @property({ type: Number }) min = 5;
  @property({ type: Number }) max = 30;
  @property({ type: Number }) step = 0.5;
  @property({ type: Number }) current: number | null = null;
  @property() status: StatusKind = 'idle';
  @property() statusLabel = '';
  @property({ type: Number }) expected: number | null = null;
  @property() hintLabel = '';
  @property({ type: Boolean }) pending = false;
  @property() decimal = '.';

  @state() private dragValue: number | null = null;
  private startValue: number | null = null;

  @query('svg') private svgEl!: SVGSVGElement;

  private toViewBox(clientX: number, clientY: number): [number, number] {
    const rect = this.svgEl.getBoundingClientRect();
    const scale = VB_W / (rect.width || VB_W);
    return [(clientX - rect.left) * scale, (clientY - rect.top) * scale];
  }

  private valueAt(x: number, y: number, prev: number): number {
    return angleToValue(pointToAngle(x, y, CX, CY), this.min, this.max, this.step, prev);
  }

  /** True when (x, y) is on the arc band close to the knob. */
  private grabsKnob(x: number, y: number): boolean {
    if (!hitsArc(x, y, CX, CY, R, HIT_TOLERANCE)) return false;
    const knobAngle = valueToAngle(this.value ?? this.min, this.min, this.max);
    return angularDistance(pointToAngle(x, y, CX, CY), knobAngle) <= KNOB_GRAB_DEG;
  }

  private onPointerDown = (e: PointerEvent) => {
    const [x, y] = this.toViewBox(e.clientX, e.clientY);
    if (!this.grabsKnob(x, y)) return;
    e.preventDefault();
    try {
      this.svgEl.setPointerCapture(e.pointerId);
    } catch {
      /* not supported (tests) */
    }
    this.startValue = this.value;
    this.dragValue = this.value ?? this.min; // no jump on touch; only movement changes the value
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.dragValue === null) return;
    e.preventDefault();
    const [x, y] = this.toViewBox(e.clientX, e.clientY);
    this.dragValue = this.valueAt(x, y, this.dragValue);
  };

  private onPointerUp = () => {
    if (this.dragValue === null) return;
    const value = this.dragValue;
    this.dragValue = null;
    if (value !== this.startValue) {
      this.dispatchEvent(new CustomEvent('hrc-change', { detail: { value }, bubbles: true, composed: true }));
    }
  };

  /** Block page scroll only for touches that start on the arc (backup for browsers ignoring touch-action on SVG). */
  private onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    const [x, y] = this.toViewBox(t.clientX, t.clientY);
    if (this.grabsKnob(x, y)) e.preventDefault();
  };

  protected firstUpdated() {
    this.svgEl.addEventListener('touchstart', this.onTouchStart, { passive: false });
  }

  private fmt(v: number, fixed: boolean): string {
    const s = fixed || !Number.isInteger(v) ? v.toFixed(1) : String(v);
    return s.replace('.', this.decimal);
  }

  protected render() {
    const shown = this.dragValue ?? this.value;
    const knobValue = shown ?? this.min;
    const angle = valueToAngle(knobValue, this.min, this.max);
    const inactive = this.status === 'off' || this.status === 'unavailable';
    const color = inactive ? 'var(--disabled-color, #6f6f6f)' : tempColor(knobValue, this.min, this.max);
    const [kx, ky] = polar(angle);
    const showHint = this.expected !== null && shown !== null && this.expected !== shown;
    const tick =
      this.expected !== null
        ? (() => {
            const a = valueToAngle(this.expected, this.min, this.max);
            const [x0, y0] = polar(a, R - STROKE / 2 - 4);
            const [x1, y1] = polar(a, R + STROKE / 2 + 4);
            return svg`<line class="tick" x1=${x0} y1=${y0} x2=${x1} y2=${y1}></line>`;
          })()
        : nothing;

    let intPart = '—';
    let decPart = '';
    if (shown !== null) {
      const [i, d] = shown.toFixed(1).split('.');
      intPart = i;
      decPart = `${this.decimal}${d}`;
    }

    return html`
      <div class="root status-${this.status}" style="--arc-color: ${color}">
        <svg
          viewBox="0 0 ${VB_W} ${VB_H}"
          @pointerdown=${this.onPointerDown}
          @pointermove=${this.onPointerMove}
          @pointerup=${this.onPointerUp}
          @pointercancel=${this.onPointerUp}
        >
          <path class="track" d=${arcPath(ARC_START_DEG, ARC_START_DEG + ARC_SWEEP_DEG)}></path>
          <path class="fill" d=${arcPath(ARC_START_DEG, angle)}></path>
          ${tick}
          <circle class="knob" cx=${kx} cy=${ky} r="15"></circle>
          <path class="hit" d=${arcPath(ARC_START_DEG, ARC_START_DEG + ARC_SWEEP_DEG)}></path>
        </svg>
        <div class="center">
          <div class="status">${this.statusLabel}</div>
          <p class="target ${this.pending ? 'pending' : ''}">
            <span class="displayed-value">
              <span class="int">${intPart}</span>
              <span class="addon"><span class="dec">${decPart}</span><span class="unit">°C</span></span>
            </span>
          </p>
          <div class="current">
            <ha-icon icon="mdi:thermometer"></ha-icon>
            ${this.current !== null ? `${this.fmt(this.current, true)} °C` : '—'}
          </div>
          ${showHint ? html`<div class="hint">▲ ${this.hintLabel} ${this.fmt(this.expected!, false)}°</div>` : nothing}
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      touch-action: pan-y;
    }
    .root {
      position: relative;
      max-width: 320px;
      margin: 0 auto;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      user-select: none;
      -webkit-user-select: none;
    }
    .track,
    .fill,
    .hit {
      fill: none;
      stroke-linecap: round;
    }
    .track {
      stroke: var(--divider-color, rgba(127, 127, 127, 0.25));
      stroke-width: ${STROKE};
      opacity: 0.6;
    }
    .fill {
      stroke: var(--arc-color);
      stroke-width: ${STROKE};
      transition: stroke 0.3s ease;
    }
    .hit {
      stroke: transparent;
      stroke-width: ${HIT_TOLERANCE * 2};
      pointer-events: stroke;
      cursor: grab;
    }
    .knob {
      fill: #fff;
      stroke: var(--arc-color);
      stroke-width: 6;
      touch-action: none;
      pointer-events: none;
    }
    .tick {
      stroke: var(--primary-text-color, #fff);
      stroke-width: 3;
      stroke-linecap: round;
      opacity: 0.7;
      pointer-events: none;
    }
    .center {
      position: absolute;
      left: 50%;
      top: ${(CY / VB_H) * 100}%;
      transform: translate(-50%, -50%);
      text-align: center;
      pointer-events: none;
      white-space: nowrap;
    }
    .status {
      font-size: 15px;
      font-weight: 500;
      color: var(--secondary-text-color);
      min-height: 1.2em;
    }
    /* 1:1 copy of HA's ha-big-number (frontend src/components/ha-big-number.ts). */
    .target {
      display: flex;
      justify-content: center;
      margin: 0;
      direction: ltr;
      font-size: 57px;
      line-height: 1.12;
      letter-spacing: -0.25px;
      font-weight: 400;
      color: var(--primary-text-color);
      white-space: nowrap;
    }
    .displayed-value {
      display: inline-flex;
      flex-direction: row;
      align-items: flex-end;
    }
    .addon {
      display: flex;
      flex-direction: column-reverse;
      padding: 4px 0;
    }
    .dec {
      font-size: 0.42em;
      line-height: 1.33;
      min-height: 1.33em;
    }
    .unit {
      font-size: 0.33em;
      line-height: var(--ha-line-height-condensed, 1.2);
    }
    .target.pending {
      opacity: 0.5;
    }
    .current {
      font-size: 15px;
      font-weight: 500;
      color: var(--arc-color);
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .current ha-icon {
      --mdc-icon-size: 18px;
    }
    .hint {
      font-size: 12px;
      color: var(--secondary-text-color);
      margin-top: 4px;
    }
    .status-wants_heat .status {
      color: #ffb300;
      animation: pulse 2s ease-in-out infinite;
    }
    .status-heating .status {
      color: var(--arc-color);
    }
    .status-heating .fill {
      filter: drop-shadow(0 0 6px var(--arc-color));
    }
    .status-off .int,
    .status-unavailable .int {
      color: var(--disabled-color, #6f6f6f);
    }
    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.4;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'hrc-dial': HrcDial;
  }
}
