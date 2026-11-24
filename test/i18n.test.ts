import { describe, it, expect } from 'vitest';
import { t } from '../src/i18n';
import { makeHass } from './mock-hass';

describe('t', () => {
  it('Slovak when language is sk', () => {
    expect(t(makeHass({}, 'sk'), 'status_wants_heat')).toBe('Čaká na teplo');
  });
  it('English for other languages', () => {
    expect(t(makeHass({}, 'en-GB'), 'status_wants_heat')).toBe('Wants heat');
  });
  it('English without hass', () => {
    expect(t(undefined, 'weekend')).toBe('Weekend');
  });
});

import { decimalSeparator } from '../src/i18n';
describe('error label', () => {
  it('Slovak and English', () => {
    expect(t(makeHass({}, 'sk'), 'error_save')).toBe('Nepodarilo sa uložiť');
    expect(t(makeHass({}, 'en'), 'error_save')).toBe("Couldn't save");
  });
});

describe('decimalSeparator', () => {
  it('comma for Slovak, dot otherwise', () => {
    expect(decimalSeparator(makeHass({}, 'sk'))).toBe(',');
    expect(decimalSeparator(makeHass({}, 'en'))).toBe('.');
  });
});
