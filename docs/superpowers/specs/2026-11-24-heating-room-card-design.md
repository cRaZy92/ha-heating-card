# Heating Room Card — Design

Date: 2026-11-24
Status: draft, awaiting approval

## Intent

Each room's heating dashboard today is a grid of about 8 third-party cards (heading + card_mod,
simple-swipe-card, love-lock-card, mushroom-number-card, time-picker-card, built-in thermostat,
mod-card). It takes a full phone screen per room, hides the weekend schedule behind a swipe,
needs a "tap to unlock" before every change, and shows "Heating" whenever a TRV valve is open
even if the boiler is off.

We'll replace all of it with **one custom Lovelace card per room**: `custom:heating-room-card`.

**Why:** it's easier to use on a phone, you can see the whole schedule at a glance, and
the status is truthful. It also cuts the per-room YAML down to a short entity list.

## Goals

- A big, color-changing, draggable setpoint dial that's easy to use with a thumb. It stays the
  card's main element.
- No accidental changes while scrolling the page, and no lock/unlock step.
- Weekday and weekend schedules are both visible at once.
- A status that tells "a TRV wants heat" apart from "the boiler is actually heating".
- One card replaces the whole grid, and is noticeably shorter (target ≤ ~500px on a phone vs ~720px today).
- Reusable for every room through config only.

## Non-goals (v1)

- A visual (GUI) card editor. Config is YAML only.
- Changing how scheduling works. The card only reads and writes the existing helpers;
  the existing automations stay the source of truth.
- More than two periods per day (night/day), or per-day schedules beyond weekday/weekend.
- HACS publishing. That's possible later.

## Anti-goals (failure even if it "works")

- The dial or any control changes a value while the user is just scrolling.
- The card spams service calls while dragging (it must write once, on release).
- Writing to entities other than the ones configured, or fighting the TRV sync automations.
- Being taller or more cluttered than today's layout.

## Constraints and facts about the current setup

- **Schedule helpers (per room):**
  - `input_number.<room>_night_temp` and `input_number.<room>_day_temp`. These temperatures are
    **shared** by weekdays and weekend.
  - `input_datetime.<room>_day_time`, `_night_time`, `_day_time_weekend` and `_night_time_weekend`
    (time only). The day period runs from day_time to night_time, and the night period is the rest.
  - `input_boolean.<room>_on_off` is the master switch for the schedule automation.
- **TRVs:** a room can have 2 Shelly TRVs. The automations "TRV Sync 1->2" and "2->1" keep their
  setpoints in sync, so the card sets the setpoint on **one** configured climate entity only.
- The TRVs' climate entities expose `hvac_action` (`idle` / `heating`), `current_temperature`,
  `temperature`, `min_temp`, `max_temp` and `target_temp_step`.
- **Boiler relay:** `switch.kotol_rele` is shared by all rooms.
- Each TRV has a valve position sensor (%) and a battery sensor (%).
- **Assumption:** a manual setpoint change lasts until the next scheduled switch time, when the
  automation applies the schedule temperature again.
- The UI language is Slovak. Today's labels are "Pracovné dni", "Víkend", "Noc" and "Deň".

## Approaches considered

1. **Self-contained custom card (TypeScript + Lit). CHOSEN.** It has its own dial with
   scroll-safe touch handling, its own status logic, timelines and an edit popup. It removes the
   dependency on 6 third-party cards and card_mod. The cost is that it's code to maintain, but it
   only reads entities and calls services, which keeps it stable across HA updates.
2. **Templates from existing cards** (decluttering-card + button-card + card_mod on the built-in
   thermostat). No code, but the built-in dial can't be made scroll-safe, the status becomes Jinja
   template sprawl, and the card_mod fragility stays. Rejected: it only delivers about half the goals.

## Design

### Layout (phone)

```
┌──────────────────────────────────────────┐
│ 🖥 Tech. Izba          [● On]  ⛽36% ⛽43%│  header
│                                          │
│            ╭───────────────╮             │
│         ╭──╯               ╰──●          │  dial (270° arc)
│        ╱      Wants heat       ╲         │  status
│       │        21.5 °C          │        │  target setpoint
│        ╲      🌡 20.1 °C        ╱         │  current temperature
│         ╰     ▲ schedule 17°  ╯          │  only when target ≠ schedule
│                                          │
│ 🌙 17.0°   ☀ 21.5°                     › │  schedule (tap → editor)
│ Weekdays ██▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓██  09:20–23:50
│ Weekend  ███▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓██  10:00–23:00
│                               🔋 18% ⚠   │  only when a battery is low
└──────────────────────────────────────────┘
```

### Header

- Room icon + name.
- The **On/Off pill** toggles the `schedule.enabled` boolean. It uses the accent color
  (`--mdc-theme-secondary`, falling back to `--accent-color`) when on, and the disabled color when off.
