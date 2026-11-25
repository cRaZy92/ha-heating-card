import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../src/heating-room-card';
import type { HeatingRoomCard } from '../src/heating-room-card';
import type { HrcDial } from '../src/components/hrc-dial';
import { makeHass, type MockHass } from './mock-hass';
import { oneTrvConfig, twoTrvConfig, schedule } from './fixtures';

const climateAttrs = (temp: number | null, action = 'idle') => ({
  hvac_action: action, temperature: temp, current_temperature: 21.7, min_temp: 5, max_temp: 30,
  target_temp_step: 0.5, friendly_name: 'TRV',
});

function scheduleStates(enabled = 'on') {
  return {
    [schedule.enabled]: [enabled],
    [schedule.night_temp]: ['17.0', { min: 5, max: 25, step: 0.5 }],
    [schedule.day_temp]: ['21.5', { min: 5, max: 25, step: 0.5 }],
    [schedule.weekday.day]: ['09:20:00'],
    [schedule.weekday.night]: ['23:50:00'],
    [schedule.weekend.day]: ['10:00:00'],
    [schedule.weekend.night]: ['23:00:00'],
  } as Record<string, [string, Record<string, any>?]>;
}

function twoTrvHass(over: Record<string, [string, Record<string, any>?]> = {}): MockHass {
  return makeHass({
    'climate.shelly_trv_1': ['heat', climateAttrs(21.5)],
    'climate.shelly_trv_2': ['heat', climateAttrs(21.5)],
    'switch.kotol_rele': ['off'],
    'sensor.valve_1': ['36'],
    'sensor.valve_2': ['43'],
    'sensor.shelly_trv_1_battery': ['92'],
    'sensor.shelly_trv_2_battery': ['80'],
    ...scheduleStates(),
    ...over,
  });
}

function oneTrvHass(): MockHass {
  return makeHass({
    'climate.shelly_trv_3': ['heat', climateAttrs(20)],
    'switch.kotol_rele': ['off'],
    'sensor.valve_spalna': ['12'],
    'sensor.shelly_trv_3_battery': ['70'],
    ...scheduleStates(),
  });
}

let card: HeatingRoomCard;

async function mount(config: object, hass: MockHass) {
  card = document.createElement('heating-room-card') as HeatingRoomCard;
  card.setConfig(config);
  card.hass = hass;
  document.body.appendChild(card);
  await card.updateComplete;
  return card;
}
const $ = <T extends Element = HTMLElement>(sel: string) => card.shadowRoot!.querySelector(sel) as T;
const $$ = (sel: string) => card.shadowRoot!.querySelectorAll(sel);
const dial = () => $<HrcDial>('hrc-dial');

beforeEach(() => (document.body.innerHTML = ''));
afterEach(() => vi.useRealTimers());

