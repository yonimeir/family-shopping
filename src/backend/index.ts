import type { Backend } from '../types';
import { isFirebaseConfigured } from './config';
import { createLocalBackend } from './local';

// Cached so React StrictMode's double effect doesn't initialise Firebase twice.
const cache = new Map<string, Promise<Backend>>();

export function createBackend(familyId: string): Promise<Backend> {
  let p = cache.get(familyId);
  if (!p) {
    p = init(familyId);
    cache.set(familyId, p);
  }
  return p;
}

async function init(familyId: string): Promise<Backend> {
  if (isFirebaseConfigured) {
    try {
      const { createFirebaseBackend } = await import('./firebase');
      return await createFirebaseBackend(familyId);
    } catch (e) {
      console.error('Firebase init failed – falling back to local mode', e);
    }
  }
  return createLocalBackend(familyId);
}
