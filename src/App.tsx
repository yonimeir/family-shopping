import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CatalogView } from './components/CatalogView';
import { AddItemSheet, CheckoutSheet, EditItemSheet, NoteSheet, SettingsSheet } from './components/Sheets';
import { SuperView } from './components/SuperView';
import { Toast, type ToastData } from './components/ui';
import { buildShareText, haptic, resolveFamilyId } from './lib/util';
import { useStore } from './lib/useStore';
import type { CatalogItem, ListEntry } from './types';

type Mode = 'home' | 'super';
type SheetState =
  | { kind: 'add'; name: string }
  | { kind: 'edit'; item: CatalogItem }
  | { kind: 'note'; item: CatalogItem }
  | { kind: 'checkout' }
  | { kind: 'settings' }
  | null;

export default function App() {
  const familyId = useMemo(resolveFamilyId, []);
  const { state, sync, kind, actions } = useStore(familyId);
  const [mode, setModeRaw] = useState<Mode>(() => (localStorage.getItem('fs:mode') as Mode) || 'home');
  const [enteredAt, setEnteredAt] = useState(() => Number(localStorage.getItem('fs:superEnteredAt')) || Date.now());
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Expose sticky header height to CSS / scroll math.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      document.documentElement.style.setProperty('--top-h', `${el.getBoundingClientRect().height}px`)
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const showToast = useCallback((text: string, undo?: () => void) => {
    setToast({ id: Date.now(), text, onAction: undo, actionLabel: undo ? 'בטל ↩' : undefined });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  const setMode = (m: Mode) => {
    if (m === mode) return;
    haptic();
    if (m === 'super') {
      const now = Date.now();
      localStorage.setItem('fs:superEnteredAt', String(now));
      setEnteredAt(now);
    }
    localStorage.setItem('fs:mode', m);
    setModeRaw(m);
    window.scrollTo({ top: 0 });
  };

  const undoRemove = useCallback(
    (removed: ListEntry, name: string) => showToast(`"${name}" הוסר מהרשימה`, () => actions.restoreEntry(removed)),
    [actions, showToast]
  );

  const onToggle = useCallback(
    (item: CatalogItem) => {
      haptic();
      const removed = actions.toggleInCart(item);
      if (removed) undoRemove(removed, item.name);
    },
    [actions, undoRemove]
  );
  const onQty = useCallback(
    (item: CatalogItem, dir: 1 | -1) => {
      haptic(8);
      const removed = actions.changeQty(item, dir);
      if (removed) undoRemove(removed, item.name);
    },
    [actions, undoRemove]
  );
  const onNote = useCallback((item: CatalogItem) => setSheet({ kind: 'note', item }), []);
  const onEdit = useCallback((item: CatalogItem) => setSheet({ kind: 'edit', item }), []);
  const onAddNew = useCallback((name: string) => setSheet({ kind: 'add', name }), []);

  // No toast here (would cover the checkout button on every pick) – items stay in place
  // for ~650ms and the "collected" section allows un-picking.
  const onTogglePurchased = useCallback((id: string) => actions.togglePurchased(id), [actions]);

  const share = async () => {
    const text = buildShareText(state);
    if (!text) return showToast('אין מוצרים פתוחים לשיתוף');
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        showToast('📋 הרשימה הועתקה – אפשר להדביק בוואטסאפ');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        await navigator.clipboard?.writeText(text).catch(() => {});
        showToast('📋 הרשימה הועתקה');
      }
    }
  };

  const remaining = Object.values(state.list).filter((e) => !e.isPurchased && state.catalog[e.itemId]).length;
  const inList = Object.values(state.list).filter((e) => state.catalog[e.itemId]).length;

  return (
    <div className={`app mode-${mode}`}>
      <header className="topbar" ref={headerRef}>
        <div className="topbar-row">
          <div className="mode-toggle" role="tablist">
            <button role="tab" aria-selected={mode === 'home'} className={mode === 'home' ? 'on' : ''} onClick={() => setMode('home')}>
              🏠 בבית
              {inList > 0 && <span className="mode-count">{inList}</span>}
            </button>
            <button role="tab" aria-selected={mode === 'super'} className={mode === 'super' ? 'on' : ''} onClick={() => setMode('super')}>
              🛒 בסופר
              {remaining > 0 && <span className="mode-count">{remaining}</span>}
            </button>
          </div>
          <button className="icon-btn top-icon" onClick={share} aria-label="שיתוף / העתקת רשימה">
            📤
          </button>
          <button className="icon-btn top-icon" onClick={() => setSheet({ kind: 'settings' })} aria-label="הגדרות">
            ⚙️
            {kind && <span className={`sync-dot sync-${kind === 'local' ? 'local' : sync}`} />}
          </button>
        </div>
        {mode === 'home' && <div ref={setSlot} />}
      </header>

      {!state.ready ? (
        <div className="loading">טוען רשימה…</div>
      ) : mode === 'home' ? (
        <CatalogView
          state={state}
          toolbarSlot={slot}
          onToggle={onToggle}
          onQty={onQty}
          onNote={onNote}
          onEdit={onEdit}
          onAddNew={onAddNew}
        />
      ) : (
        <SuperView
          state={state}
          enteredAt={enteredAt}
          onTogglePurchased={onTogglePurchased}
          onCheckout={() => setSheet({ kind: 'checkout' })}
          onGoHome={() => setMode('home')}
        />
      )}

      {sheet?.kind === 'add' && (
        <AddItemSheet
          initialName={sheet.name}
          categories={state.categories}
          onClose={() => setSheet(null)}
          onSave={(name, cat, unit, qty) => {
            actions.addNewItem(name, cat, unit, qty);
            setSheet(null);
            showToast(`"${name}" נוסף למאגר ולרשימה`);
          }}
        />
      )}
      {sheet?.kind === 'edit' && (
        <EditItemSheet
          item={state.catalog[sheet.item.id] ?? sheet.item}
          state={state}
          onClose={() => setSheet(null)}
          onSave={(it) => {
            actions.updateItem(it);
            setSheet(null);
            showToast('נשמר');
          }}
          onDelete={(id) => {
            actions.deleteItem(id);
            setSheet(null);
            showToast('המוצר נמחק מהמאגר');
          }}
        />
      )}
      {sheet?.kind === 'note' && (
        <NoteSheet
          item={sheet.item}
          initial={state.list[sheet.item.id]?.notes ?? ''}
          onClose={() => setSheet(null)}
          onSave={(t) => {
            actions.setNote(sheet.item.id, t);
            setSheet(null);
          }}
        />
      )}
      {sheet?.kind === 'checkout' && (
        <CheckoutSheet
          remaining={remaining}
          onClose={() => setSheet(null)}
          onKeep={() => {
            actions.checkout('keepRemaining');
            setSheet(null);
            showToast(`נשארו ${remaining} מוצרים לקנייה הבאה`);
          }}
          onResetAll={() => {
            actions.checkout('resetAll');
            setSheet(null);
            setMode('home');
            showToast('🎉 הקנייה הושלמה, הרשימה אופסה');
          }}
        />
      )}
      {sheet?.kind === 'settings' && (
        <SettingsSheet
          state={state}
          familyId={familyId}
          backendKind={kind}
          onSaveCategories={actions.saveCategories}
          onToast={showToast}
          onClose={() => setSheet(null)}
        />
      )}

      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
