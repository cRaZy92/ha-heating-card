import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/editor/heating-room-card-editor';
import type { HeatingRoomCardEditor } from '../src/editor/heating-room-card-editor';
import { makeHass } from './mock-hass';
import { schedule, twoTrvConfig, oneTrvConfig } from './fixtures';

let editor: HeatingRoomCardEditor;
let changes: any[];

async function mount(config: any, lang = 'en', extra: Record<string, [string, Record<string, any>?]> = {}) {
  editor = document.createElement('heating-room-card-editor') as HeatingRoomCardEditor;
  editor.hass = makeHass(
    {
      'climate.shelly_trv_1': ['heat', { friendly_name: 'TRV one' }],
      'climate.shelly_trv_2': ['heat', { friendly_name: 'TRV two' }],
      'input_boolean.trv_izba_on_off': ['on'],
      'input_number.trv_izba_night_temp': ['17'],
      'input_number.trv_izba_day_temp': ['21'],
      'input_datetime.trv_izba_day_time': ['09:00:00'],
      'input_datetime.trv_izba_night_time': ['23:00:00'],
      'input_datetime.trv_izba_day_time_weekend': ['10:00:00'],
      'input_datetime.trv_izba_night_time_weekend': ['23:30:00'],
      ...extra,
    },
    lang,
  );
  editor.setConfig(config);
  changes = [];
  editor.addEventListener('config-changed', (e: any) => changes.push(e.detail.config));
  document.body.appendChild(editor);
  await editor.updateComplete;
}

const root = () => editor.shadowRoot!;
const form = (section: string) => root().querySelector(`ha-form[data-section="${section}"]`) as any;
const trvForms = () => [...root().querySelectorAll('ha-form[data-section="trv"]')] as any[];
const last = () => changes[changes.length - 1];

function emit(el: Element, value: unknown) {
  el.dispatchEvent(new CustomEvent('value-changed', { detail: { value }, bubbles: true, composed: true }));
}

afterEach(() => editor?.remove());

