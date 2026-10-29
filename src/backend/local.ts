import { SEED_CATEGORIES, SEED_ITEMS } from '../data/seed';
import type { AppState, Backend, CatalogItem, Category, CheckoutMode, ListEntry, SyncState } from '../types';

interface Persisted {
  categories: Category[];
  catalog: Record<string, CatalogItem>;
  list: Record<string, ListEntry>;
}

/**
 * Local-only backend (no Firebase config yet).
 * Persists to localStorage and syncs between tabs on the same device via BroadcastChannel,
 * so two tabs can simulate the two partners.
 */
export function createLocalBackend(familyId: string): Backend {
  const KEY = `fs:${familyId}:state`;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(`fs:${familyId}`) : null;
  const listeners = new Set<(s: AppState) => void>();

  const load = (): Persisted => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as Persisted;
    } catch {
      /* corrupted – reseed */
    }
    const seeded: Persisted = {
      categories: SEED_CATEGORIES,
      catalog: Object.fromEntries(SEED_ITEMS.map((i) => [i.id, i])),
      list: {},
    };
    localStorage.setItem(KEY, JSON.stringify(seeded));
    return seeded;
  };

  let data = load();

  const emit = () => {
    const s: AppState = { ready: true, ...data };
    listeners.forEach((l) => l(s));
  };

  const commit = (mutate: (d: Persisted) => Persisted) => {
    data = mutate(data);
    localStorage.setItem(KEY, JSON.stringify(data));
    emit();
    channel?.postMessage('changed');
    return Promise.resolve();
  };

  channel?.addEventListener('message', () => {
    data = load();
    emit();
  });

  return {
    kind: 'local',
    subscribe(cb, onSync?: (s: SyncState) => void) {
      listeners.add(cb);
      cb({ ready: true, ...data });
      onSync?.('synced');
      return () => listeners.delete(cb);
    },
    setEntry: (entry) => commit((d) => ({ ...d, list: { ...d.list, [entry.itemId]: entry } })),
    patchEntry: (itemId, patch) =>
      commit((d) => (d.list[itemId] ? { ...d, list: { ...d.list, [itemId]: { ...d.list[itemId], ...patch } } } : d)),
    removeEntry: (itemId) =>
      commit((d) => {
        const list = { ...d.list };
        delete list[itemId];
        return { ...d, list };
      }),
    upsertCatalogItem: (item) => commit((d) => ({ ...d, catalog: { ...d.catalog, [item.id]: item } })),
    deleteCatalogItem: (id) =>
      commit((d) => {
        const catalog = { ...d.catalog };
        const list = { ...d.list };
        delete catalog[id];
        delete list[id];
        return { ...d, catalog, list };
      }),
    saveCategories: (categories) => commit((d) => ({ ...d, categories })),
    checkout: (mode: CheckoutMode) =>
      commit((d) => {
        const list: Record<string, ListEntry> = {};
        if (mode === 'keepRemaining') {
          for (const e of Object.values(d.list)) if (!e.isPurchased) list[e.itemId] = e;
        }
        return { ...d, list };
      }),
  };
}
