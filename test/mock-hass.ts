import type { Hass, HassEntity } from '../src/types';

export type MockHass = Hass & { calls: [string, string, Record<string, unknown>][]; fail: boolean };

export function makeHass(
  states: Record<string, [state: string, attrs?: Record<string, any>]>,
  language = 'en',
): MockHass {
  const entities: Record<string, HassEntity> = {};
  for (const [id, [state, attrs]] of Object.entries(states)) {
    entities[id] = { entity_id: id, state, attributes: attrs ?? {} };
  }
  const calls: MockHass['calls'] = [];
  return {
    states: entities,
    locale: { language },
    language,
    calls,
    fail: false,
    callService(domain, service, data) {
      calls.push([domain, service, data]);
      return this.fail ? Promise.reject(new Error('service failed')) : Promise.resolve();
    },
  };
}
