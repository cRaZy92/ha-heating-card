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
  | 'error_save'
  | 'ed_name'
  | 'ed_icon'
  | 'ed_boiler'
  | 'ed_temperature'
  | 'ed_humidity'
  | 'trv_offline'
  | 'trv_out_of_sync'
  | 'ed_trvs'
  | 'ed_trv'
  | 'ed_climate'
  | 'ed_valve'
  | 'ed_battery'
  | 'ed_add_trv'
  | 'ed_remove'
  | 'ed_primary'
  | 'ed_primary_help'
  | 'ed_schedule'
  | 'ed_quick_fill'
  | 'ed_quick_fill_help'
  | 'ed_enabled'
  | 'ed_night_temp'
  | 'ed_day_temp'
  | 'ed_weekday_day'
  | 'ed_weekday_night'
  | 'ed_weekend_day'
  | 'ed_weekend_night'
  | 'ed_display'
  | 'ed_show_battery'
  | 'ed_battery_low'
  | 'ed_battery_always'
  | 'ed_battery_warning'
  | 'setup_title'
  | 'setup_missing';

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
  ed_name: 'Name',
  ed_icon: 'Icon',
  ed_boiler: 'Boiler switch',
  ed_temperature: 'Room temperature sensor',
  ed_humidity: 'Room humidity sensor',
  trv_offline: 'Offline',
  trv_out_of_sync: 'Out of sync',
  ed_trvs: 'Radiator valves (TRV)',
  ed_trv: 'TRV',
  ed_climate: 'Thermostat',
  ed_valve: 'Valve position',
  ed_battery: 'Battery',
  ed_add_trv: 'Add TRV',
  ed_remove: 'Remove',
  ed_primary: 'Dial controls',
  ed_primary_help: 'The other TRVs follow it through your sync automations.',
  ed_schedule: 'Schedule',
  ed_quick_fill: 'Fill from helpers',
  ed_quick_fill_help: 'Pick the helper name prefix (e.g. trv_izba) to fill in all schedule helpers below.',
  ed_enabled: 'Schedule on/off',
  ed_night_temp: 'Night temperature',
  ed_day_temp: 'Day temperature',
  ed_weekday_day: 'Weekdays: day starts',
  ed_weekday_night: 'Weekdays: night starts',
  ed_weekend_day: 'Weekend: day starts',
  ed_weekend_night: 'Weekend: night starts',
  ed_display: 'Display',
  ed_show_battery: 'Show battery',
  ed_battery_low: 'Only when low',
  ed_battery_always: 'Always',
  ed_battery_warning: 'Low battery below (%)',
  setup_title: 'Finish setting up this card',
  setup_missing: 'Still missing',
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
  ed_name: 'Názov',
  ed_icon: 'Ikona',
  ed_boiler: 'Spínač kotla',
  ed_temperature: 'Snímač teploty v miestnosti',
  ed_humidity: 'Snímač vlhkosti v miestnosti',
  trv_offline: 'Odpojená',
  trv_out_of_sync: 'Nesúlad',
  ed_trvs: 'Termostatické hlavice (TRV)',
  ed_trv: 'Hlavica',
  ed_climate: 'Termostat',
  ed_valve: 'Poloha ventilu',
  ed_battery: 'Batéria',
  ed_add_trv: 'Pridať hlavicu',
  ed_remove: 'Odstrániť',
  ed_primary: 'Koliesko ovláda',
  ed_primary_help: 'Ostatné hlavice ju nasledujú cez synchronizačné automatizácie.',
  ed_schedule: 'Plán',
  ed_quick_fill: 'Vyplniť z pomocníkov',
  ed_quick_fill_help: 'Vyber predponu názvu pomocníkov (napr. trv_izba) a vyplnia sa všetky pomocníky plánu nižšie.',
  ed_enabled: 'Plán zap./vyp.',
  ed_night_temp: 'Nočná teplota',
  ed_day_temp: 'Denná teplota',
  ed_weekday_day: 'Pracovné dni: deň od',
  ed_weekday_night: 'Pracovné dni: noc od',
  ed_weekend_day: 'Víkend: deň od',
  ed_weekend_night: 'Víkend: noc od',
  ed_display: 'Zobrazenie',
  ed_show_battery: 'Zobraziť batériu',
  ed_battery_low: 'Len keď je slabá',
  ed_battery_always: 'Vždy',
  ed_battery_warning: 'Slabá batéria pod (%)',
  setup_title: 'Dokonči nastavenie karty',
  setup_missing: 'Ešte chýba',
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
