import { describe, it, expect, beforeEach } from 'vitest';
import '../src/components/hrc-editor';
import type { HrcEditor, EditorValues } from '../src/components/hrc-editor';

const initial: EditorValues = {
  nightTemp: 17, dayTemp: 21.5, weekdayDay: 560, weekdayNight: 1430, weekendDay: 600, weekendNight: 1380,
};
const limits = { min: 5, max: 18, step: 0.5 };

let el: HrcEditor;
let saves: Partial<EditorValues>[];
let closes: number;

async function mount(open = true) {
  el = document.createElement('hrc-editor') as HrcEditor;
  Object.assign(el, {
    initial, nightLimits: limits, dayLimits: { min: 5, max: 30, step: 0.5 },
    labels: { night: 'Night', day: 'Day', weekdays: 'Weekdays', weekend: 'Weekend', save: 'Save', cancel: 'Cancel' },
  });
  saves = [];
  closes = 0;
  el.addEventListener('hrc-save', (e) => saves.push((e as CustomEvent).detail));
  el.addEventListener('hrc-close', () => closes++);
  document.body.appendChild(el);
  el.open = open;
  await el.updateComplete;
}
const $ = <T extends Element = HTMLElement>(sel: string) => el.shadowRoot!.querySelector(sel) as T | null;
const click = async (sel: string) => {
  ($(sel) as HTMLElement).click();
  await el.updateComplete;
};

beforeEach(() => (document.body.innerHTML = ''));

describe('hrc-editor', () => {
  it('renders nothing when closed', async () => {
    await mount(false);
    expect($('.sheet')).toBeNull();
  });

  it('stepper changes are saved', async () => {
    await mount();
    await click('.stepper.night .plus');
    await click('.stepper.night .plus');
    await click('.save');
    expect(saves).toEqual([{ nightTemp: 18 }]);
    expect(closes).toBe(1);
  });

  it('stepper clamps at max', async () => {
    await mount();
    for (let i = 0; i < 5; i++) await click('.stepper.night .plus');
    expect($('.stepper.night .val')!.textContent).toContain('18');
    await click('.save');
    expect(saves).toEqual([{ nightTemp: 18 }]);
  });

  it('time input changes are saved as minutes', async () => {
    await mount();
    const input = $<HTMLInputElement>('input[name="weekdayDay"]')!;
    expect(input.value).toBe('09:20');
    input.value = '09:30';
    input.dispatchEvent(new Event('change'));
    await click('.save');
    expect(saves).toEqual([{ weekdayDay: 570 }]);
  });

  it('save with nothing changed sends empty object and closes', async () => {
    await mount();
    await click('.save');
    expect(saves).toEqual([{}]);
    expect(closes).toBe(1);
  });

  it('cancel closes without saving', async () => {
    await mount();
    await click('.stepper.night .plus');
    await click('.cancel');
    expect(saves).toEqual([]);
    expect(closes).toBe(1);
  });

  it('backdrop click closes without saving', async () => {
    await mount();
    await click('.backdrop');
    expect(saves).toEqual([]);
    expect(closes).toBe(1);
  });

  it('Escape closes without saving', async () => {
    await mount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(saves).toEqual([]);
    expect(closes).toBe(1);
  });

  it('external change while open is not reverted on save', async () => {
    await mount();
    el.initial = { ...initial, dayTemp: 22 };
    await el.updateComplete;
    const input = $<HTMLInputElement>('input[name="weekdayDay"]')!;
    input.value = '09:30';
    input.dispatchEvent(new Event('change'));
    await click('.save');
    expect(saves).toEqual([{ weekdayDay: 570 }]);
  });

  it('reopening resets the working copy', async () => {
    await mount();
    await click('.stepper.night .plus');
    el.open = false;
    await el.updateComplete;
    el.open = true;
    await el.updateComplete;
    await click('.save');
    expect(saves).toEqual([{}]);
  });
});
