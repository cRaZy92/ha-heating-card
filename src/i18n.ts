import type { Hass } from './types';

export type I18nKey =
  | 'status_unavailable'
  | 'status_off'
  | 'status_idle'
  | 'status_wants_heat'
  | 'status_heating'
  | 'weekdays'
  | 'weekend'
  | 'night'
  | 'day'
  | 'schedule_hint'
  | 'save'
  | 'cancel'
  | 'on'
  | 'off'
  | 'error_save';

const en: Record<I18nKey, string> = {
  status_unavailable: 'Unavailable',
  status_off: 'Off',
  status_idle: 'Idle',
  status_wants_heat: 'Wants heat',
  status_heating: 'Heating',
  weekdays: 'Weekdays',
  weekend: 'Weekend',
  night: 'Night',
  day: 'Day',
  schedule_hint: 'schedule',
  save: 'Save',
  cancel: 'Cancel',
  on: 'On',
  off: 'Off',
  error_save: "Couldn't save",
};

const sk: Record<I18nKey, string> = {
  status_unavailable: 'Nedostupné',
  status_off: 'Vypnuté',
  status_idle: 'Nečinné',
  status_wants_heat: 'Čaká na teplo',
  status_heating: 'Kúri',
  weekdays: 'Pracovné dni',
  weekend: 'Víkend',
  night: 'Noc',
  day: 'Deň',
  schedule_hint: 'plán',
  save: 'Uložiť',
  cancel: 'Zrušiť',
  on: 'Zap.',
  off: 'Vyp.',
  error_save: 'Nepodarilo sa uložiť',
};

function isSlovak(hass: Hass | undefined): boolean {
  return (hass?.locale?.language ?? hass?.language ?? 'en').toLowerCase().startsWith('sk');
}

export function t(hass: Hass | undefined, key: I18nKey): string {
  return (isSlovak(hass) ? sk : en)[key];
}

export function decimalSeparator(hass: Hass | undefined): string {
  return isSlovak(hass) ? ',' : '.';
}
