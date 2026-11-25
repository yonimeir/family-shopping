import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { SEED_CATEGORIES, SEED_ITEMS } from '../data/seed';
import { appendAndCapChat, MAX_CHAT_MESSAGES, MAX_CHAT_PHOTOS } from '../lib/chatHelpers';
import type {
  AppState,
  Backend,
  CatalogItem,
  Category,
  ChatMessage,
  ListEntry,
  ShopperPresence,
} from '../types';
import { firebaseConfig } from './config';

export async function createFirebaseBackend(familyId: string): Promise<Backend> {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);

  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    db = getFirestore(app);
  }

  // Ensure anonymous authentication asynchronously in the background so initial load is instant
  if (!auth.currentUser) {
    signInAnonymously(auth).catch((err) => console.warn('Anonymous auth note:', err));
  }

  const familyRef = doc(db, 'families', familyId);
  const catalogCol = collection(familyRef, 'catalog');
  const listCol = collection(familyRef, 'list');

  // Base catalog in-memory seed (always available immediately, zero latency)
  const baseCatalog: Record<string, CatalogItem> = Object.fromEntries(
    SEED_ITEMS.map((item) => [item.id, item])
  );

  let latest: AppState = {
    ready: true,
    categories: SEED_CATEGORIES,
    catalog: { ...baseCatalog },
    list: {},
    chat: [],
    shopper: null,
  };

  return {
    kind: 'firebase',
    subscribe(cb, onSync) {
      let customCatalog: Record<string, CatalogItem> = {};
      let currentList: Record<string, ListEntry> = {};
      let categories = SEED_CATEGORIES;
      let chat: ChatMessage[] = [];
      let shopper: ShopperPresence | null = null;

      const push = (pendingWrites = false) => {
        latest = {
          ready: true,
          categories,
          catalog: { ...baseCatalog, ...customCatalog },
          list: currentList,
          chat,
          shopper,
        };
        cb(latest);
        onSync?.(!navigator.onLine ? 'offline' : pendingWrites ? 'pending' : 'synced');
      };

      // Push initial state immediately so the UI is responsive from millisecond 0
      push(false);

      const onNet = () => push(false);
      window.addEventListener('online', onNet);
      window.addEventListener('offline', onNet);

      // Listen to family config (custom category orders, ephemeral chat, active shopper)
      const u1 = onSnapshot(
        familyRef,
        { includeMetadataChanges: true },
        (snap) => {
          const data = snap.exists() ? snap.data() : undefined;
          if (data) {
            if (data.categories) {
              categories = data.categories as Category[];
            }
            if (Array.isArray(data.chat)) {
              chat = [...(data.chat as ChatMessage[])].sort((a, b) => a.createdAt - b.createdAt);
            } else if ('chat' in data) {
              chat = [];
            }
            shopper = (data.shopper as ShopperPresence | null) ?? null;
          }
          push(snap.metadata.hasPendingWrites);
        },
        (err) => console.error('Firestore family snapshot error:', err)
      );

      // Listen to custom catalog items added by the family
      const u2 = onSnapshot(
        catalogCol,
        { includeMetadataChanges: true },
        (snap) => {
          const items: Record<string, CatalogItem> = {};
          snap.forEach((d) => {
            items[d.id] = d.data() as CatalogItem;
          });
          customCatalog = items;
          push(snap.metadata.hasPendingWrites);
        },
        (err) => console.error('Firestore catalog snapshot error:', err)
      );

      // Listen to the active shopping list in real-time
      const u3 = onSnapshot(
        listCol,
        { includeMetadataChanges: true },
        (snap) => {
          const list: Record<string, ListEntry> = {};
          snap.forEach((d) => {
            list[d.id] = d.data() as ListEntry;
          });
          currentList = list;
          push(snap.metadata.hasPendingWrites);
        },
        (err) => console.error('Firestore list snapshot error:', err)
      );

      return () => {
        u1();
        u2();
        u3();
        window.removeEventListener('online', onNet);
        window.removeEventListener('offline', onNet);
      };
    },

    setEntry: async (entry) => {
      try {
        await setDoc(doc(listCol, entry.itemId), entry);
      } catch (err) {
        console.error('Failed to set list entry:', err);
      }
    },

    patchEntry: async (itemId, patch) => {
      try {
        await updateDoc(doc(listCol, itemId), patch);
      } catch (err) {
        console.error('Failed to patch list entry:', err);
      }
    },

    removeEntry: async (itemId) => {
      try {
        await deleteDoc(doc(listCol, itemId));
      } catch (err) {
        console.error('Failed to remove list entry:', err);
      }
    },

    upsertCatalogItem: async (item) => {
      try {
        await setDoc(doc(catalogCol, item.id), item);
      } catch (err) {
        console.error('Failed to upsert catalog item:', err);
      }
    },

    deleteCatalogItem: async (id) => {
      try {
        const b = writeBatch(db);
        b.delete(doc(catalogCol, id));
        b.delete(doc(listCol, id));
        await b.commit();
      } catch (err) {
        console.error('Failed to delete catalog item:', err);
      }
    },

    saveCategories: async (cats) => {
      try {
        await setDoc(familyRef, { categories: cats }, { merge: true });
      } catch (err) {
        console.error('Failed to save categories:', err);
      }
    },

    checkout: async (mode) => {
      try {
        const b = writeBatch(db);
        for (const e of Object.values(latest.list)) {
          if (mode === 'resetAll' || e.isPurchased) {
            b.delete(doc(listCol, e.itemId));
          }
        }
        b.set(familyRef, { chat: [], shopper: null }, { merge: true });
        await b.commit();
      } catch (err) {
        console.error('Failed to checkout:', err);
      }
    },

    sendChatMessage: async (msg) => {
      try {
        const existingPhotos = latest.chat.filter((m) => Boolean(m.photoDataUrl)).length;
        const totalPhotos = existingPhotos + (msg.photoDataUrl ? 1 : 0);
        if (latest.chat.length + 1 <= MAX_CHAT_MESSAGES && totalPhotos <= MAX_CHAT_PHOTOS) {
          await setDoc(familyRef, { chat: arrayUnion(msg) }, { merge: true });
        } else {
          await setDoc(familyRef, { chat: appendAndCapChat(latest.chat, msg) }, { merge: true });
        }
      } catch (err) {
        console.error('Failed to send chat message:', err);
      }
    },

    clearChat: async () => {
      try {
        await setDoc(familyRef, { chat: [] }, { merge: true });
      } catch (err) {
        console.error('Failed to clear chat:', err);
      }
    },

    setShopper: async (next) => {
      try {
        await setDoc(familyRef, { shopper: next }, { merge: true });
      } catch (err) {
        console.error('Failed to set shopper:', err);
      }
    },
  };
}