describe('heating-room-card', () => {
  it('renders one valve chip per TRV', async () => {
    await mount(oneTrvConfig, oneTrvHass());
    expect($$('.valve-chip').length).toBe(1);
    expect($('.valve-chip').textContent).toContain('12%');
    document.body.innerHTML = '';
    await mount(twoTrvConfig, twoTrvHass());
    expect($$('.valve-chip').length).toBe(2);
    expect(card.shadowRoot!.textContent).toContain('36%');
    expect(card.shadowRoot!.textContent).toContain('43%');
  });

  it('on/off pill toggles schedule.enabled', async () => {
    const hass = twoTrvHass();
    await mount(twoTrvConfig, hass);
    $('.pill').click();
    expect(hass.calls).toEqual([['input_boolean', 'toggle', { entity_id: schedule.enabled }]]);
  });

  it('dial release → set_temperature on config.climate only', async () => {
    const hass = twoTrvHass();
    await mount(twoTrvConfig, hass);
    dial().dispatchEvent(new CustomEvent('hrc-change', { detail: { value: 22 }, bubbles: true, composed: true }));
    expect(hass.calls).toEqual([['climate', 'set_temperature', { entity_id: 'climate.shelly_trv_2', temperature: 22 }]]);
  });

  it('pending until HA confirms', async () => {
    await mount(twoTrvConfig, twoTrvHass());
    dial().dispatchEvent(new CustomEvent('hrc-change', { detail: { value: 22 } }));
    await card.updateComplete;
    expect(dial().pending).toBe(true);
    expect(dial().value).toBe(22);
    card.hass = twoTrvHass({ 'climate.shelly_trv_2': ['heat', climateAttrs(22)] });
    await card.updateComplete;
    expect(dial().pending).toBe(false);
    expect(dial().value).toBe(22);
  });

  it('pending survives a slow TRV that confirms after 25s', async () => {
    vi.useFakeTimers();
    await mount(twoTrvConfig, twoTrvHass());
    dial().dispatchEvent(new CustomEvent('hrc-change', { detail: { value: 10 } }));
    await card.updateComplete;
    vi.advanceTimersByTime(25_000);
    // An unrelated update for the same TRV (still the old setpoint) must not drop the pending value.
    card.hass = twoTrvHass({ 'climate.shelly_trv_2': ['heat', climateAttrs(21.5, 'heating')] });
    await card.updateComplete;
    expect(dial().pending).toBe(true);
    expect(dial().value).toBe(10);
    card.hass = twoTrvHass({ 'climate.shelly_trv_2': ['heat', climateAttrs(10)] });
    await card.updateComplete;
    expect(dial().pending).toBe(false);
    expect(dial().value).toBe(10);
  });

  it('pending is dropped when the setpoint is changed elsewhere', async () => {
    await mount(twoTrvConfig, twoTrvHass());
    dial().dispatchEvent(new CustomEvent('hrc-change', { detail: { value: 22 } }));
    await card.updateComplete;
    card.hass = twoTrvHass({ 'climate.shelly_trv_2': ['heat', climateAttrs(18)] });
    await card.updateComplete;
    expect(dial().pending).toBe(false);
    expect(dial().value).toBe(18);
  });

  it('pending reverts after 60s without confirmation', async () => {
    vi.useFakeTimers();
    await mount(twoTrvConfig, twoTrvHass());
    dial().dispatchEvent(new CustomEvent('hrc-change', { detail: { value: 22 } }));
    await card.updateComplete;
    vi.advanceTimersByTime(59_999);
    await card.updateComplete;
    expect(dial().pending).toBe(true);
    vi.advanceTimersByTime(1);
    await card.updateComplete;
    expect(dial().pending).toBe(false);
    expect(dial().value).toBe(21.5);
  });

  it('detach and re-attach clears a pending value', async () => {
    await mount(twoTrvConfig, twoTrvHass());
    dial().dispatchEvent(new CustomEvent('hrc-change', { detail: { value: 22 } }));
    await card.updateComplete;
    card.remove();
    document.body.appendChild(card);
    await card.updateComplete;
    expect(dial().pending).toBe(false);
    expect(dial().value).toBe(21.5);
  });

  it('hass update during pending does not overwrite the value', async () => {
    await mount(twoTrvConfig, twoTrvHass());
    dial().dispatchEvent(new CustomEvent('hrc-change', { detail: { value: 22 } }));
    card.hass = twoTrvHass({ 'switch.kotol_rele': ['on'] });
    await card.updateComplete;
    expect(dial().value).toBe(22);
  });

  it('dragging to the value HA already reports does not mark pending', async () => {
    await mount(twoTrvConfig, twoTrvHass());
    dial().dispatchEvent(new CustomEvent('hrc-change', { detail: { value: 22 } }));
    dial().dispatchEvent(new CustomEvent('hrc-change', { detail: { value: 21.5 } }));
    await card.updateComplete;
    expect(dial().pending).toBe(false);
    expect(dial().value).toBe(21.5);
  });

  describe('service call failures', () => {
    const flush = async () => {
      await new Promise((r) => setTimeout(r, 0));
      await card.updateComplete;
    };

    it('failed set_temperature reverts the dial immediately and shows an error', async () => {
      const hass = twoTrvHass();
      hass.fail = true;
      await mount(twoTrvConfig, hass);
      dial().dispatchEvent(new CustomEvent('hrc-change', { detail: { value: 22 } }));
      await flush();
      expect(dial().pending).toBe(false);
      expect(dial().value).toBe(21.5);
      expect($('.error')?.textContent).toContain("Couldn't save");
    });

    it('failed toggle shows an error', async () => {
      const hass = twoTrvHass();
      hass.fail = true;
      await mount(twoTrvConfig, hass);
      $('.pill').click();
      await flush();
      expect($('.error')?.textContent).toContain("Couldn't save");
    });

    it('failed editor save shows an error and still sends the other fields', async () => {
      const hass = twoTrvHass();
      hass.fail = true;
      await mount(twoTrvConfig, hass);
      $('hrc-editor').dispatchEvent(new CustomEvent('hrc-save', { detail: { nightTemp: 18, weekendDay: 630 } }));
      await flush();
      expect(hass.calls.length).toBe(2);
      expect($('.error')?.textContent).toContain("Couldn't save");
    });

    it('error message disappears after 5s', async () => {
      const hass = twoTrvHass();
      hass.fail = true;
      await mount(twoTrvConfig, hass);
      $('.pill').click();
      await flush();
      vi.useFakeTimers();
      card['showError'](); // restart the timer under fake timers
      await card.updateComplete;
      vi.advanceTimersByTime(5_000);
      await card.updateComplete;
      expect($('.error')).toBeNull();
    });

    it('no error shown when calls succeed', async () => {
      await mount(twoTrvConfig, twoTrvHass());
      $('.pill').click();
      await flush();
      expect($('.error')).toBeNull();
    });
  });

  it('editor save writes only changed fields', async () => {
    const hass = twoTrvHass();
    await mount(twoTrvConfig, hass);
    $('hrc-editor').dispatchEvent(new CustomEvent('hrc-save', { detail: { nightTemp: 18, weekendDay: 630 } }));
    expect(hass.calls).toEqual([
      ['input_number', 'set_value', { entity_id: schedule.night_temp, value: 18 }],
      ['input_datetime', 'set_datetime', { entity_id: schedule.weekend.day, time: '10:30:00' }],
    ]);
  });

  it('schedule edit opens editor, close hides it', async () => {
    await mount(twoTrvConfig, twoTrvHass());
    $('hrc-schedule').dispatchEvent(new CustomEvent('hrc-edit'));
    await card.updateComplete;
    expect(($('hrc-editor') as any).open).toBe(true);
    $('hrc-editor').dispatchEvent(new CustomEvent('hrc-close'));
    await card.updateComplete;
    expect(($('hrc-editor') as any).open).toBe(false);
  });

  it('low battery chip only when below threshold, ignoring unavailable', async () => {
    await mount(twoTrvConfig, twoTrvHass({ 'sensor.shelly_trv_2_battery': ['18'] }));
    expect($$('.battery-chip').length).toBe(1);
    expect($('.battery-chip').textContent).toContain('18%');
    document.body.innerHTML = '';
    await mount(twoTrvConfig, twoTrvHass({ 'sensor.shelly_trv_2_battery': ['unavailable'] }));
    expect($$('.battery-chip').length).toBe(0);
  });

  it('show_battery: always shows every TRV battery, low ones marked', async () => {
    await mount({ ...twoTrvConfig, show_battery: 'always' }, twoTrvHass({ 'sensor.shelly_trv_2_battery': ['18'] }));
    const chips = [...$$('.battery-chip')] as HTMLElement[];
    expect(chips.map((c) => c.textContent!.trim())).toEqual(['92%', '18%']);
    expect(chips.map((c) => c.classList.contains('low'))).toEqual([false, true]);
  });

  it('show_battery: always works for a single TRV and skips unavailable', async () => {
    await mount({ ...oneTrvConfig, show_battery: 'always' }, oneTrvHass());
    expect($$('.battery-chip').length).toBe(1);
    expect($('.battery-chip').textContent).toContain('70%');
    document.body.innerHTML = '';
    const hass = oneTrvHass();
    hass.states['sensor.shelly_trv_3_battery'].state = 'unavailable';
    await mount({ ...oneTrvConfig, show_battery: 'always' }, hass);
    expect($$('.battery-chip').length).toBe(0);
  });

  it('battery chip click opens more-info for that battery', async () => {
    await mount({ ...twoTrvConfig, show_battery: 'always' }, twoTrvHass());
    const ids: string[] = [];
    card.addEventListener('hass-more-info', (e) => ids.push((e as CustomEvent).detail.entityId));
    ($$('.battery-chip')[1] as HTMLElement).click();
    expect(ids).toEqual(['sensor.shelly_trv_2_battery']);
  });

  it('offline secondary TRV shows a badge that opens its more-info', async () => {
    await mount(twoTrvConfig, twoTrvHass({ 'climate.shelly_trv_1': ['unavailable', {}] }));
    expect($$('.alert-chip.offline').length).toBe(1);
    expect($('.alert-chip.offline').textContent).toContain('Offline');
    const ids: string[] = [];
    card.addEventListener('hass-more-info', (e) => ids.push((e as CustomEvent).detail.entityId));
    $('.alert-chip.offline').click();
    expect(ids).toEqual(['climate.shelly_trv_1']);
  });

  it('no offline badge for the dial TRV (status says it) or when all are up', async () => {
    await mount(twoTrvConfig, twoTrvHass({ 'climate.shelly_trv_2': ['unavailable', {}] }));
    expect($$('.alert-chip').length).toBe(0);
    expect(dial().status).toBe('unavailable');
    document.body.innerHTML = '';
    await mount(twoTrvConfig, twoTrvHass());
    expect($$('.alert-chip').length).toBe(0);
  });

  it('out-of-sync badge only after the setpoints differ for 3 minutes', async () => {
    vi.useFakeTimers();
    await mount(twoTrvConfig, twoTrvHass());
    card.hass = twoTrvHass({ 'climate.shelly_trv_2': ['heat', climateAttrs(23)] });
    await card.updateComplete;
    vi.advanceTimersByTime(179_999);
    await card.updateComplete;
    expect($$('.alert-chip.sync').length).toBe(0);
    vi.advanceTimersByTime(1);
    await card.updateComplete;
    expect($$('.alert-chip.sync').length).toBe(1);
    const ids: string[] = [];
    card.addEventListener('hass-more-info', (e) => ids.push((e as CustomEvent).detail.entityId));
    $('.alert-chip.sync').click();
    expect(ids).toEqual(['climate.shelly_trv_1']);
    // The sync automation catches up: the badge goes away.
    card.hass = twoTrvHass({ 'climate.shelly_trv_1': ['heat', climateAttrs(23)], 'climate.shelly_trv_2': ['heat', climateAttrs(23)] });
    await card.updateComplete;
    expect($$('.alert-chip.sync').length).toBe(0);
  });

  it('a mismatch that resolves within the grace period never shows a badge', async () => {
    vi.useFakeTimers();
    await mount(twoTrvConfig, twoTrvHass());
    card.hass = twoTrvHass({ 'climate.shelly_trv_2': ['heat', climateAttrs(23)] });
    await card.updateComplete;
    vi.advanceTimersByTime(60_000);
    card.hass = twoTrvHass({ 'climate.shelly_trv_1': ['heat', climateAttrs(23)], 'climate.shelly_trv_2': ['heat', climateAttrs(23)] });
    await card.updateComplete;
    vi.advanceTimersByTime(600_000);
    await card.updateComplete;
    expect($$('.alert-chip.sync').length).toBe(0);
  });

  it('off or offline TRVs never count as out of sync', async () => {
    vi.useFakeTimers();
    await mount(twoTrvConfig, twoTrvHass({ 'climate.shelly_trv_1': ['off', climateAttrs(null)] }));
    vi.advanceTimersByTime(600_000);
    await card.updateComplete;
    expect($$('.alert-chip.sync').length).toBe(0);
  });

  it('room temperature and humidity sensors reach the dial', async () => {
    const config = { ...twoTrvConfig, temperature: 'sensor.room_temp', humidity: 'sensor.room_hum' };
    await mount(config, twoTrvHass({ 'sensor.room_temp': ['20.3'], 'sensor.room_hum': ['48.6'] }));
    expect(dial().current).toBe(20.3);
    expect(dial().humidity).toBe(48.6);
    // Re-renders when only the room sensor changes.
    card.hass = twoTrvHass({ 'sensor.room_temp': ['20.8'], 'sensor.room_hum': ['48.6'] });
    await card.updateComplete;
    expect(dial().current).toBe(20.8);
  });

  it('falls back to the TRV reading when the room sensor is unavailable', async () => {
    const config = { ...twoTrvConfig, temperature: 'sensor.room_temp', humidity: 'sensor.room_hum' };
    await mount(config, twoTrvHass({ 'sensor.room_temp': ['unavailable'], 'sensor.room_hum': ['unavailable'] }));
    expect(dial().current).toBe(21.7);
    expect(dial().humidity).toBeNull();
    document.body.innerHTML = '';
    await mount(twoTrvConfig, twoTrvHass());
    expect(dial().current).toBe(21.7);
    expect(dial().humidity).toBeNull();
  });

  it('missing entities do not throw', async () => {
    await mount(twoTrvConfig, makeHass({ 'climate.shelly_trv_2': ['heat', climateAttrs(21)] }));
    expect(card.shadowRoot!.textContent).toContain('—');
  });

  it('climate off → dial status off, value null', async () => {
    await mount(twoTrvConfig, twoTrvHass({ 'climate.shelly_trv_2': ['off', climateAttrs(null)] }));
    expect(dial().status).toBe('off');
    expect(dial().value).toBeNull();
  });

  it('status and labels reach the dial (Slovak)', async () => {
    const hass = twoTrvHass({ 'climate.shelly_trv_1': ['heat', climateAttrs(21.5, 'heating')] });
    hass.locale = { language: 'sk' };
    await mount(twoTrvConfig, hass);
    expect(dial().status).toBe('wants_heat');
    expect(dial().statusLabel).toBe('Čaká na teplo');
    expect(dial().decimal).toBe(',');
  });

  it('room icon tinted only when schedule enabled', async () => {
    await mount(twoTrvConfig, twoTrvHass());
    expect($('.room-icon').classList.contains('active')).toBe(true);
    document.body.innerHTML = '';
    await mount(twoTrvConfig, twoTrvHass(scheduleStates('off')));
    expect($('.room-icon').classList.contains('active')).toBe(false);
  });

  it('valve chip click fires hass-more-info', async () => {
    await mount(twoTrvConfig, twoTrvHass());
    const ids: string[] = [];
    card.addEventListener('hass-more-info', (e) => ids.push((e as CustomEvent).detail.entityId));
    ($$('.valve-chip')[0] as HTMLElement).click();
    expect(ids).toEqual(['sensor.valve_1']);
  });

  it('name defaults to climate friendly_name', async () => {
    await mount(oneTrvConfig, oneTrvHass());
    expect($('.name').textContent).toContain('TRV');
  });

  it('setConfig still throws for a config that is not an object', () => {
    const c = document.createElement('heating-room-card') as HeatingRoomCard;
    expect(() => c.setConfig(null)).toThrow();
  });

  it('an incomplete config shows a setup placeholder listing what is missing', async () => {
    await mount({ type: 'x', trvs: [{ climate: 'climate.shelly_trv_3' }], schedule: { enabled: schedule.enabled } }, oneTrvHass());
    expect($('.setup')).not.toBeNull();
    expect($('hrc-dial')).toBeNull();
    const text = $('.setup').textContent!;
    expect(text).toContain('Finish setting up this card');
    expect(text).toContain('Night temperature');
    expect(text).toContain('Weekend: night starts');
    expect(text).not.toContain('Schedule on/off');
  });

  it('a config error that is not a missing field is shown in the placeholder', async () => {
    await mount({ ...oneTrvConfig, show_battery: 'sometimes' }, oneTrvHass());
    expect($('.setup').textContent).toContain('show_battery');
  });

  it('fixing the config replaces the placeholder with the card', async () => {
    await mount({ type: 'x' }, oneTrvHass());
    card.setConfig(oneTrvConfig);
    await card.updateComplete;
    expect($('.setup')).toBeNull();
    expect($('hrc-dial')).not.toBeNull();
  });

  it('offers the visual editor', async () => {
    const el = await (customElements.get('heating-room-card') as any).getConfigElement();
    expect(el.tagName.toLowerCase()).toBe('heating-room-card-editor');
  });

  it('stub config uses real entities from hass', () => {
    const stub = (customElements.get('heating-room-card') as any).getStubConfig(oneTrvHass());
    expect(stub.trvs[0].climate).toBe('climate.shelly_trv_3');
    expect(stub.boiler).toBe('switch.kotol_rele');
    expect(stub.schedule).toEqual(schedule);
  });

  it('card size and grid options', async () => {
    await mount(twoTrvConfig, twoTrvHass());
    expect(card.getCardSize()).toBe(6);
    expect(card.getGridOptions()).toEqual({ columns: 12 });
  });
});
