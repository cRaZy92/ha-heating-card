import { describe, it, expect, beforeEach } from 'vitest';
import '../src/components/hrc-schedule';
import type { HrcSchedule } from '../src/components/hrc-schedule';
import type { ScheduleSnapshot } from '../src/schedule';

const snap: ScheduleSnapshot = {
  nightTemp: 17,
  dayTemp: 21.5,
  enabled: true,
  weekday: { day: 560, night: 1430 },
  weekend: { day: 600, night: 1380 },
};
const MONDAY = new Date(2026, 10, 30, 12, 0);
const SATURDAY = new Date(2026, 10, 28, 12, 0);

async function mount(schedule: ScheduleSnapshot = snap, now = MONDAY) {
  const el = document.createElement('hrc-schedule') as HrcSchedule;
  Object.assign(el, { schedule, now, labels: { weekdays: 'Weekdays', weekend: 'Weekend' } });
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}
const row = (el: HrcSchedule, which: 'weekday' | 'weekend') => el.shadowRoot!.querySelector(`.row.${which}`)!;

beforeEach(() => (document.body.innerHTML = ''));

describe('hrc-schedule', () => {
  it('renders one segment per timeline segment with percentage geometry', async () => {
    const el = await mount();
    const segs = row(el, 'weekday').querySelectorAll<HTMLElement>('.seg');
    expect(segs.length).toBe(3);
    expect(segs[1].classList.contains('day')).toBe(true);
    expect(segs[1].style.left).toMatch(/^38\.88/);
  });

  it('marks today row on Saturday', async () => {
    const el = await mount(snap, SATURDAY);
    expect(row(el, 'weekend').classList.contains('today')).toBe(true);
    expect(row(el, 'weekend').querySelector('.now-marker')).not.toBeNull();
    expect(row(el, 'weekday').classList.contains('today')).toBe(false);
    expect(row(el, 'weekday').querySelector('.now-marker')).toBeNull();
  });

  it('dims when schedule disabled', async () => {
    const el = await mount({ ...snap, enabled: false });
    expect(el.hasAttribute('disabled')).toBe(true);
  });

  it('shows times and temperatures', async () => {
    const el = await mount();
    const text = el.shadowRoot!.textContent!;
    expect(text).toContain('09:20–23:50');
    expect(text).toContain('17.0°');
    expect(text).toContain('21.5°');
  });

  it('null values render — and no segments', async () => {
    const el = await mount({ nightTemp: null, dayTemp: null, enabled: true, weekday: { day: null, night: 1430 }, weekend: snap.weekend });
    expect(row(el, 'weekday').querySelectorAll('.seg').length).toBe(0);
    expect(row(el, 'weekday').textContent).toContain('—');
    expect(el.shadowRoot!.querySelector('.temps')!.textContent).toContain('—');
  });

  it('click fires hrc-edit', async () => {
    const el = await mount();
    let fired = 0;
    el.addEventListener('hrc-edit', () => fired++);
    (el.shadowRoot!.querySelector('.schedule') as HTMLElement).click();
    expect(fired).toBe(1);
  });

  it('Enter key fires hrc-edit', async () => {
    const el = await mount();
    let fired = 0;
    el.addEventListener('hrc-edit', () => fired++);
    el.shadowRoot!.querySelector('.schedule')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fired).toBe(1);
  });
});
