export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
}

export interface Hass {
  states: Record<string, HassEntity>;
  locale?: { language: string };
  language?: string;
  callService(domain: string, service: string, data: Record<string, unknown>): Promise<unknown>;
}

export interface TrvConfig {
  climate: string;
  valve?: string;
  battery?: string;
}

export interface ScheduleTimes {
  day: string;
  night: string;
}

export interface ScheduleConfig {
  enabled: string;
  night_temp: string;
  day_temp: string;
  weekday: ScheduleTimes;
  /** Leave out to use the weekday times every day. */
  weekend?: ScheduleTimes;
}

export interface CardConfig {
  type: string;
  name?: string;
  icon?: string;
  climate?: string;
  boiler?: string;
  /** Room temperature sensor; shown instead of the TRV's own reading. */
  temperature?: string;
  /** Room humidity sensor. */
  humidity?: string;
  trvs: TrvConfig[];
  /** Schedule helpers; leave out for a room without a schedule. */
  schedule?: ScheduleConfig;
  battery_warning?: number;
  show_battery?: 'low' | 'always';
}

export interface NormalizedConfig extends CardConfig {
  climate: string;
  icon: string;
  battery_warning: number;
  show_battery: 'low' | 'always';
}
