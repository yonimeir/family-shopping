import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createBackend } from '../backend';
import type { AppState, Backend, CatalogItem, Category, CheckoutMode, ListEntry, SyncState } from '../types';
import { getDeviceId, getMyName, stepDown, stepUp } from './util';

const EMPTY: AppState = { ready: false, categories: [], catalog: {}, list: {} };

export function useStore(familyId: string) {
  const [state, setState] = useState<AppState>(EMPTY);
  const [sync, setSync] = useState<SyncState>('synced');
  const [kind, setKind] = useState<Backend['kind'] | null>(null);
  const backendRef = useRef<Backend | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    createBackend(familyId).then((b) => {
      if (cancelled) return;
      backendRef.current = b;
      setKind(b.kind);
      unsub = b.subscribe(setState, setSync);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [familyId]);

  const b = () => backendRef.current!;

  const addToList = useCallback((item: CatalogItem, qty = item.defaultQty) => {
    const entry: ListEntry = {
      itemId: item.id,
      qty,
      notes: '',
      isPurchased: false,
      addedBy: getMyName(),
      addedByDevice: getDeviceId(),
      addedAt: Date.now(),
    };
    return b().setEntry(entry);
  }, []);

  const actions = useMemo(
    () => ({
      addToList,
      /** Returns the removed entry (for undo) or null when it was added. */
      toggleInCart(item: CatalogItem): ListEntry | null {
        const existing = stateRef.current.list[item.id];
        if (existing) {
          void b().removeEntry(item.id);
          return existing;
        }
        void addToList(item);
        return null;
      },
      restoreEntry: (e: ListEntry) => b().setEntry(e),
      /** Returns removed entry when qty hit 0. */
      changeQty(item: CatalogItem, dir: 1 | -1): ListEntry | null {
        const e = stateRef.current.list[item.id];
        if (!e) return null;
        const next = dir === 1 ? stepUp(e.qty, item.defaultUnit) : stepDown(e.qty, item.defaultUnit);
        if (next <= 0) {
          void b().removeEntry(item.id);
          return e;
        }
        void b().patchEntry(item.id, { qty: next });
        return null;
      },
      setNote: (itemId: string, notes: string) => b().patchEntry(itemId, { notes: notes.trim() }),
      togglePurchased(itemId: string) {
        const e = stateRef.current.list[itemId];
        if (!e) return;
        const isPurchased = !e.isPurchased;
        void b().patchEntry(itemId, { isPurchased, purchasedAt: isPurchased ? Date.now() : 0 });
      },
      addNewItem(name: string, categoryId: string, defaultUnit: string, defaultQty: number) {
        const maxIdx = Math.max(0, ...Object.values(stateRef.current.catalog).map((i) => i.sortIndex));
        const item: CatalogItem = {
          id: `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          name: name.trim(),
          categoryId,
          subCategory: 'נוספו על ידינו',
          defaultUnit,
          defaultQty,
          isCore: false,
          sortIndex: maxIdx + 1,
        };
        void b().upsertCatalogItem(item);
        void addToList(item);
        return item;
      },
      updateItem: (item: CatalogItem) => b().upsertCatalogItem(item),
      deleteItem: (id: string) => b().deleteCatalogItem(id),
      saveCategories: (cats: Category[]) => b().saveCategories(cats),
      checkout: (mode: CheckoutMode) => b().checkout(mode),
    }),
    [addToList]
  );

  return { state, sync, kind, actions };
}

export type Actions = ReturnType<typeof useStore>['actions'];
