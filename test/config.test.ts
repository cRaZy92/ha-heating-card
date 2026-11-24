import { describe, it, expect } from 'vitest';
import { normalizeConfig } from '../src/config';
import { schedule } from './fixtures';

const base = { type: 'custom:heating-room-card', schedule };

describe('normalizeConfig', () => {
  it('single TRV: climate defaults to trvs[0].climate', () => {
    expect(normalizeConfig({ ...base, trvs: [{ climate: 'climate.a' }] }).climate).toBe('climate.a');
  });

  it('two TRVs: explicit climate kept', () => {
    const cfg = normalizeConfig({ ...base, climate: 'climate.b', trvs: [{ climate: 'climate.a' }, { climate: 'climate.b' }] });
    expect(cfg.climate).toBe('climate.b');
  });

  it('defaults', () => {
    const cfg = normalizeConfig({ ...base, trvs: [{ climate: 'climate.a' }] });
    expect(cfg.icon).toBe('mdi:radiator');
    expect(cfg.battery_warning).toBe(25);
  });

  it('show_battery defaults to low and accepts always', () => {
    expect(normalizeConfig({ ...base, trvs: [{ climate: 'climate.a' }] }).show_battery).toBe('low');
    expect(normalizeConfig({ ...base, show_battery: 'always', trvs: [{ climate: 'climate.a' }] }).show_battery).toBe('always');
  });

  it('throws on invalid show_battery', () => {
    expect(() => normalizeConfig({ ...base, show_battery: 'sometimes', trvs: [{ climate: 'climate.a' }] })).toThrow(/show_battery/);
  });

  it('throws when trvs missing or empty', () => {
    expect(() => normalizeConfig({ ...base })).toThrow(/trvs/);
    expect(() => normalizeConfig({ ...base, trvs: [] })).toThrow(/trvs/);
  });

  it('throws when schedule key missing', () => {
    const bad = { ...schedule, weekend: { day: schedule.weekend.day } };
    expect(() => normalizeConfig({ ...base, schedule: bad, trvs: [{ climate: 'climate.a' }] })).toThrow(
      /schedule.weekend.night/,
    );
  });

  it('throws when climate not among trvs', () => {
    expect(() => normalizeConfig({ ...base, climate: 'climate.x', trvs: [{ climate: 'climate.a' }] })).toThrow(/climate/);
  });
});
