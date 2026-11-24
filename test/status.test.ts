import { describe, it, expect } from 'vitest';
import { evaluateStatus } from '../src/status';
import { normalizeConfig } from '../src/config';
import { makeHass } from './mock-hass';
import { oneTrvConfig, twoTrvConfig } from './fixtures';

const one = normalizeConfig(oneTrvConfig);
const two = normalizeConfig(twoTrvConfig);
const noBoiler = normalizeConfig({ ...oneTrvConfig, boiler: undefined });

const trv = (action: string, state = 'heat') => [state, { hvac_action: action }] as [string, Record<string, any>];

describe('evaluateStatus', () => {
  it('primary climate missing → unavailable', () => {
    expect(evaluateStatus(makeHass({}), one)).toBe('unavailable');
  });

  it('primary climate unavailable/unknown → unavailable', () => {
    expect(evaluateStatus(makeHass({ 'climate.shelly_trv_3': ['unavailable'] }), one)).toBe('unavailable');
    expect(evaluateStatus(makeHass({ 'climate.shelly_trv_3': ['unknown'] }), one)).toBe('unavailable');
  });

  it('primary climate off → off', () => {
    expect(evaluateStatus(makeHass({ 'climate.shelly_trv_3': trv('heating', 'off'), 'switch.kotol_rele': ['on'] }), one)).toBe('off');
  });

  it('1 TRV idle → idle', () => {
    expect(evaluateStatus(makeHass({ 'climate.shelly_trv_3': trv('idle'), 'switch.kotol_rele': ['off'] }), one)).toBe('idle');
  });

  it('1 TRV heating, boiler off → wants_heat; boiler on → heating', () => {
    expect(evaluateStatus(makeHass({ 'climate.shelly_trv_3': trv('heating'), 'switch.kotol_rele': ['off'] }), one)).toBe('wants_heat');
    expect(evaluateStatus(makeHass({ 'climate.shelly_trv_3': trv('heating'), 'switch.kotol_rele': ['on'] }), one)).toBe('heating');
  });

  it('2 TRVs, only non-primary heating, boiler on → heating', () => {
    const hass = makeHass({
      'climate.shelly_trv_1': trv('heating'),
      'climate.shelly_trv_2': trv('idle'),
      'switch.kotol_rele': ['on'],
    });
    expect(evaluateStatus(hass, two)).toBe('heating');
  });

  it('2 TRVs, non-primary unavailable, primary idle → idle', () => {
    const hass = makeHass({
      'climate.shelly_trv_1': ['unavailable'],
      'climate.shelly_trv_2': trv('idle'),
      'switch.kotol_rele': ['on'],
    });
    expect(evaluateStatus(hass, two)).toBe('idle');
  });

  it('boiler on, all TRVs idle → idle', () => {
    const hass = makeHass({
      'climate.shelly_trv_1': trv('idle'),
      'climate.shelly_trv_2': trv('idle'),
      'switch.kotol_rele': ['on'],
    });
    expect(evaluateStatus(hass, two)).toBe('idle');
  });

  it('no boiler configured, TRV heating → heating', () => {
    expect(evaluateStatus(makeHass({ 'climate.shelly_trv_3': trv('heating') }), noBoiler)).toBe('heating');
  });

  it('boiler unavailable, TRV heating → wants_heat', () => {
    expect(evaluateStatus(makeHass({ 'climate.shelly_trv_3': trv('heating'), 'switch.kotol_rele': ['unavailable'] }), one)).toBe('wants_heat');
  });
});
