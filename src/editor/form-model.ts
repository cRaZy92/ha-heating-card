import type { CardConfig, Hass, HassEntity, ScheduleConfig, TrvConfig } from '../types';

/** A config while it is being edited: anything may still be missing. */
export type EditorSchedule = Partial<Omit<ScheduleConfig, 'weekday' | 'weekend'>> & {
  weekday?: Partial<ScheduleConfig['weekday']>;
  weekend?: Partial<ScheduleConfig['weekend']>;
};
export type EditorConfig = Partial<Omit<CardConfig, 'schedule' | 'trvs'>> & {
  trvs?: TrvConfig[];
  schedule?: EditorSchedule;
};

/** Flat shape used by the schedule ha-form. */
export interface ScheduleForm {
  enabled?: string;
  night_temp?: string;
  day_temp?: string;
  weekday_day?: string;
  weekday_night?: string;
  weekend_day?: string;
  weekend_night?: string;
}

const KEY_ORDER = ['type', 'name', 'icon', 'climate', 'boiler', 'temperature', 'humidity', 'trvs', 'schedule', 'show_battery', 'battery_warning'];

const HELPER_SUFFIX: [path: string, entity: (p: string) => string][] = [
  ['enabled', (p) => `input_boolean.${p}_on_off`],
  ['night_temp', (p) => `input_number.${p}_night_temp`],
  ['day_temp', (p) => `input_number.${p}_day_temp`],
  ['weekday.day', (p) => `input_datetime.${p}_day_time`],
  ['weekday.night', (p) => `input_datetime.${p}_night_time`],
  ['weekend.day', (p) => `input_datetime.${p}_day_time_weekend`],
  ['weekend.night', (p) => `input_datetime.${p}_night_time_weekend`],
];

export const SCHEDULE_PATHS = HELPER_SUFFIX.map(([path]) => path);

const isSet = (v: unknown) => v !== undefined && v !== null && v !== '';

/** Helper prefixes P for which `input_number.P_night_temp` exists. */
export function detectPrefixes(states: Record<string, HassEntity>): string[] {
  const found = new Set<string>();
  for (const id of Object.keys(states)) {
    const m = /^input_number\.(.+)_night_temp$/.exec(id);
    if (m) found.add(m[1]);
  }
  return [...found].sort();
}

/** Schedule helpers named after `prefix` that exist in HA. */
export function quickFill(prefix: string, states: Record<string, HassEntity>): EditorSchedule {
  const p = prefix.trim().replace(/_+$/, '');
  const out: EditorSchedule = {};
  if (!p) return out;
  for (const [path, entity] of HELPER_SUFFIX) {
    const id = entity(p);
    if (!states[id]) continue;
    const [a, b] = path.split('.') as [keyof EditorSchedule, 'day' | 'night' | undefined];
    if (b) (out as any)[a] = { ...((out as any)[a] ?? {}), [b]: id };
    else (out as any)[a] = id;
  }
  return out;
}

export function scheduleFormData(config: EditorConfig): ScheduleForm {
  const s = config.schedule ?? {};
  const out: ScheduleForm = {
    enabled: s.enabled,
    night_temp: s.night_temp,
    day_temp: s.day_temp,
    weekday_day: s.weekday?.day,
    weekday_night: s.weekday?.night,
    weekend_day: s.weekend?.day,
    weekend_night: s.weekend?.night,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => isSet(v)));
}

export function applyScheduleForm(config: EditorConfig, form: ScheduleForm): EditorConfig {
  return {
    ...config,
    schedule: {
      enabled: form.enabled,
      night_temp: form.night_temp,
      day_temp: form.day_temp,
      weekday: { day: form.weekday_day, night: form.weekday_night },
      weekend: { day: form.weekend_day, night: form.weekend_night },
    },
  };
}

