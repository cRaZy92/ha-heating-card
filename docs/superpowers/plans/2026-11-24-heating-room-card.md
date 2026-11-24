# Heating Room Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `custom:heating-room-card`, a single Home Assistant Lovelace card per room. It has a scroll-safe draggable setpoint dial, a truthful heating status, always-visible weekday/weekend schedule timelines, and a schedule editor popup. It supports rooms with 1 or 2 TRVs.

**Architecture:** Pure logic (config normalisation, status, schedule maths, dial geometry, i18n) lives in plain TS modules with Vitest unit tests. Three presentational Lit elements (`hrc-dial`, `hrc-schedule`, `hrc-editor`) take plain props and emit DOM events. The `heating-room-card` element reads `hass`, wires the props and turns the events into HA service calls.

**Tech Stack:** TypeScript 5, Lit 3, Vite 6 (library build), Vitest 3 + happy-dom.

**Spec:** `docs/superpowers/specs/2026-11-24-heating-room-card-design.md`

## Global Constraints

- Output: a single ES module, `dist/heating-room-card.js`, with Lit bundled in and no other runtime deps.
- Theming uses only HA CSS variables (`--card-background-color`, `--primary-text-color`, `--secondary-text-color`, `--mdc-theme-secondary` falling back to `--accent-color`, `--disabled-color`, `--divider-color`).
- Never assume 2 TRVs: every per-TRV feature iterates `config.trvs` (length ≥ 1).
- The dial calls `climate.set_temperature` once, on release, only if the value changed, and only on `config.climate`.
- The editor writes only fields that changed, and only when Save is pressed. Times are sent as `"HH:MM:00"`.
- A missing or unavailable entity never throws; the affected value renders as `—`.
- Labels are Slovak when `hass.locale.language` (or `hass.language`) starts with `sk`, and English otherwise.
- Status labels: sk `Nedostupné / Vypnuté / Nečinné / Čaká na teplo / Kúri`, en `Unavailable / Off / Idle / Wants heat / Heating`.
- Default `battery_warning` is 25. Default icon is `mdi:radiator`. The dial's default step is 0.5.
- The project isn't a git repo yet: Task 1 runs `git init`.

## Review Focus

