import type { CardConfig, NormalizedConfig } from './types';

const SCHEDULE_KEYS = [
  'enabled',
  'night_temp',
  'day_temp',
  'weekday.day',
  'weekday.night',
  'weekend.day',
  'weekend.night',
];

/**
 * The schedule keys that must be set. The weekend times are optional (the weekday times then
 * apply every day), but once one of them is set, both are needed.
 */
export function requiredScheduleKeys(schedule: unknown): string[] {
  const weekend = getPath(schedule, 'weekend') as Record<string, unknown> | undefined;
  const hasWeekend = !!weekend && Object.values(weekend).some((v) => v !== undefined && v !== null && v !== '');
  return hasWeekend ? SCHEDULE_KEYS : SCHEDULE_KEYS.filter((k) => !k.startsWith('weekend.'));
}

function getPath(obj: any, path: string): unknown {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function normalizeConfig(raw: unknown): NormalizedConfig {
  if (!raw || typeof raw !== 'object') throw new Error('heating-room-card: invalid configuration');
  const cfg = raw as CardConfig;

  if (!Array.isArray(cfg.trvs) || cfg.trvs.length === 0) {
    throw new Error('heating-room-card: "trvs" must list at least one TRV');
  }
  cfg.trvs.forEach((trv, i) => {
    if (!trv || typeof trv.climate !== 'string' || !trv.climate) {
      throw new Error(`heating-room-card: trvs[${i}].climate is required`);
    }
  });

  // No schedule is fine; a schedule that is there must be complete.
  for (const key of cfg.schedule == null ? [] : requiredScheduleKeys(cfg.schedule)) {
    const value = getPath(cfg.schedule, key);
    if (typeof value !== 'string' || !value) {
      throw new Error(`heating-room-card: schedule.${key} is required`);
    }
  }

  const climate = cfg.climate ?? cfg.trvs[0].climate;
  if (!cfg.trvs.some((t) => t.climate === climate)) {
    throw new Error(`heating-room-card: climate "${climate}" must be one of the trvs`);
  }

  const showBattery = cfg.show_battery ?? 'low';
  if (showBattery !== 'low' && showBattery !== 'always') {
    throw new Error('heating-room-card: show_battery must be "low" or "always"');
  }

  return {
    ...cfg,
    show_battery: showBattery,
    climate,
    icon: cfg.icon ?? 'mdi:radiator',
    battery_warning: cfg.battery_warning ?? 25,
  };
}
