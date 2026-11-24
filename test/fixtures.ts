export const schedule = {
  enabled: 'input_boolean.trv_izba_on_off',
  night_temp: 'input_number.trv_izba_night_temp',
  day_temp: 'input_number.trv_izba_day_temp',
  weekday: { day: 'input_datetime.trv_izba_day_time', night: 'input_datetime.trv_izba_night_time' },
  weekend: {
    day: 'input_datetime.trv_izba_day_time_weekend',
    night: 'input_datetime.trv_izba_night_time_weekend',
  },
};

export const twoTrvConfig = {
  type: 'custom:heating-room-card',
  name: 'Tech. Izba',
  icon: 'mdi:desktop-classic',
  climate: 'climate.shelly_trv_2',
  boiler: 'switch.kotol_rele',
  trvs: [
    { climate: 'climate.shelly_trv_1', valve: 'sensor.valve_1', battery: 'sensor.shelly_trv_1_battery' },
    { climate: 'climate.shelly_trv_2', valve: 'sensor.valve_2', battery: 'sensor.shelly_trv_2_battery' },
  ],
  schedule,
};

export const oneTrvConfig = {
  type: 'custom:heating-room-card',
  boiler: 'switch.kotol_rele',
  trvs: [{ climate: 'climate.shelly_trv_3', valve: 'sensor.valve_spalna', battery: 'sensor.shelly_trv_3_battery' }],
  schedule,
};