1. **Unavailable or missing entities** (TRV offline, battery `unknown`, a deleted helper): the card renders with `—` placeholders and doesn't throw. This is tested in Tasks 2, 3 and 8.
2. **A night time earlier than the day time (a day period across midnight), or equal times:** the timeline and the expected temperature must still be right. This is tested in Task 3.
3. **A drag that starts off the arc,** or one released at the same value: no value change and no service call. This is tested in Task 5.
4. **An HA state update arriving mid-drag or while a value is pending:** the knob must not jump back. Pending reverts after 10s if HA never confirms. This is tested in Tasks 5 and 8.
5. **A climate in `off` mode, or with a `temperature` attribute of null/missing:** the dial shows `—` and stays draggable from min. This is tested in Tasks 2 and 8.

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts      build + test config
src/types.ts          Hass + config types
src/config.ts         normalizeConfig()
src/status.ts         evaluateStatus()
src/schedule.ts       time parsing, timeline segments, expected temp
src/dial-math.ts      angle/value maths, arc hit-test, color
src/i18n.ts           t()
src/components/hrc-dial.ts       dial element
src/components/hrc-schedule.ts   timeline section element
src/components/hrc-editor.ts     editor sheet element
src/heating-room-card.ts         main card + registration (entry point)
test/*.test.ts                   one test file per module
test/mock-hass.ts                makeHass() helper
dev/index.html                   manual harness with a mocked hass
README.md
```

---

### Task 1: Scaffold, types, config normalisation

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `src/types.ts`, `src/config.ts`, `test/config.test.ts`, `test/mock-hass.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/types.ts
  export interface HassEntity { entity_id: string; state: string; attributes: Record<string, any>; }
  export interface Hass {
    states: Record<string, HassEntity>;
    locale?: { language: string }; language?: string;
    callService(domain: string, service: string, data: Record<string, unknown>): Promise<unknown>;
  }
  export interface TrvConfig { climate: string; valve?: string; battery?: string; }
  export interface ScheduleTimes { day: string; night: string; }
  export interface ScheduleConfig { enabled: string; night_temp: string; day_temp: string; weekday: ScheduleTimes; weekend: ScheduleTimes; }
  export interface CardConfig { type: string; name?: string; icon?: string; climate?: string; boiler?: string; trvs: TrvConfig[]; schedule: ScheduleConfig; battery_warning?: number; }
  export interface NormalizedConfig extends CardConfig { climate: string; icon: string; battery_warning: number; }
  // src/config.ts
  export function normalizeConfig(raw: unknown): NormalizedConfig   // throws Error on invalid
  // test/mock-hass.ts
  export function makeHass(states: Record<string, [state: string, attrs?: Record<string, any>]>, language?: string): Hass & { calls: [string, string, Record<string, unknown>][] }
  ```

- [ ] **Step 1: Scaffold.** Run `git init`. Write `package.json` with scripts `build: vite build`, `test: vitest run`, `dev: vite dev`, dependency `lit@^3`, and devDependencies `typescript@^5`, `vite@^6`, `vitest@^3`, `happy-dom`. Configure `vite.config.ts` as a library build with entry `src/heating-room-card.ts`, format `es`, fileName `heating-room-card`, and `rollupOptions.external: []`; add a `test: { environment: 'happy-dom' }` block. In `tsconfig.json`, set `experimentalDecorators: true` and `useDefineForClassFields: false` (Lit decorators), with target `ES2021`. `.gitignore`: `node_modules`, `dist`. Run `npm install`.

- [ ] **Step 2: Write failing tests** in `test/config.test.ts`:
  - `single TRV: climate defaults to trvs[0].climate` → `normalizeConfig({type, trvs:[{climate:'climate.a'}], schedule}).climate === 'climate.a'`
  - `two TRVs: explicit climate kept` → given `climate:'climate.b'` and trvs a, b → `'climate.b'`
  - `defaults` → `icon === 'mdi:radiator'`, `battery_warning === 25`
  - `throws when trvs missing or empty` → `toThrow(/trvs/)`
  - `throws when schedule key missing` (e.g. no `weekend.night`) → `toThrow(/schedule.weekend.night/)`
  - `throws when climate not among trvs`, e.g. climate `climate.x` with trvs [a] → `toThrow(/climate/)`

- [ ] **Step 3: Run** `npx vitest run test/config.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `src/types.ts`, `normalizeConfig` in `src/config.ts`, and `makeHass` in `test/mock-hass.ts` (`callService` pushes onto `calls` and resolves).

- [ ] **Step 5: Run** `npx vitest run test/config.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit** `git add -A && git commit -m "chore: scaffold project; feat: config normalisation"`

---

### Task 2: Status evaluation + i18n

**Files:**
- Create: `src/status.ts`, `src/i18n.ts`, `test/status.test.ts`, `test/i18n.test.ts`

**Interfaces:**
- Consumes: `Hass`, `NormalizedConfig`, `makeHass`
- Produces:
  ```ts
  export type StatusKind = 'unavailable' | 'off' | 'idle' | 'wants_heat' | 'heating';
  export function evaluateStatus(hass: Hass, cfg: NormalizedConfig): StatusKind
  // i18n
  export type I18nKey = 'status_unavailable'|'status_off'|'status_idle'|'status_wants_heat'|'status_heating'
    |'weekdays'|'weekend'|'night'|'day'|'schedule_hint'|'save'|'cancel'|'on'|'off';
  export function t(hass: Hass | undefined, key: I18nKey): string
  ```

- [ ] **Step 1: Write failing tests** in `test/status.test.ts`. The rules come from the spec table, first match wins:
  - primary climate missing, or state `unavailable`/`unknown` → `'unavailable'`
  - primary climate state `off` → `'off'`
  - 1 TRV, `hvac_action: 'idle'` → `'idle'`
  - 1 TRV heating, boiler `off` → `'wants_heat'`; boiler `on` → `'heating'`
  - 2 TRVs, only the **non-primary** one heating, boiler on → `'heating'`
  - 2 TRVs, the non-primary one `unavailable` and the primary idle → `'idle'` (it's ignored, not an error)
  - boiler on, all TRVs idle → `'idle'`
  - no `boiler` in config, TRV heating → `'heating'`
  - boiler entity `unavailable`, TRV heating → `'wants_heat'`

  In `test/i18n.test.ts`: `t(makeHass({}, 'sk'), 'status_wants_heat') === 'Čaká na teplo'`; `t(makeHass({}, 'en-GB'), 'status_wants_heat') === 'Wants heat'`; `t(undefined, 'weekend') === 'Weekend'`.

- [ ] **Step 2: Run** `npx vitest run test/status.test.ts test/i18n.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** both modules. Slovak strings: weekdays `Pracovné dni`, weekend `Víkend`, night `Noc`, day `Deň`, schedule_hint `plán`, save `Uložiť`, cancel `Zrušiť`, on `Zap.`, off `Vyp.`. English strings: `Weekdays, Weekend, Night, Day, schedule, Save, Cancel, On, Off`. The status strings are in Global Constraints.

- [ ] **Step 4: Run** the same tests. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "feat: heating status evaluation and i18n"` (run `git add` for the new files first).

---

### Task 3: Schedule logic

**Files:**
- Create: `src/schedule.ts`, `test/schedule.test.ts`

**Interfaces:**
- Consumes: `Hass`, `NormalizedConfig`
- Produces:
  ```ts
  export function parseTime(value: string | undefined | null): number | null   // "09:20:00" | "09:20" -> 560; invalid -> null
  export function formatTime(minutes: number): string                          // 560 -> "09:20"
  export function isWeekend(d: Date): boolean                                  // local Sat/Sun
  export type Period = 'day' | 'night';
  export interface Segment { start: number; end: number; period: Period }      // minutes, 0..1440, ordered, contiguous
  export function timelineSegments(dayStart: number, nightStart: number): Segment[]
  export function periodAt(nowMin: number, dayStart: number, nightStart: number): Period
  export interface ScheduleSnapshot {
    nightTemp: number | null; dayTemp: number | null; enabled: boolean;
    weekday: { day: number | null; night: number | null };
    weekend: { day: number | null; night: number | null };
  }
  export function readSchedule(hass: Hass, cfg: NormalizedConfig): ScheduleSnapshot
  export function expectedTemp(s: ScheduleSnapshot, now: Date): number | null   // null if disabled or data missing
  ```

- [ ] **Step 1: Write failing tests:**
  - `parseTime('09:20:00') === 560`, `parseTime('23:50') === 1430`, `parseTime('unknown') === null`, `parseTime(undefined) === null`; `formatTime(5) === '00:05'`
  - `isWeekend(new Date(2026,10,28))` (Sat) → true; `new Date(2026,10,30)` (Mon) → false
  - `timelineSegments(560, 1430)` → `[{0,560,night},{560,1430,day},{1430,1440,night}]`
  - wrap: `timelineSegments(1200, 120)` (day 20:00 → 02:00) → `[{0,120,day},{120,1200,night},{1200,1440,day}]`
  - equal: `timelineSegments(600, 600)` → `[{0,1440,night}]`
  - `periodAt(560, 560, 1430) === 'day'` (the boundary belongs to the period that starts there); `periodAt(1430, 560, 1430) === 'night'`; `periodAt(60, 1200, 120) === 'day'`
  - `expectedTemp` on Saturday 09:30 with weekend day=600 and weekday day=560 → the night temp; on Monday 09:30 → the day temp
  - `expectedTemp` with `enabled:false` → null; with `dayTemp: null` during the day → null
  - `readSchedule` with `input_number` state `'17.0'` → `nightTemp === 17`; `enabled` is true only when the state is `'on'`; a missing entity → null fields

- [ ] **Step 2: Run** `npx vitest run test/schedule.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `src/schedule.ts`. `timelineSegments` drops zero-length segments.

- [ ] **Step 4: Run** the same tests. Expected: PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: schedule parsing, timelines, expected temperature"`

---

### Task 4: Dial geometry + color

**Files:**
- Create: `src/dial-math.ts`, `test/dial-math.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const ARC_START_DEG = 135;   // SVG angle (0° = +x, clockwise), bottom-left
  export const ARC_SWEEP_DEG = 270;
  export function snap(value: number, step: number, min: number): number
  export function valueToAngle(value: number, min: number, max: number): number   // 135..405
  export function angleToValue(angleDeg: number, min: number, max: number, step: number): number
  export function pointToAngle(x: number, y: number, cx: number, cy: number): number  // 0..360
  export function hitsArc(x: number, y: number, cx: number, cy: number, radius: number, tolerance: number): boolean
  export function tempColor(value: number, min: number, max: number): string     // "rgb(r, g, b)"
  ```

- [ ] **Step 1: Write failing tests:**
  - `valueToAngle(5,5,30) === 135`, `valueToAngle(30,5,30) === 405`, `valueToAngle(17.5,5,30) === 270`
  - `angleToValue(270,5,30,0.5) === 17.5`; `angleToValue(135,5,30,0.5) === 5`; `angleToValue(45,5,30,0.5) === 30` (45° ≡ 405°)
  - angles in the bottom gap snap to the nearer end: `angleToValue(100,5,30,0.5) === 30`, `angleToValue(120,5,30,0.5) === 5`
  - `snap(21.3,0.5,5) === 21.5`; `snap(21.2,0.5,5) === 21`
  - `hitsArc(150+120,150,150,150,120,20)` → true; the centre `(150,150)` → false; `(150+145,150)` → false
  - `tempColor(5,5,30) === 'rgb(63, 127, 255)'`, `tempColor(17.5,5,30) === 'rgb(255, 152, 0)'`, `tempColor(30,5,30) === 'rgb(229, 57, 53)'`

- [ ] **Step 2: Run** `npx vitest run test/dial-math.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** For `angleToValue`, normalise the angle into [135, 405). If it falls in the gap (45..135 after normalising, i.e. 405..495), clamp to whichever end is nearer. For `tempColor`, do linear RGB interpolation over the stops `#3f7fff` (t=0), `#ff9800` (t=0.5) and `#e53935` (t=1), clamping t to [0, 1].

- [ ] **Step 4: Run** the same tests. Expected: PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: dial geometry and temperature colour"`

---

### Task 5: `hrc-dial` element

**Files:**
- Create: `src/components/hrc-dial.ts`, `test/hrc-dial.test.ts`

**Interfaces:**
- Consumes: Task 4's exports, `StatusKind`
- Produces: the custom element `<hrc-dial>` (class `HrcDial`) with these properties:
  `value: number | null`, `min = 5`, `max = 30`, `step = 0.5`, `current: number | null`, `status: StatusKind`, `statusLabel: string`, `expected: number | null`, `hintLabel: string`, `pending = false`.
  It fires the event `hrc-change` (`CustomEvent<{ value: number }>`, bubbles, composed) **once, on pointerup, and only if the value differs** from `value` at pointerdown.
- SVG viewBox `0 0 300 300`, centre (150,150), radius 120, stroke 24, hit tolerance 20.

- [ ] **Step 1: Write failing tests.** Mount the element in happy-dom, and stub `getBoundingClientRect` to `{left:0, top:0, width:300, height:300}` so client coordinates equal viewBox coordinates. Dispatch `PointerEvent`s on the element's `svg`.
  - `pointerdown off-arc does nothing` → down at (150,150), move to (150,30), up → no `hrc-change`, and `value` is unchanged
  - `drag on arc emits once on release` → value 17.5; down at (150,30) (top, 270° = 17.5), move to (270,150) (0° ≡ 360° → 25.83 → snapped 26), up → exactly 1 event with `value === 26`, and 0 events before up
  - `release at the same value emits nothing` → down and up at (150,30) with value 17.5 → 0 events
  - `external value update during drag is ignored` → during the drag, set `el.value = 10`; the displayed value stays as the dragged value until pointerup
  - `null value renders "—"` → the shadow text contains `—`
  - `status class` → `status="wants_heat"` puts the class `status-wants_heat` on the root
  - `expected hint shown only when expected !== value` → with expected 17, value 21.5, the text contains `plán 17` (when hintLabel is `plán`); with expected 21.5 there's no hint

- [ ] **Step 2: Run** `npx vitest run test/hrc-dial.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - The host has `touch-action: pan-y`; the SVG arc group and the knob have `touch-action: none`.
  - On `pointerdown`: convert to viewBox coordinates; if `!hitsArc(...)`, return without calling preventDefault. Otherwise call `setPointerCapture`, `preventDefault()`, store the start value, and set `dragValue`.
  - `pointermove` updates `dragValue` via `angleToValue(pointToAngle(...))`. `pointerup` and `pointercancel` end the drag and emit if changed.
  - Render `dragValue ?? value`. When `value` is null, the knob sits at min.
  - Draw the track arc and the filled arc (`stroke-dasharray`), filled with `tempColor`. Draw the expected tick at `valueToAngle(expected)`.
  - The centre shows the status label, the big integer + small decimal, `🌡 current °C`, and the hint `▲ {hintLabel} {expected}°`.
  - `pending` → the value text gets opacity 0.5.
  - Styles: `.status-wants_heat` has a slow pulse animation (2s) in amber `#ffb300`; `.status-heating` adds a `drop-shadow` glow in the arc color; `.status-off` and `.status-unavailable` show a grey arc (`--disabled-color`).

- [ ] **Step 4: Run** the same tests. Expected: PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: scroll-safe dial element"`

---

### Task 6: `hrc-schedule` element

**Files:**
- Create: `src/components/hrc-schedule.ts`, `test/hrc-schedule.test.ts`

**Interfaces:**
- Consumes: `ScheduleSnapshot`, `timelineSegments`, `formatTime`, `isWeekend`
- Produces: the custom element `<hrc-schedule>` with properties `schedule: ScheduleSnapshot`, `now: Date`, `labels: { weekdays: string; weekend: string }`. Clicking anywhere on it fires `hrc-edit` (bubbles, composed). It's also keyboard-accessible: `role="button"`, `tabindex=0`, Enter/Space.

- [ ] **Step 1: Write failing tests:**
  - the weekday row renders one `.seg` per segment with `style.left`/`width` as percentages; for 560/1430 it has 3 segments, and the middle one has class `day`, left `38.88…%`
  - `now` on a Saturday → the weekend row has class `today` and contains `.now-marker`; the weekday row has neither
  - `enabled:false` → the host has the attribute/class `disabled` (dimmed)
  - the text shows `09:20–23:50`, `17.0°`, `21.5°`; null times or temps render `—` and the row shows no segments
  - a click fires `hrc-edit`

- [ ] **Step 2: Run** `npx vitest run test/hrc-schedule.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** Colors: night segments are indigo `#5c6bc0`, and day segments use `var(--mdc-theme-secondary, var(--accent-color, #ff9800))`. Temperatures are formatted with one decimal.

- [ ] **Step 4: Run** the same tests. Expected: PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: schedule timeline element"`

---

### Task 7: `hrc-editor` element

**Files:**
- Create: `src/components/hrc-editor.ts`, `test/hrc-editor.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface EditorValues { nightTemp: number | null; dayTemp: number | null;
    weekdayDay: number | null; weekdayNight: number | null; weekendDay: number | null; weekendNight: number | null; }  // temps °C, times minutes
  export interface NumberLimits { min: number; max: number; step: number; }
  ```
  The custom element `<hrc-editor>` has properties `open = false`, `initial: EditorValues`, `nightLimits: NumberLimits`, `dayLimits: NumberLimits`, and `labels: { night; day; weekdays; weekend; save; cancel }`.
  - It fires `hrc-save` (`CustomEvent<Partial<EditorValues>>`, which contains **only changed keys**) and `hrc-close`.
  - Opening resets the working copy from `initial`.

- [ ] **Step 1: Write failing tests:**
  - with `open=false`, nothing renders (no `.sheet`)
  - tapping night `+` twice (step 0.5) and then Save → the detail is `{ nightTemp: 18 }` from an initial 17; `+` at max stays at max
  - changing the weekday-day `<input type=time>` to `09:30` (dispatch `change`) and Save → `{ weekdayDay: 570 }`
  - Save with nothing changed → the detail is `{}`, and the element still fires `hrc-close`
  - Cancel, a backdrop click and the Escape key each fire `hrc-close` and no `hrc-save`

- [ ] **Step 2: Run** `npx vitest run test/hrc-editor.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Layout: a `position: fixed` backdrop; the sheet is anchored to the bottom, full width, with rounded top corners.
  - At `@media (min-width: 600px)` it becomes a centred dialog with max-width 420px.
  - Steppers are 48px buttons. Time inputs use `step="600"`.

- [ ] **Step 4: Run** the same tests. Expected: PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: schedule editor sheet"`

---

### Task 8: `heating-room-card` main element

**Files:**
- Create: `src/heating-room-card.ts`, `test/card.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces: the custom element `heating-room-card` (class `HeatingRoomCard`) with:
  - `setConfig(raw)`, which calls `normalizeConfig` and rethrows so HA shows the config error
  - `set hass(h: Hass)`
  - `getCardSize(): 6`
  - `getGridOptions(): { columns: 12 }`
  - `static getStubConfig()`, which returns an example config
  - a push to `window.customCards` (`{ type: 'heating-room-card', name: 'Heating Room Card', description }`)

- [ ] **Step 1: Write failing tests** with `makeHass` and full fixtures for a 1-TRV room and a 2-TRV room:
  - `renders one valve chip per TRV`: 1-TRV config → 1 `.valve-chip`; 2-TRV → 2, showing the sensor state + `%`
  - `on/off pill toggles schedule.enabled` → a click → `calls` contains `['input_boolean','toggle',{entity_id: cfg.schedule.enabled}]`
  - `dial release → set_temperature on config.climate only` → dispatch `hrc-change {value: 22}` from `hrc-dial` → exactly one call: `['climate','set_temperature',{entity_id:'climate.shelly_trv_2', temperature:22}]`
  - `pending until HA confirms`: after the change, the dial gets `pending=true` and `value=22`; a new hass with temperature 22 → `pending=false`. Use fake timers: with no confirmation, after 10 000ms `pending=false` and the value reverts to the hass temperature
  - `hass update during pending does not overwrite the value` (temperature still 21.5) → the dial value stays 22
  - `editor save writes only changed fields` → `hrc-save {nightTemp: 18, weekendDay: 630}` → the calls are `['input_number','set_value',{entity_id: night_temp, value:18}]` and `['input_datetime','set_datetime',{entity_id: weekend.day, time:'10:30:00'}]`, and nothing else
  - `low battery chip` → with batteries `92` and `18` and `battery_warning` 25, one `.battery-chip` shows `18%`; with all ≥ 25 there's no chip; a battery state of `unavailable` is ignored
  - `missing entities don't throw` → a hass with only the climate entity renders, and the text contains `—`
  - `climate off` → the dial status is `off` and its value is null; the dial still renders
  - `the icon is tinted only when enabled` → `.room-icon` has class `active` when the enabled entity is `on`
  - `more-info`: clicking a valve chip dispatches `hass-more-info` with `{ entityId }`

- [ ] **Step 2: Run** `npx vitest run test/card.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Header: `ha-icon` (it renders fine as an unknown element in tests), the name (defaulting to the climate's friendly_name), the pill (`t('on')` / `t('off')`), and the valve chips (`mdi:pipe-valve` + %).
  - Then `<hrc-dial>`: min, max and step come from the climate attributes `min_temp`, `max_temp` and `target_temp_step` (defaults 5 / 30 / 0.5). `value` is the attribute `temperature` (null when the state is off or unavailable). `current` is `current_temperature`. `expected` is `expectedTemp(readSchedule(...), new Date())`.
  - Then `<hrc-schedule>` and the battery chip.
  - `<hrc-editor>` takes its limits from the input_number attributes `min`, `max` and `step`.
  - `now` refreshes every 60s via `setInterval`, started in `connectedCallback` and cleared in `disconnectedCallback`.
  - Pending state: `pendingValue` + a timeout. On each hass update, if the confirmed temperature equals `pendingValue`, clear it.

- [ ] **Step 4: Run** `npx vitest run`. Expected: all suites PASS.

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: heating-room-card main element"`

---

### Task 9: Build, dev harness, README

**Files:**
- Create: `dev/index.html`, `README.md`

- [ ] **Step 1: Dev harness.** `dev/index.html` imports `/src/heating-room-card.ts`. It builds two cards, one for the 2-TRV Tech. Izba config from the spec and one for the 1-TRV Spálňa config. Each gets a mocked hass with dark-theme CSS variables, and a 360px-wide column for the phone width. Its `callService` mutates the mock states and re-assigns `hass`, so dragging and saving visibly round-trip. It also has buttons to cycle the TRV `hvac_action` and the boiler state.

- [ ] **Step 2: Build.** Run `npm run build`. Expected: `dist/heating-room-card.js` exists, the build prints no errors, and `grep -c "from \"lit" dist/heating-room-card.js` prints `0` (Lit is bundled).

- [ ] **Step 3: Manual check.** Run `npm run dev` and open `/dev/index.html` at phone width. Check that:
  - a vertical swipe starting on the dial centre scrolls the page
  - a drag on the arc changes the value, with one call logged on release
  - both cards render, with 2 valve chips and 1 valve chip
  - the card height is ≤ about 500px

- [ ] **Step 4: README.** Cover:
  - install: copy `dist/heating-room-card.js` to `/config/www/`, and add the resource `/local/heating-room-card.js` (JavaScript module)
  - the 1-TRV and 2-TRV config examples from the spec
  - the option table
  - the status table

- [ ] **Step 5: Commit** `git add -A && git commit -m "docs: README and dev harness"`
