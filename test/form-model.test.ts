import { describe, it, expect } from 'vitest';
import {
  addTrv,
  applyScheduleForm,
  cleanConfig,
  configProblems,
  detectPrefixes,
  quickFill,
  removeTrv,
  scheduleFormData,
  setUseSchedule,
  setPrimary,
  stubConfig,
  updateTrv,
} from '../src/editor/form-model';
import { makeHass } from './mock-hass';
import { schedule, twoTrvConfig, oneTrvConfig } from './fixtures';

const helperStates = (p: string) => ({
  [`input_boolean.${p}_on_off`]: ['on'],
  [`input_number.${p}_night_temp`]: ['17'],
  [`input_number.${p}_day_temp`]: ['21'],
  [`input_datetime.${p}_day_time`]: ['09:00:00'],
  [`input_datetime.${p}_night_time`]: ['23:00:00'],
  [`input_datetime.${p}_day_time_weekend`]: ['10:00:00'],
  [`input_datetime.${p}_night_time_weekend`]: ['23:30:00'],
}) as Record<string, [string]>;

describe('detectPrefixes', () => {
  it('lists every prefix that has a night_temp input_number, sorted', () => {
    const hass = makeHass({ ...helperStates('trv_spalna'), ...helperStates('trv_izba'), 'input_number.other': ['1'] });
    expect(detectPrefixes(hass.states)).toEqual(['trv_izba', 'trv_spalna']);
  });
  it('returns nothing without helpers', () => {
    expect(detectPrefixes({})).toEqual([]);
  });
});

describe('quickFill', () => {
  it('fills all seven schedule helpers that exist', () => {
    const hass = makeHass(helperStates('trv_izba'));
    expect(quickFill('trv_izba', hass.states)).toEqual(schedule);
  });
  it('only fills helpers that exist', () => {
    const hass = makeHass({ 'input_number.room_night_temp': ['17'], 'input_boolean.room_on_off': ['on'] });
    expect(quickFill('room', hass.states)).toEqual({
      enabled: 'input_boolean.room_on_off',
      night_temp: 'input_number.room_night_temp',
    });
  });
  it('trims the prefix and ignores a trailing underscore', () => {
    const hass = makeHass(helperStates('room'));
    expect(quickFill(' room_ ', hass.states).night_temp).toBe('input_number.room_night_temp');
  });
});

describe('schedule form data', () => {
  it('flattens and unflattens the schedule', () => {
    const flat = scheduleFormData(twoTrvConfig);
    expect(flat).toEqual({
      enabled: schedule.enabled,
      night_temp: schedule.night_temp,
      day_temp: schedule.day_temp,
      weekday_day: schedule.weekday.day,
      weekday_night: schedule.weekday.night,
      weekend_day: schedule.weekend.day,
      weekend_night: schedule.weekend.night,
    });
    expect(applyScheduleForm({ type: 'x' }, flat).schedule).toEqual(schedule);
  });
  it('copes with a config without schedule', () => {
    expect(scheduleFormData({ type: 'x' })).toEqual({});
  });
});

describe('TRV list', () => {
  it('adds an empty TRV', () => {
    expect(addTrv(oneTrvConfig).trvs).toHaveLength(2);
    expect(addTrv({ type: 'x' }).trvs).toEqual([{ climate: '' }]);
  });
  it('updating the primary TRV entity moves "climate" with it', () => {
    const next = updateTrv(twoTrvConfig, 1, { ...twoTrvConfig.trvs[1], climate: 'climate.new' });
    expect(next.trvs![1].climate).toBe('climate.new');
    expect(next.climate).toBe('climate.new');
  });
  it('updating another TRV keeps "climate"', () => {
    const next = updateTrv(twoTrvConfig, 0, { climate: 'climate.new' });
    expect(next.climate).toBe('climate.shelly_trv_2');
  });
  it('removing the primary TRV drops "climate"', () => {
    const next = removeTrv(twoTrvConfig, 1);
    expect(next.trvs).toHaveLength(1);
    expect(next.climate).toBeUndefined();
  });
  it('setPrimary sets climate', () => {
    expect(setPrimary(twoTrvConfig, 'climate.shelly_trv_1').climate).toBe('climate.shelly_trv_1');
  });
  it('does not mutate the input', () => {
    const copy = structuredClone(twoTrvConfig);
    updateTrv(twoTrvConfig, 1, { climate: 'climate.z' });
    removeTrv(twoTrvConfig, 0);
    expect(twoTrvConfig).toEqual(copy);
  });
});

