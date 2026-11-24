import { describe, it, expect } from 'vitest';
import {
  parseTime, formatTime, isWeekend, timelineSegments, periodAt, readSchedule, expectedTemp,
  type ScheduleSnapshot,
} from '../src/schedule';
import { normalizeConfig } from '../src/config';
import { makeHass } from './mock-hass';
import { oneTrvConfig, schedule } from './fixtures';

describe('parseTime / formatTime', () => {
  it('parses HH:MM:SS and HH:MM', () => {
    expect(parseTime('09:20:00')).toBe(560);
    expect(parseTime('23:50')).toBe(1430);
  });
  it('returns null for invalid input', () => {
    expect(parseTime('unknown')).toBeNull();
    expect(parseTime(undefined)).toBeNull();
    expect(parseTime(null)).toBeNull();
  });
  it('formats minutes', () => {
    expect(formatTime(5)).toBe('00:05');
    expect(formatTime(560)).toBe('09:20');
  });
});

describe('isWeekend', () => {
  it('Saturday is weekend, Monday is not', () => {
    expect(isWeekend(new Date(2026, 10, 28))).toBe(true);
    expect(isWeekend(new Date(2026, 10, 29))).toBe(true);
    expect(isWeekend(new Date(2026, 10, 30))).toBe(false);
  });
});

describe('timelineSegments', () => {
  it('normal day', () => {
    expect(timelineSegments(560, 1430)).toEqual([
      { start: 0, end: 560, period: 'night' },
      { start: 560, end: 1430, period: 'day' },
      { start: 1430, end: 1440, period: 'night' },
    ]);
  });
  it('day period wraps past midnight', () => {
    expect(timelineSegments(1200, 120)).toEqual([
      { start: 0, end: 120, period: 'day' },
      { start: 120, end: 1200, period: 'night' },
      { start: 1200, end: 1440, period: 'day' },
    ]);
  });
  it('equal times → all night', () => {
    expect(timelineSegments(600, 600)).toEqual([{ start: 0, end: 1440, period: 'night' }]);
  });
  it('drops zero-length segments', () => {
    expect(timelineSegments(0, 1440 - 10)).toEqual([
      { start: 0, end: 1430, period: 'day' },
      { start: 1430, end: 1440, period: 'night' },
    ]);
  });
});

describe('periodAt', () => {
  it('boundaries belong to the period that starts there', () => {
    expect(periodAt(560, 560, 1430)).toBe('day');
    expect(periodAt(1430, 560, 1430)).toBe('night');
    expect(periodAt(559, 560, 1430)).toBe('night');
  });
  it('wrapping day period', () => {
    expect(periodAt(60, 1200, 120)).toBe('day');
    expect(periodAt(600, 1200, 120)).toBe('night');
  });
});

describe('expectedTemp', () => {
  const snap: ScheduleSnapshot = {
    nightTemp: 17,
    dayTemp: 21.5,
    enabled: true,
    weekday: { day: 560, night: 1430 },
    weekend: { day: 600, night: 1380 },
  };
  it('Saturday 09:30 uses weekend times → night', () => {
    expect(expectedTemp(snap, new Date(2026, 10, 28, 9, 30))).toBe(17);
  });
  it('Monday 09:30 uses weekday times → day', () => {
    expect(expectedTemp(snap, new Date(2026, 10, 30, 9, 30))).toBe(21.5);
  });
  it('disabled → null', () => {
    expect(expectedTemp({ ...snap, enabled: false }, new Date(2026, 10, 30, 9, 30))).toBeNull();
  });
  it('missing day temp during day → null', () => {
    expect(expectedTemp({ ...snap, dayTemp: null }, new Date(2026, 10, 30, 9, 30))).toBeNull();
  });
  it('missing times → null', () => {
    expect(expectedTemp({ ...snap, weekday: { day: null, night: 1430 } }, new Date(2026, 10, 30, 9, 30))).toBeNull();
  });
});

describe('readSchedule', () => {
  const cfg = normalizeConfig(oneTrvConfig);
  it('reads helper states', () => {
    const hass = makeHass({
      [schedule.enabled]: ['on'],
      [schedule.night_temp]: ['17.0'],
      [schedule.day_temp]: ['21.5'],
      [schedule.weekday.day]: ['09:20:00'],
      [schedule.weekday.night]: ['23:50:00'],
      [schedule.weekend.day]: ['10:00:00'],
      [schedule.weekend.night]: ['23:00:00'],
    });
    expect(readSchedule(hass, cfg)).toEqual({
      nightTemp: 17,
      dayTemp: 21.5,
      enabled: true,
      weekday: { day: 560, night: 1430 },
      weekend: { day: 600, night: 1380 },
    });
  });
  it('missing entities → nulls, disabled', () => {
    expect(readSchedule(makeHass({ [schedule.enabled]: ['off'] }), cfg)).toEqual({
      nightTemp: null,
      dayTemp: null,
      enabled: false,
      weekday: { day: null, night: null },
      weekend: { day: null, night: null },
    });
  });
});
