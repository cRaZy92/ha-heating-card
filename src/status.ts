import type { Hass, NormalizedConfig } from './types';

export type StatusKind = 'unavailable' | 'off' | 'idle' | 'wants_heat' | 'heating';

export function evaluateStatus(hass: Hass, cfg: NormalizedConfig): StatusKind {
  const primary = hass.states[cfg.climate];
  if (!primary || primary.state === 'unavailable' || primary.state === 'unknown') return 'unavailable';
  if (primary.state === 'off') return 'off';

  const anyHeating = cfg.trvs.some((trv) => hass.states[trv.climate]?.attributes?.hvac_action === 'heating');
  if (!anyHeating) return 'idle';

  if (!cfg.boiler) return 'heating';
  return hass.states[cfg.boiler]?.state === 'on' ? 'heating' : 'wants_heat';
}
