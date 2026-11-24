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
  weekend: ScheduleTimes;
}

export interface CardConfig {
  type: string;
  name?: string;
  icon?: string;
  climate?: string;
  boiler?: string;
  trvs: TrvConfig[];
  schedule: ScheduleConfig;
  battery_warning?: number;
  show_battery?: 'low' | 'always';
}

export interface NormalizedConfig extends CardConfig {
  climate: string;
  icon: string;
  battery_warning: number;
  show_battery: 'low' | 'always';
}