- **Valve %** per TRV, with an icon. Tapping one opens HA more-info for that sensor.
- The room icon is tinted with the accent color when the schedule is on, and grey when it's off
  (this matches today's behaviour).

### Dial

- A 270° arc from `min_temp` to `max_temp` of the target climate entity. It snaps to
  `target_temp_step` (default 0.5).
- **Arc color** interpolates with the setpoint: blue at the low end → orange → red at the high end.
  The filled part runs from the arc start to the knob, and the unfilled part is a muted track.
- **Scroll safety:** the card root uses `touch-action: pan-y`, so vertical swipes scroll the page.
  A drag only starts if the pointer goes **down on the arc band (± about 20px) or on the knob**.
  Only then does the dial call `setPointerCapture` and suppress scrolling (the arc
  element has `touch-action: none`). A pointerdown anywhere else does nothing.
- While dragging, the displayed value updates live. **`climate.set_temperature` is called once
  on release**, and only if the value changed. Until HA confirms the change, the card shows the
  pending value with reduced opacity, and reverts if nothing has come back after 10s.
- **The centre shows:** the status label, the target setpoint (big, with a smaller decimal like
  today), and the current temperature (a thermometer icon + the value from `current_temperature`).
- **Schedule tick:** a small marker on the arc at the temperature the schedule expects right now.
  When the target differs from it, a line under the current temperature reads "▲ plán 17°".
  Both are hidden when the schedule is off.

### Status logic

The card evaluates all configured TRV climate entities plus the boiler switch:

| Condition (first match wins) | Label (sk / en) | Style |
|---|---|---|
| Target climate is `unavailable` / `unknown` | Nedostupné / Unavailable | grey |
| Target climate's hvac mode is `off` | Vypnuté / Off | grey arc, no glow |
| No TRV has `hvac_action == heating` | Nečinné / Idle | muted |
| Some TRV is heating and the boiler is `off` | Čaká na teplo / Wants heat | amber, slow pulse |
| Some TRV is heating and the boiler is `on` | Kúri / Heating | orange-red glow |

The boiler being on while this room is idle still shows **Idle**.

### Schedule section

- **The temperatures row:** 🌙 night temp and ☀ day temp.
- **Two timeline rows, Weekdays (Mon–Fri) and Weekend (Sat–Sun).** Each is a 24h bar
  (00:00 → 24:00). The day period (day_time → night_time) is in the warm color and the rest is
  in the night color (indigo). If night_time is earlier than day_time, the day period wraps
  around midnight and must still render correctly. The times are shown as text on the right.
- **Today's row** is highlighted and shows a "now" marker.
- When the schedule is off, the section is dimmed but still editable.
- Tapping anywhere in the section opens the **editor sheet**.

### Editor sheet (popup)

- An overlay with a bottom-sheet style on phones and a centred dialog on wide screens. It's
  rendered inside the card's shadow DOM, attached to the viewport with `position: fixed`.
- **Contents:**
  - Night temp and day temp, each a large −/value/+ stepper. The step and range come from the
    input_number's `step` / `min` / `max`.
  - Four time fields (weekday day/night and weekend day/night), as native `<input type="time">`
    with a 10-minute step, which gives the phone's native time picker.
- **Cancel / Save.** Values are written only when you tap Save, which is a second protection
  against accidental changes. Save calls `input_number.set_value` and
  `input_datetime.set_datetime` (`time: "HH:MM:00"`), but only for fields that changed.
- The sheet closes when you tap Save, Cancel or the backdrop, or press Escape.

### Battery

- Battery levels are hidden unless one is below `battery_warning` (default 25%). In that case a
  small warning chip appears at the bottom-right. Tapping it opens more-info.

### Configuration

```yaml
type: custom:heating-room-card
name: Tech. Izba
icon: mdi:desktop-classic
climate: climate.shelly_trv_2            # dial reads and writes this one
boiler: switch.kotol_rele
trvs:                                     # all TRVs in the room: status, valves, batteries
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
battery_warning: 25                       # optional
```

Single-TRV room. `climate` can be left out, because it defaults to the only TRV:

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
  # same keys as above
```

- **Supporting 1 and 2 TRVs per room is a hard requirement.** The code must handle N ≥ 1 TRVs
  and must not assume two anywhere.
  - Header: one valve chip per TRV (1 chip or 2 chips).
  - Status: "some TRV is heating" over however many TRVs there are.
  - Battery warning: checks every TRV's battery.
  - Tests cover both the 1-TRV and the 2-TRV case.
- `trvs` (≥ 1 entry) and `schedule.*` are required. In each TRV, `valve` and `battery` are optional.
- `climate` (the TRV the dial controls) defaults to `trvs[0].climate`. With 2 TRVs, set it to
  whichever TRV you want as the "primary"; the sync automations handle the other one.
- `name` defaults to the climate entity's friendly name.
- The `boiler` is optional; without it, a heating TRV shows **Heating**.
- A missing or unavailable entity must not crash the card. The affected part shows "—".
- `getCardSize()` returns about 6. `getGridOptions()` returns full width (12 columns).

### Language

- Labels follow `hass.locale.language`: Slovak when `sk`, English otherwise.

### Tech and build

- TypeScript + Lit 3, built with Vite in library mode into a single ES module,
  `dist/heating-room-card.js`, with no runtime dependencies beyond Lit, which is bundled in.
- It registers in `window.customCards`, so it shows up in the card picker.
- Pure logic lives in plain modules with **Vitest** unit tests: status evaluation, which schedule
  temperature applies now, timeline segments (including the midnight wrap), and the angle↔value
  math of the dial.
- **Deploy:** copy `dist/heating-room-card.js` to `/config/www/` and add the resource
  `/local/heating-room-card.js` (type: module). A README documents this.
- Theming uses only HA CSS variables (`--card-background-color`, `--primary-text-color`, and so
  on), so it works in light and dark themes.

## Left to the builder

- Exact colors, gradient stops, spacing and animation timings, within the layout above.
- Project structure and file split.
- Exact pointer hit-testing for the arc.
- How to mock `hass` for tests, and whether to add a dev harness page for visual checking.