/** Turns the schedule section on (an empty schedule to fill in) or off (no schedule at all). */
export function setUseSchedule(config: EditorConfig, on: boolean): EditorConfig {
  const next: EditorConfig = { ...config };
  if (on) next.schedule = config.schedule ?? {};
  else delete next.schedule;
  return next;
}

export function addTrv(config: EditorConfig): EditorConfig {
  return { ...config, trvs: [...(config.trvs ?? []), { climate: '' }] };
}

export function updateTrv(config: EditorConfig, index: number, trv: TrvConfig): EditorConfig {
  const trvs = [...(config.trvs ?? [])];
  const old = trvs[index];
  trvs[index] = trv;
  const next: EditorConfig = { ...config, trvs };
  if (old && config.climate && config.climate === old.climate) next.climate = trv.climate;
  return next;
}

export function removeTrv(config: EditorConfig, index: number): EditorConfig {
  const trvs = (config.trvs ?? []).filter((_, i) => i !== index);
  const next: EditorConfig = { ...config, trvs };
  if (!trvs.some((t) => t.climate === config.climate)) delete next.climate;
  return next;
}

export function setPrimary(config: EditorConfig, climate: string): EditorConfig {
  return { ...config, climate };
}

function cleanObject<T extends object>(obj: T): Partial<T> {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = cleanObject(v);
      if (Object.keys(inner).length) out[k] = inner;
    } else if (isSet(v)) out[k] = v;
  }
  return out;
}

/**
 * The config to hand back to HA: empty values dropped, keys in a stable order,
 * `climate` only kept when it picks one of two or more TRVs.
 */
export function cleanConfig(config: EditorConfig): EditorConfig {
  const c: any = cleanObject({ ...config, trvs: undefined });
  // An empty schedule still means "this room uses a schedule", so the editor keeps showing its fields.
  if (config.schedule && !c.schedule) c.schedule = {};
  if (config.trvs) {
    c.trvs = config.trvs.map((t) => {
      const trv = cleanObject(t) as TrvConfig;
      return { ...trv, climate: t.climate ?? '' };
    });
  }
  const trvs: TrvConfig[] = c.trvs ?? [];
  if (trvs.length < 2 || !trvs.some((t) => t.climate === c.climate)) delete c.climate;
  const ordered: any = {};
  for (const k of KEY_ORDER) if (k in c) ordered[k] = c[k];
  for (const k of Object.keys(c)) if (!(k in ordered)) ordered[k] = c[k];
  return ordered;
}

/** Config paths that still need a value before the card can render. */
export function configProblems(raw: unknown): string[] {
  const cfg = (raw && typeof raw === 'object' ? raw : {}) as EditorConfig;
  const problems: string[] = [];
  const trvs = Array.isArray(cfg.trvs) ? cfg.trvs : [];
  if (trvs.length === 0 || trvs.some((t) => !t || typeof t.climate !== 'string' || !t.climate)) problems.push('trvs');
  for (const path of cfg.schedule == null ? [] : SCHEDULE_PATHS) {
    const value = path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), cfg.schedule);
    if (typeof value !== 'string' || !value) problems.push(`schedule.${path}`);
  }
  return problems;
}

/** A starting config built from entities that really exist in HA. */
export function stubConfig(hass: Hass | undefined): EditorConfig {
  const states = hass?.states ?? {};
  const ids = Object.keys(states).sort();
  const climate = ids.find((id) => id.startsWith('climate.'));
  const out: EditorConfig = {};
  const boiler = ids.find((id) => /^switch\..*(boiler|kotol)/.test(id));
  if (boiler) out.boiler = boiler;
  const trv: TrvConfig = { climate: climate ?? '' };
  if (climate) {
    const battery = `sensor.${climate.slice('climate.'.length)}_battery`;
    if (states[battery]) trv.battery = battery;
  }
  out.trvs = [trv];
  const prefix = detectPrefixes(states)[0];
  if (prefix) out.schedule = quickFill(prefix, states);
  return out;
}
