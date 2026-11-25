import type { Hass, HassEntity, NormalizedConfig } from './types';

const DOWN = ['unavailable', 'unknown'];

function setpoint(entity: HassEntity | undefined): number | null {
  if (!entity || entity.state === 'off' || DOWN.includes(entity.state)) return null;
  const v = entity.attributes?.temperature;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * TRVs other than the dial's one that HA can't reach. The dial's own TRV is left out: the status
 * line already says Unavailable for it.
 */
export function offlineTrvs(hass: Hass, cfg: NormalizedConfig): string[] {
  return cfg.trvs
    .map((trv) => trv.climate)
    .filter((id) => id !== cfg.climate)
    .filter((id) => {
      const e = hass.states[id];
      return !e || DOWN.includes(e.state);
    });
}

/**
 * TRVs whose setpoint differs from the dial's TRV. Only TRVs that are on and report a setpoint
 * are compared, so an offline or switched-off TRV never counts as out of sync.
 */
export function outOfSyncTrvs(hass: Hass, cfg: NormalizedConfig): string[] {
  const target = setpoint(hass.states[cfg.climate]);
  if (target === null) return [];
  return cfg.trvs
    .map((trv) => trv.climate)
    .filter((id) => id !== cfg.climate)
    .filter((id) => {
      const s = setpoint(hass.states[id]);
      return s !== null && Math.abs(s - target) > 0.01;
    });
}