describe('setUseSchedule', () => {
  it('removes the schedule, or starts an empty one', () => {
    expect(setUseSchedule(oneTrvConfig, false)).not.toHaveProperty('schedule');
    expect(setUseSchedule({ type: 'x' }, true).schedule).toEqual({});
    expect(setUseSchedule(oneTrvConfig, true).schedule).toEqual(schedule);
  });
});

describe('cleanConfig', () => {
  it('drops empty values and keeps a stable key order', () => {
    const out = cleanConfig({
      battery_warning: 25,
      trvs: [{ climate: 'climate.a', valve: '', battery: undefined }],
      name: '',
      type: 'custom:heating-room-card',
      icon: 'mdi:bed',
      schedule: { enabled: 'input_boolean.a', night_temp: '', weekday: { day: '', night: '' } },
    } as any);
    expect(out).toEqual({
      type: 'custom:heating-room-card',
      icon: 'mdi:bed',
      trvs: [{ climate: 'climate.a' }],
      schedule: { enabled: 'input_boolean.a' },
      battery_warning: 25,
    });
    expect(Object.keys(out)).toEqual(['type', 'icon', 'trvs', 'schedule', 'battery_warning']);
  });
  it('drops "climate" with a single TRV or when it is not one of the TRVs', () => {
    expect(cleanConfig({ ...oneTrvConfig, climate: 'climate.shelly_trv_3' }).climate).toBeUndefined();
    expect(cleanConfig({ ...twoTrvConfig, climate: 'climate.gone' }).climate).toBeUndefined();
    expect(cleanConfig(twoTrvConfig).climate).toBe('climate.shelly_trv_2');
  });
  it('keeps an empty schedule, which means "use a schedule"', () => {
    expect(cleanConfig({ type: 'x', schedule: { weekday: { day: '' } } } as any).schedule).toEqual({});
    expect(cleanConfig({ type: 'x' })).not.toHaveProperty('schedule');
  });
  it('keeps an empty TRV row so a just-added TRV stays visible', () => {
    expect(cleanConfig({ type: 'x', trvs: [{ climate: 'climate.a' }, { climate: '' }] } as any).trvs).toEqual([
      { climate: 'climate.a' },
      { climate: '' },
    ]);
  });
});

describe('configProblems', () => {
  it('is empty for a complete config', () => {
    expect(configProblems(twoTrvConfig)).toEqual([]);
    expect(configProblems(oneTrvConfig)).toEqual([]);
  });
  it('accepts a room without a schedule', () => {
    const { schedule: _, ...noSchedule } = oneTrvConfig;
    expect(configProblems(noSchedule)).toEqual([]);
  });
  it('weekend times are optional, but both or neither', () => {
    const { weekend: _, ...everyDay } = schedule;
    expect(configProblems({ ...oneTrvConfig, schedule: everyDay })).toEqual([]);
    expect(configProblems({ ...oneTrvConfig, schedule: { ...everyDay, weekend: { day: schedule.weekend.day } } })).toEqual([
      'schedule.weekend.night',
    ]);
  });
  it('an empty schedule still needs filling in', () => {
    expect(configProblems({ ...oneTrvConfig, schedule: {} })).toContain('schedule.enabled');
  });
  it('lists every missing field', () => {
    expect(configProblems({ type: 'x', trvs: [{ climate: '' }], schedule: { enabled: 'input_boolean.a' } })).toEqual([
      'trvs',
      'schedule.night_temp',
      'schedule.day_temp',
      'schedule.weekday.day',
      'schedule.weekday.night',
    ]);
  });
});

describe('stubConfig', () => {
  it('uses real entities from hass', () => {
    const hass = makeHass({
      'climate.trv_obyvacka': ['heat'],
      'sensor.trv_obyvacka_battery': ['80'],
      'switch.kotol_rele': ['off'],
      ...helperStates('trv_izba'),
    });
    expect(stubConfig(hass)).toEqual({
      boiler: 'switch.kotol_rele',
      trvs: [{ climate: 'climate.trv_obyvacka', battery: 'sensor.trv_obyvacka_battery' }],
      schedule,
    });
  });
  it('never invents entity ids', () => {
    expect(stubConfig(makeHass({}))).toEqual({ trvs: [{ climate: '' }] });
    expect(stubConfig(undefined)).toEqual({ trvs: [{ climate: '' }] });
  });
});
