# Visual Card Editor — Design (short)

Date: 2026-11-25
Status: approved

## Intent

Set up a room's card entirely from the dashboard UI (pick entities, flip options) instead of YAML.
Today the card has no `getConfigElement`, so HA opens the YAML editor, and the stub config uses fake
entity ids, so a freshly added card is an error.

## Approaches

1. **HA's own `ha-form` + selectors. CHOSEN.** Looks and behaves like built-in editors (searchable
   entity pickers, theme, mobile). The TRV list (array of objects) is rendered as one small `ha-form`
   per TRV with add/remove buttons around it.
2. Hand-built inputs. Rejected: foreign look, more code, no entity search.

## Design

- **Sections:** General (name, icon, boiler `switch`/`input_boolean`) · TRVs (list; climate,
  valve sensor, battery sensor; "dial controls" choice when ≥ 2) · Schedule (on/off `input_boolean`,
  night/day `input_number`, weekday/weekend day/night `input_datetime`) · Display (`show_battery`,
  `battery_warning`).
- **Quick fill:** a dropdown of detected helper prefixes (any `P` with `input_number.P_night_temp`),
  also accepts typed text; picking one fills every schedule helper named
  `input_boolean.P_on_off`, `input_number.P_night_temp|P_day_temp`,
  `input_datetime.P_day_time|P_night_time|P_day_time_weekend|P_night_time_weekend` that exists.
- **Stub config:** `getStubConfig(hass)` uses the first real climate entity (and its
  `sensor.<object_id>_battery` if present), the first detected schedule prefix and `switch.kotol_rele`
  style boiler only if one exists — never fake ids.
- **Incomplete config:** the card renders a "finish setup" placeholder listing what is missing
  instead of throwing. Non-object configs still throw.
- **Config writing:** empty values are dropped; `climate` is only written with ≥ 2 TRVs and follows
  the TRV when its entity changes; removing the primary TRV drops it (defaults to the first).
- **Language:** sk / en, like the card.

## Left to the builder

Field order inside sections, styling of the TRV boxes, how `ha-form` gets loaded (the
`loadCardHelpers` trick).
