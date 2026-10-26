/**
 * @spatial/kernel — species/index.js
 * Species registry. §CS1 §CS2 §CS3.
 */
export { HUMAN_PROFILE }   from './human.js';
export { EQUINE_PROFILE }  from './equine.js';
export { CANINE_PROFILE }  from './canine.js';

const _registry = new Map();

export function registerProfile(profile) {
  if (!profile?.id) throw new Error('[species] profile.id required');
  _registry.set(profile.id, Object.freeze(profile));
}

export function getProfile(id) {
  return _registry.get(id) ?? null;
}

// Auto-register built-ins (lazy import to avoid circular)
import { HUMAN_PROFILE }  from './human.js';
import { EQUINE_PROFILE } from './equine.js';
import { CANINE_PROFILE } from './canine.js';

registerProfile(HUMAN_PROFILE);
registerProfile(EQUINE_PROFILE);
registerProfile(CANINE_PROFILE);

export const SPECIES_REGISTRY = _registry;
