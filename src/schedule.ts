import type { Hass, NormalizedConfig } from './types';

export const DAY_MINUTES = 1440;

export function parseTime(value: string | undefined | null): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export type Period = 'day' | 'night';

export interface Segment {
  start: number;
  end: number;
  period: Period;
}

export function timelineSegments(dayStart: number, nightStart: number): Segment[] {
  if (dayStart === nightStart) return [{ start: 0, end: DAY_MINUTES, period: 'night' }];
  const raw: Segment[] =
    dayStart < nightStart
      ? [
          { start: 0, end: dayStart, period: 'night' },
          { start: dayStart, end: nightStart, period: 'day' },
          { start: nightStart, end: DAY_MINUTES, period: 'night' },
        ]
      : [
          { start: 0, end: nightStart, period: 'day' },
          { start: nightStart, end: dayStart, period: 'night' },
          { start: dayStart, end: DAY_MINUTES, period: 'day' },
        ];
  return raw.filter((s) => s.end > s.start);
}

export function periodAt(nowMin: number, dayStart: number, nightStart: number): Period {
  if (dayStart === nightStart) return 'night';
  if (dayStart < nightStart) return nowMin >= dayStart && nowMin < nightStart ? 'day' : 'night';
  return nowMin >= nightStart && nowMin < dayStart ? 'night' : 'day';
}

export interface ScheduleSnapshot {
  nightTemp: number | null;
  dayTemp: number | null;
  enabled: boolean;
  weekday: { day: number | null; night: number | null };
  weekend: { day: number | null; night: number | null };
}

function num(hass: Hass, id: string): number | null {
  const s = hass.states[id]?.state;
  if (s === undefined || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function time(hass: Hass, id: string): number | null {
  return parseTime(hass.states[id]?.state);
}

export function readSchedule(hass: Hass, cfg: NormalizedConfig): ScheduleSnapshot | null {
  const s = cfg.schedule;
  if (!s) return null;
  return {
    nightTemp: num(hass, s.night_temp),
    dayTemp: num(hass, s.day_temp),
    enabled: hass.states[s.enabled]?.state === 'on',
    weekday: { day: time(hass, s.weekday.day), night: time(hass, s.weekday.night) },
    weekend: { day: time(hass, s.weekend.day), night: time(hass, s.weekend.night) },
  };
}

export function expectedTemp(s: ScheduleSnapshot, now: Date): number | null {
  if (!s.enabled) return null;
  const times = isWeekend(now) ? s.weekend : s.weekday;
  if (times.day === null || times.night === null) return null;
  const period = periodAt(now.getHours() * 60 + now.getMinutes(), times.day, times.night);
  return period === 'day' ? s.dayTemp : s.nightTemp;
}
