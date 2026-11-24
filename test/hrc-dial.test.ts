import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/components/hrc-dial';
import type { HrcDial } from '../src/components/hrc-dial';

let el: HrcDial;
let events: number[];

async function mount(props: Partial<HrcDial> = {}) {
  el = document.createElement('hrc-dial') as HrcDial;
  Object.assign(el, { value: 17.5, min: 5, max: 30, step: 0.5, current: 20.1, status: 'idle', statusLabel: 'Idle', ...props });
  events = [];
  el.addEventListener('hrc-change', (e) => events.push((e as CustomEvent<{ value: number }>).detail.value));
  document.body.appendChild(el);
  await el.updateComplete;
  svg().getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300, x: 0, y: 0, toJSON() {} }) as DOMRect;
}

const svg = () => el.shadowRoot!.querySelector('svg') as SVGSVGElement;
const text = () => el.shadowRoot!.textContent ?? '';
const valueText = () =>
  ['.int', '.dec'].map((s) => el.shadowRoot!.querySelector(s)!.textContent!).join('').replace(/\s+/g, '');

function pointer(type: string, x: number, y: number) {
  svg().dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, cancelable: true }));
}

beforeEach(() => (document.body.innerHTML = ''));
afterEach(() => el?.remove());

describe('hrc-dial', () => {
  it('pointerdown off-arc does nothing', async () => {
    await mount();
    pointer('pointerdown', 150, 150);
    pointer('pointermove', 150, 30);
    pointer('pointerup', 150, 30);
    await el.updateComplete;
    expect(events).toEqual([]);
    expect(valueText()).toBe('17.5');
  });

  it('drag on arc emits once on release', async () => {
    await mount();
    pointer('pointerdown', 150, 30);
    pointer('pointermove', 270, 150);
    await el.updateComplete;
    expect(events).toEqual([]);
    expect(valueText()).toBe('26.0');
    pointer('pointerup', 270, 150);
    expect(events).toEqual([26]);
  });

  it('release at the same value emits nothing', async () => {
    await mount();
    pointer('pointerdown', 150, 30);
    pointer('pointerup', 150, 30);
    expect(events).toEqual([]);
  });

  it('external value update during drag is ignored', async () => {
    await mount();
    pointer('pointerdown', 150, 30);
    pointer('pointermove', 270, 150);
    el.value = 10;
    await el.updateComplete;
    expect(valueText()).toBe('26.0');
    pointer('pointerup', 270, 150);
    expect(events).toEqual([26]);
  });

  it('pointerdown on the arc far from the knob does nothing (scroll-safe)', async () => {
    await mount();
    pointer('pointerdown', 30, 150); // left side of the arc, knob is at the top
    pointer('pointermove', 40, 100);
    pointer('pointerup', 40, 100);
    await el.updateComplete;
    expect(events).toEqual([]);
    expect(valueText()).toBe('17.5');
  });

  it('touching near the knob without moving does not jump the value', async () => {
    await mount();
    const a = (280 * Math.PI) / 180;
    const [x, y] = [150 + 120 * Math.cos(a), 150 + 120 * Math.sin(a)];
    pointer('pointerdown', x, y);
    await el.updateComplete;
    expect(valueText()).toBe('17.5');
    pointer('pointerup', x, y);
    expect(events).toEqual([]);
  });

  it('null value renders —', async () => {
    await mount({ value: null });
    expect(valueText()).toBe('—');
  });

  it('uses the decimal separator', async () => {
    await mount({ value: 21.5, decimal: ',' });
    expect(valueText()).toBe('21,5');
  });

  it('status class on root', async () => {
    await mount({ status: 'wants_heat', statusLabel: 'Wants heat' });
    expect(el.shadowRoot!.querySelector('.root')!.classList.contains('status-wants_heat')).toBe(true);
    expect(text()).toContain('Wants heat');
  });

  it('expected hint shown only when expected differs from value', async () => {
    await mount({ value: 21.5, expected: 17, hintLabel: 'plán' });
    expect(text()).toContain('plán 17');
    el.expected = 21.5;
    await el.updateComplete;
    expect(text()).not.toContain('plán');
  });

  it('pending dims the value', async () => {
    await mount({ pending: true });
    expect(el.shadowRoot!.querySelector('.target')!.classList.contains('pending')).toBe(true);
  });
});
