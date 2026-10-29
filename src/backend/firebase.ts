import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { SEED_CATEGORIES, SEED_ITEMS, SEED_VERSION } from '../data/seed';
import type { AppState, Backend, CatalogItem, Category, ListEntry } from '../types';
import { firebaseConfig } from './config';

/**
 * Firestore layout:
 *   families/{familyId}                 { categories[], seedVersion, createdAt }
 *   families/{familyId}/members/{uid}   { joinedAt }
 *   families/{familyId}/catalog/{id}    CatalogItem
 *   families/{familyId}/list/{id}       ListEntry   (exists only while in cart)
 *
 * One document per item + field-level updates => no lost writes when both partners tap at once.
 * persistentLocalCache => works offline, writes queue and sync later; snapshots fire instantly
 * with local writes (built-in optimistic UI).
 */
export async function createFirebaseBackend(familyId: string): Promise<Backend> {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });

  const user: User = auth.currentUser ?? (await waitForUser(auth)) ?? (await signInAnonymously(auth)).user;

  const familyRef = doc(db, 'families', familyId);
  const catalogCol = collection(familyRef, 'catalog');
  const listCol = collection(familyRef, 'list');

  // Register membership once per device (needs network the first time only).
  const joinedKey = `fs:joined:${familyId}:${user.uid}`;
  if (!localStorage.getItem(joinedKey)) {
    await setDoc(doc(familyRef, 'members', user.uid), { joinedAt: Date.now() }, { merge: true });
    localStorage.setItem(joinedKey, '1');
  }

  // Seed the catalog the first time this family is opened.
  try {
    const snap = await getDoc(familyRef);
    if (!snap.exists()) {
      const batch = writeBatch(db);
      batch.set(familyRef, { categories: SEED_CATEGORIES, seedVersion: SEED_VERSION, createdAt: Date.now() });
      for (const item of SEED_ITEMS) batch.set(doc(catalogCol, item.id), item);
      await batch.commit();
    }
  } catch (e) {
    console.warn('Seed check skipped (offline?)', e);
  }

  let latest: AppState = { ready: false, categories: [], catalog: {}, list: {} };

  return {
    kind: 'firebase',
    subscribe(cb, onSync) {
      const got = { family: false, catalog: false, list: false };
      const pending = { family: false, catalog: false, list: false };
      const push = () => {
        latest = { ...latest, ready: got.family && got.catalog && got.list };
        cb(latest);
        const anyPending = pending.family || pending.catalog || pending.list;
        onSync?.(!navigator.onLine ? 'offline' : anyPending ? 'pending' : 'synced');
      };
      const onNet = () => push();
      window.addEventListener('online', onNet);
      window.addEventListener('offline', onNet);

      const u1 = onSnapshot(familyRef, { includeMetadataChanges: true }, (s) => {
        got.family = true;
        pending.family = s.metadata.hasPendingWrites;
        const cats = (s.data()?.categories as Category[] | undefined) ?? SEED_CATEGORIES;
        latest = { ...latest, categories: cats };
        push();
      });
      const u2 = onSnapshot(catalogCol, { includeMetadataChanges: true }, (s) => {
        got.catalog = true;
        pending.catalog = s.metadata.hasPendingWrites;
        const catalog: Record<string, CatalogItem> = {};
        s.forEach((d) => (catalog[d.id] = d.data() as CatalogItem));
        latest = { ...latest, catalog };
        push();
      });
      const u3 = onSnapshot(listCol, { includeMetadataChanges: true }, (s) => {
        got.list = true;
        pending.list = s.metadata.hasPendingWrites;
        const list: Record<string, ListEntry> = {};
        s.forEach((d) => (list[d.id] = d.data() as ListEntry));
        latest = { ...latest, list };
        push();
      });
      return () => {
        u1();
        u2();
        u3();
        window.removeEventListener('online', onNet);
        window.removeEventListener('offline', onNet);
      };
    },
    // Writes are fire-and-forget: the local cache applies them instantly; awaiting would hang offline.
    setEntry: (entry) => (void setDoc(doc(listCol, entry.itemId), entry), Promise.resolve()),
    patchEntry: (itemId, patch) => (void updateDoc(doc(listCol, itemId), patch).catch(console.warn), Promise.resolve()),
    removeEntry: (itemId) => (void deleteDoc(doc(listCol, itemId)), Promise.resolve()),
    upsertCatalogItem: (item) => (void setDoc(doc(catalogCol, item.id), item), Promise.resolve()),
    deleteCatalogItem: (id) => {
      const b = writeBatch(db);
      b.delete(doc(catalogCol, id));
      b.delete(doc(listCol, id));
      void b.commit();
      return Promise.resolve();
    },
    saveCategories: (categories) => (void setDoc(familyRef, { categories }, { merge: true }), Promise.resolve()),
    checkout: (mode) => {
      const b = writeBatch(db);
      for (const e of Object.values(latest.list)) {
        if (mode === 'resetAll' || e.isPurchased) b.delete(doc(listCol, e.itemId));
      }
      void b.commit();
      return Promise.resolve();
    },
  };
}

function waitForUser(auth: ReturnType<typeof getAuth>): Promise<User | null> {
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((u) => {
      unsub();
      resolve(u);
    });
  });
}
