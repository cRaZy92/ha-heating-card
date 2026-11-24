# Heating Room Card

A Home Assistant Lovelace card for a single room's heating. It shows:

- a large, color-changing **setpoint dial**. It is scroll-safe: a drag only starts on the arc, and a swipe anywhere else scrolls the page.
- the **actual heating status**. It tells apart "a TRV wants heat" and "the boiler is actually heating".
- the **weekday and weekend schedule** as two 24h timelines, both always visible.
- a **schedule editor** popup. Nothing is written until you press Save.

It works for rooms with one TRV or several.

## Install

1. `npm install && npm run build`
2. Copy `dist/heating-room-card.js` to `/config/www/heating-room-card.js`.
3. Go to **Settings → Dashboards → ⋮ → Resources → Add resource**:
   - URL: `/local/heating-room-card.js`
   - Type: **JavaScript module**
4. Hard-reload the browser or the app. When you update the file later, bump the cache: `/local/heating-room-card.js?v=2`.

## Configuration

### Room with two TRVs

```yaml
type: custom:heating-room-card
name: Tech. Izba
icon: mdi:desktop-classic
climate: climate.shelly_trv_2            # the TRV the dial controls (sync automations handle the rest)
boiler: switch.kotol_rele
trvs:
  - climate: climate.shelly_trv_1
    valve: sensor.tech_izba_trv_1_poloha_ventilu
    battery: sensor.shelly_trv_1_battery
  - climate: climate.shelly_trv_2
    valve: sensor.tech_izba_trv_2_poloha_ventilu
    battery: sensor.shelly_trv_2_battery
schedule:
  enabled: input_boolean.trv_izba_on_off
  night_temp: input_number.trv_izba_night_temp
  day_temp: input_number.trv_izba_day_temp
  weekday:
    day: input_datetime.trv_izba_day_time
    night: input_datetime.trv_izba_night_time
  weekend:
    day: input_datetime.trv_izba_day_time_weekend
    night: input_datetime.trv_izba_night_time_weekend
```

### Room with one TRV

```yaml
type: custom:heating-room-card
name: Spálňa
icon: mdi:bed
boiler: switch.kotol_rele
trvs:
  - climate: climate.shelly_trv_3
    valve: sensor.spalna_trv_poloha_ventilu
    battery: sensor.shelly_trv_3_battery
schedule:
  enabled: input_boolean.trv_spalna_on_off
  night_temp: input_number.trv_spalna_night_temp
  day_temp: input_number.trv_spalna_day_temp
  weekday:
    day: input_datetime.trv_spalna_day_time
    night: input_datetime.trv_spalna_night_time
  weekend:
    day: input_datetime.trv_spalna_day_time_weekend
    night: input_datetime.trv_spalna_night_time_weekend
```

### Options

| Key | Required | Default | Description |
|---|---|---|---|
| `trvs` | yes | — | List of TRVs (at least 1). Each one has `climate` (required), plus optional `valve` (% sensor) and `battery` (% sensor). |
| `schedule.*` | yes | — | The `enabled` boolean, the `night_temp`/`day_temp` numbers, and the `weekday`/`weekend` `day`/`night` datetimes (time only). |
| `climate` | no | `trvs[0].climate` | The TRV whose setpoint the dial reads and writes. |
| `boiler` | no | — | Boiler relay switch. Without it, a TRV calling for heat shows **Heating**. |
| `name` | no | the climate's friendly name | Room name. |
| `icon` | no | `mdi:radiator` | Room icon. It is tinted when the schedule is on. |
| `battery_warning` | no | `25` | Batteries below this % are highlighted in red. |
| `show_battery` | no | `low` | `low`: show only the lowest battery, and only when it is below `battery_warning`. `always`: always show every TRV's battery in the dial's top-left corner. |

### Status

| Condition | Slovak | English |
|---|---|---|
| Climate unavailable | Nedostupné | Unavailable |
| Climate mode off | Vypnuté | Off |
| No TRV calling for heat | Nečinné | Idle |
| A TRV is calling for heat, boiler off | Čaká na teplo | Wants heat |
| A TRV is calling for heat, boiler on | Kúri | Heating |

Labels are in Slovak when the HA language is Slovak, and in English otherwise.

## Behaviour notes

- **Dial:** it sends `climate.set_temperature` once, when you release. The value stays dimmed until HA confirms it, and reverts if HA hasn't confirmed within 10s.
- **Schedule tick:** a tick on the dial marks the temperature the schedule expects right now. A `▲ plán X°` hint appears when the current setpoint differs from it. Both are hidden while the schedule is off.
- **Schedule editor:** tap the schedule to open it. Save writes only the fields you changed, through `input_number.set_value` and `input_datetime.set_datetime`.
- **Errors:** if any call to HA fails (setpoint, On/Off, schedule save), the dial reverts to the real value immediately and the card shows *Nepodarilo sa uložiť* / *Couldn't save* for 5s. The failure is logged to the console as a warning, and there are no unhandled errors.

## Development

```bash
npm test          # unit tests (Vitest + happy-dom)
npm run dev       # then open http://localhost:5173/dev/index.html (mocked hass, 1- and 2-TRV rooms)
npm run build     # dist/heating-room-card.js
```
