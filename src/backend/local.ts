import { SEED_CATEGORIES, SEED_ITEMS } from '../data/seed';
import { appendAndCapChat, stripPhotosForLocalCache } from '../lib/chatHelpers';
import type {
  AppState,
  Backend,
  CatalogItem,
  Category,
  ChatMessage,
  CheckoutMode,
  ListEntry,
  ShopperPresence,
  SyncState,
} from '../types';

interface Persisted {
  categories: Category[];
  catalog: Record<string, CatalogItem>;
  list: Record<string, ListEntry>;
  chat: ChatMessage[];
  shopper: ShopperPresence | null;
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
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        return {
          categories: Array.isArray(parsed.categories) ? parsed.categories : SEED_CATEGORIES,
          catalog: parsed.catalog ?? Object.fromEntries(SEED_ITEMS.map((i) => [i.id, i])),
          list: parsed.list ?? {},
          chat: Array.isArray(parsed.chat) ? parsed.chat : [],
          shopper: parsed.shopper ?? null,
        };
      }
    } catch {
      /* corrupted – reseed */
    }
    const seeded: Persisted = {
      categories: SEED_CATEGORIES,
      catalog: Object.fromEntries(SEED_ITEMS.map((i) => [i.id, i])),
      list: {},
      chat: [],
      shopper: null,
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
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...data, chat: stripPhotosForLocalCache(data.chat) }));
      } catch {
        /* ignore quota overflow in restricted environments */
      }
    }
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
        return { ...d, list, chat: [], shopper: null };
      }),
    sendChatMessage: (msg) => commit((d) => ({ ...d, chat: appendAndCapChat(d.chat, msg) })),
    clearChat: () => commit((d) => ({ ...d, chat: [] })),
    setShopper: (shopper) => commit((d) => ({ ...d, shopper })),
  };
}