describe('heating-room-card-editor', () => {
  beforeEach(async () => mount(twoTrvConfig));

  it('renders a form per section with the current values', () => {
    expect(form('general').data).toEqual({ name: 'Tech. Izba', icon: 'mdi:desktop-classic', boiler: 'switch.kotol_rele' });
    expect(trvForms().map((f) => f.data.climate)).toEqual(['climate.shelly_trv_1', 'climate.shelly_trv_2']);
    expect(form('primary').data).toEqual({ primary: 'climate.shelly_trv_2' });
    expect(form('primary').computeLabel(form('primary').schema[0])).toBe('Dial controls');
    expect(form('schedule').data.weekend_night).toBe(schedule.weekend.night);
    expect(form('display').data).toEqual({ show_battery: 'low', battery_warning: 25 });
    expect(form('general').hass).toBe(editor.hass);
  });

  it('schedule pickers are laid out in pairs, never more than two columns', () => {
    const grids = form('schedule').schema.filter((s: any) => s.type === 'grid');
    expect(grids.map((g: any) => g.schema.map((f: any) => f.name))).toEqual([
      ['night_temp', 'day_temp'],
      ['weekday_day', 'weekday_night'],
      ['weekend_day', 'weekend_night'],
    ]);
  });

  it('entity pickers are limited to the right domains', () => {
    const sel = (f: any, name: string) => f.schema.flatMap((s: any) => s.schema ?? [s]).find((s: any) => s.name === name).selector;
    expect(sel(form('general'), 'boiler').entity.filter.domain).toEqual(['switch', 'input_boolean']);
    expect(sel(trvForms()[0], 'climate').entity.filter.domain).toBe('climate');
    expect(sel(trvForms()[0], 'battery').entity.filter).toEqual({ domain: 'sensor', device_class: 'battery' });
    expect(sel(form('schedule'), 'enabled').entity.filter.domain).toBe('input_boolean');
    expect(sel(form('schedule'), 'night_temp').entity.filter.domain).toBe('input_number');
    expect(sel(form('schedule'), 'weekday_day').entity.filter.domain).toBe('input_datetime');
  });

  it('labels follow the HA language', async () => {
    editor.remove();
    await mount(twoTrvConfig, 'sk');
    expect(form('general').computeLabel({ name: 'boiler' })).toBe('Spínač kotla');
    expect(form('schedule').computeLabel({ name: 'weekend_day' })).toBe('Víkend: deň od');
  });

  it('general changes fire config-changed with a clean config', () => {
    emit(form('general'), { name: '', icon: 'mdi:bed', boiler: 'switch.kotol_rele' });
    expect(last().name).toBeUndefined();
    expect(last().icon).toBe('mdi:bed');
    expect(last().type).toBe('custom:heating-room-card');
    expect(last().trvs).toEqual(twoTrvConfig.trvs);
  });

  it('editing a TRV updates that TRV only', () => {
    emit(trvForms()[0], { climate: 'climate.shelly_trv_1', valve: 'sensor.v' });
    expect(last().trvs[0]).toEqual({ climate: 'climate.shelly_trv_1', valve: 'sensor.v' });
    expect(last().trvs[1]).toEqual(twoTrvConfig.trvs[1]);
  });

  it('add and remove TRVs', async () => {
    (root().querySelector('button.add') as HTMLButtonElement).click();
    await editor.updateComplete;
    expect(trvForms()).toHaveLength(3);
    expect(last().trvs).toHaveLength(3);
    (root().querySelectorAll('button.remove')[1] as HTMLButtonElement).click();
    await editor.updateComplete;
    expect(last().trvs.map((t: any) => t.climate)).toEqual(['climate.shelly_trv_1', '']);
    expect(last().climate).toBeUndefined();
  });

  it('a single TRV has no remove button and no primary picker', async () => {
    editor.remove();
    await mount(oneTrvConfig);
    expect(root().querySelectorAll('button.remove')).toHaveLength(0);
    expect(form('primary')).toBeNull();
  });

  it('primary picker offers the TRVs by name and sets climate', () => {
    const opts = form('primary').schema[0].selector.select.options;
    expect(opts).toEqual([
      { value: 'climate.shelly_trv_1', label: 'TRV one' },
      { value: 'climate.shelly_trv_2', label: 'TRV two' },
    ]);
    emit(form('primary'), { primary: 'climate.shelly_trv_1' });
    expect(last().climate).toBe('climate.shelly_trv_1');
  });

  it('schedule changes write the nested schedule', () => {
    emit(form('schedule'), { ...form('schedule').data, weekend_day: 'input_datetime.x' });
    expect(last().schedule.weekend).toEqual({ day: 'input_datetime.x', night: schedule.weekend.night });
  });

  it('quick fill offers detected prefixes and fills the schedule', async () => {
    editor.remove();
    await mount({ type: 'custom:heating-room-card', trvs: [{ climate: 'climate.shelly_trv_1' }], schedule: {} });
    const qf = form('quick_fill');
    expect(qf.schema[0].selector.select.options).toEqual([{ value: 'trv_izba', label: 'trv_izba' }]);
    expect(qf.schema[0].selector.select.custom_value).toBe(true);
    emit(qf, { quick_fill: 'trv_izba' });
    expect(last().schedule).toEqual(schedule);
    await editor.updateComplete;
    expect(form('schedule').data.enabled).toBe(schedule.enabled);
  });

  it('general form sets the room temperature and humidity sensors', () => {
    const sel = (f: any, name: string) => f.schema.flatMap((s: any) => s.schema ?? [s]).find((s: any) => s.name === name).selector;
    const temp = sel(form('general'), 'temperature');
    expect(temp.entity.filter).toEqual({ domain: 'sensor', device_class: 'temperature' });
    expect(sel(form('general'), 'humidity').entity.filter).toEqual({ domain: 'sensor', device_class: 'humidity' });
    emit(form('general'), { name: 'Tech. Izba', temperature: 'sensor.room_temp', humidity: 'sensor.room_hum' });
    expect(last().temperature).toBe('sensor.room_temp');
    expect(last().humidity).toBe('sensor.room_hum');
    expect(Object.keys(last()).slice(0, 5)).toEqual(['type', 'name', 'climate', 'temperature', 'humidity']);
  });

  it('display changes', () => {
    emit(form('display'), { show_battery: 'always', battery_warning: 30 });
    expect(last().show_battery).toBe('always');
    expect(last().battery_warning).toBe(30);
  });

  it('accepts an empty config without crashing', async () => {
    editor.remove();
    await mount({ type: 'custom:heating-room-card' });
    expect(trvForms()).toHaveLength(0);
    expect(form('use_schedule').data).toEqual({ use_schedule: false });
    expect(form('schedule')).toBeNull();
  });

  it('the schedule can be turned off and back on', async () => {
    expect(form('use_schedule').data).toEqual({ use_schedule: true });
    emit(form('use_schedule'), { use_schedule: false });
    expect(last()).not.toHaveProperty('schedule');
    await editor.updateComplete;
    expect(form('schedule')).toBeNull();
    expect(form('quick_fill')).toBeNull();

    emit(form('use_schedule'), { use_schedule: true });
    expect(last().schedule).toEqual({});
    await editor.updateComplete;
    expect(form('schedule').data).toEqual({});
    expect(form('quick_fill')).not.toBeNull();
  });
});
