import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
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
import type { AppState, Backend, CatalogItem, Category, ListEntry } from '../types';
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

  // Ensure anonymous authentication
  try {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
  } catch (err) {
    console.warn('Anonymous auth note:', err);
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
  };

  return {
    kind: 'firebase',
    subscribe(cb, onSync) {
      let customCatalog: Record<string, CatalogItem> = {};
      let currentList: Record<string, ListEntry> = {};
      let categories = SEED_CATEGORIES;

      const push = (pendingWrites = false) => {
        latest = {
          ready: true,
          categories,
          catalog: { ...baseCatalog, ...customCatalog },
          list: currentList,
        };
        cb(latest);
        onSync?.(!navigator.onLine ? 'offline' : pendingWrites ? 'pending' : 'synced');
      };

      // Push initial state immediately so the UI is responsive from millisecond 0
      push(false);

      const onNet = () => push(false);
      window.addEventListener('online', onNet);
      window.addEventListener('offline', onNet);

      // Listen to family config (custom category orders)
      const u1 = onSnapshot(
        familyRef,
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.exists() && snap.data()?.categories) {
            categories = snap.data().categories as Category[];
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
        await b.commit();
      } catch (err) {
        console.error('Failed to checkout:', err);
      }
    },
  };
}
