import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CatalogView } from './components/CatalogView';
import { AddItemSheet, CheckoutSheet, EditItemSheet, NoteSheet, SettingsSheet, ShareSheet } from './components/Sheets';
import { SuperChat } from './components/SuperChat';
import { SuperView } from './components/SuperView';
import { VoiceAssistant } from './components/VoiceAssistant';
import { RollingNumber, Toast, type ToastData } from './components/ui';
import { isMyShopperActive, isShopperActive, SHOPPER_STALE_MS } from './lib/chatHelpers';
import { getDeviceId, getPendingInviteFromUrl, haptic, resolveFamilyId } from './lib/util';
import { consumeAiKeyFromUrlHash } from './lib/voiceAi';
import { useStore } from './lib/useStore';
import type { CatalogItem, ListEntry } from './types';
import { IconHome, IconCart, IconMessage, IconShare, IconSettings } from './components/Icons';
import fridgeSolo from './assets/fridge-retro-solo.png';
import fridgeBadge from './assets/fridge-retro-badge.png';
import { OnboardingModal } from './components/OnboardingModal';

type Mode = 'home' | 'super';
type SheetState =
  | { kind: 'add'; name: string }
  | { kind: 'edit'; item: CatalogItem }
  | { kind: 'note'; item: CatalogItem }
  | { kind: 'checkout' }
  | { kind: 'settings'; focusSection?: 'ai' }
  | { kind: 'share' }
  | null;

function consumeInitialVoiceFlag(): boolean {
  const url = new URL(location.href);
  if (url.searchParams.get('voice') !== '1') return false;
  url.searchParams.delete('voice');
  history.replaceState(null, '', url.toString());
  return true;
}

function consumeInitialChatFlag(): boolean {
  const url = new URL(location.href);
  if (url.searchParams.get('chat') !== '1') return false;
  url.searchParams.delete('chat');
  history.replaceState(null, '', url.toString());
  return true;
}

export default function App() {
  const [familyId, setFamilyId] = useState<string | null>(resolveFamilyId);
  const [pendingInvite, setPendingInvite] = useState<string | null>(getPendingInviteFromUrl);
  const { state, sync, kind, actions } = useStore(familyId);
  const me = useMemo(getDeviceId, []);
  const [mode, setModeRaw] = useState<Mode>(() => (localStorage.getItem('fs:mode') as Mode) || 'home');
  const [enteredAt, setEnteredAt] = useState(() => Number(localStorage.getItem('fs:superEnteredAt')) || Date.now());
  const [sheet, setSheet] = useState<SheetState>(null);
  const [initialVoiceLaunch] = useState<boolean>(consumeInitialVoiceFlag);
  const [initialChatLaunch] = useState<boolean>(consumeInitialChatFlag);
  const [initialImportedAi] = useState(() => consumeAiKeyFromUrlHash());
  const [autoOpenVoiceTrigger, setAutoOpenVoiceTrigger] = useState(0);
  const [autoOpenChatTrigger, setAutoOpenChatTrigger] = useState(0);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [askItemRequest, setAskItemRequest] = useState<{ id: number; item: CatalogItem } | null>(null);
  const [voiceCatalogCmd, setVoiceCatalogCmd] = useState<{
    id: number;
    filter?: 'all' | 'core' | 'cart';
    query?: string;
  } | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const topbarRowRef = useRef<HTMLDivElement>(null);
  const safeShieldRef = useRef<HTMLDivElement>(null);
  const ignoreScrollUntilRef = useRef(0);
  const metricsRef = useRef({ shieldH: 0, fullH: 62, rowH: 60 });

  const syncStickyVars = useCallback((collapsed: boolean, currentMode: Mode) => {
    const { shieldH, fullH, rowH } = metricsRef.current;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--top-h', `${shieldH + fullH}px`);
    rootStyle.setProperty('--topbar-row-h', `${rowH}px`);
    const collapsedH = shieldH + Math.max(0, fullH - rowH);
    rootStyle.setProperty('--sticky-h', `${currentMode === 'home' && collapsed ? collapsedH : shieldH + fullH}px`);
  }, []);

  // Expose sticky header height and collapsible row metrics to CSS / scroll math.
  useEffect(() => {
    const updateMetrics = () => {
      const shieldH = safeShieldRef.current?.getBoundingClientRect().height ?? 0;
      const fullH = headerRef.current?.getBoundingClientRect().height ?? 62;
      const rowH = topbarRowRef.current?.getBoundingClientRect().height ?? 60;
      metricsRef.current = { shieldH, fullH, rowH };
      syncStickyVars(headerCollapsed, mode);
    };
    updateMetrics();
    const ro = new ResizeObserver(updateMetrics);
    if (headerRef.current) ro.observe(headerRef.current);
    if (topbarRowRef.current) ro.observe(topbarRowRef.current);
    if (safeShieldRef.current) ro.observe(safeShieldRef.current);
    return () => ro.disconnect();
  }, [headerCollapsed, mode, syncStickyVars]);

  useEffect(() => {
    syncStickyVars(headerCollapsed, mode);
  }, [headerCollapsed, mode, syncStickyVars]);

  // Collapse topbar row on downward scroll in home mode; reveal promptly on upward scroll.
  useEffect(() => {
    let lastY = window.scrollY;
    let downAccum = 0;
    let upAccum = 0;

    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 12);

      if (mode !== 'home') {
        setHeaderCollapsed(false);
        lastY = y;
        downAccum = 0;
        upAccum = 0;
        return;
      }

      if (y <= 44) {
        setHeaderCollapsed(false);
        downAccum = 0;
        upAccum = 0;
        lastY = y;
        return;
      }

      if (performance.now() < ignoreScrollUntilRef.current) {
        lastY = y;
        return;
      }

      if (y + window.innerHeight >= document.documentElement.scrollHeight - 6) {
        lastY = y;
        return;
      }

      const dy = y - lastY;
      lastY = y;

      if (dy > 0) {
        upAccum = 0;
        downAccum += dy;
        if (y > 76 && downAccum >= 18) {
          setHeaderCollapsed(true);
        }
      } else if (dy < 0) {
        downAccum = 0;
        upAccum += -dy;
        if (upAccum >= 14) {
          setHeaderCollapsed(false);
        }
      }
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [mode]);

  useEffect(() => {
    document.body.dataset.mode = mode;
    return () => {
      delete document.body.dataset.mode;
    };
  }, [mode]);

  const autoVoiceFiredRef = useRef(false);
  useEffect(() => {
    if (!initialVoiceLaunch || !familyId || !state.ready || autoVoiceFiredRef.current) return;
    autoVoiceFiredRef.current = true;
    setAutoOpenVoiceTrigger((n) => n + 1);
  }, [initialVoiceLaunch, familyId, state.ready]);

  const autoChatFiredRef = useRef(false);
  useEffect(() => {
    if (!initialChatLaunch || !familyId || !state.ready || autoChatFiredRef.current) return;
    autoChatFiredRef.current = true;
    setAutoOpenChatTrigger((n) => n + 1);
  }, [initialChatLaunch, familyId, state.ready]);

  const latestShopperRef = useRef(state.shopper);
  latestShopperRef.current = state.shopper;
  useEffect(() => {
    if (!familyId || !state.ready || mode !== 'super') return;
    const t = window.setTimeout(() => {
      const cur = latestShopperRef.current;
      const needRefresh =
        !cur ||
        !cur.active ||
        Date.now() - cur.enteredAt >= SHOPPER_STALE_MS;
      if (needRefresh) {
        void actions.setShopperActive(true);
      }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [familyId, state.ready, mode, me, actions]);

  const onProgrammaticScroll = useCallback((collapse: boolean) => {
    ignoreScrollUntilRef.current = performance.now() + 450;
    setHeaderCollapsed(collapse);
  }, []);

  const showToast = useCallback((text: string, undo?: () => void) => {
    setToast({ id: Date.now(), text, onAction: undo, actionLabel: undo ? 'בטל ↩' : undefined });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  const importedAiToastedRef = useRef(false);
  useEffect(() => {
    if (!initialImportedAi || importedAiToastedRef.current) return;
    importedAiToastedRef.current = true;
    showToast(`העוזר הקולי (${initialImportedAi.label}) הופעל במכשיר הזה`);
  }, [initialImportedAi, showToast]);

  useEffect(() => {
    const onHashChange = () => {
      if (!location.hash.startsWith('#ai=')) return;
      const imported = consumeAiKeyFromUrlHash();
      if (imported) {
        showToast(`העוזר הקולי (${imported.label}) הופעל במכשיר הזה`);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [showToast]);

  const setMode = (m: Mode) => {
    if (m === mode) return;
    haptic();
    setHeaderCollapsed(false);
    if (m === 'super' && !isMyShopperActive(state.shopper, me)) {
      const now = Date.now();
      localStorage.setItem('fs:superEnteredAt', String(now));
      setEnteredAt(now);
      void actions.setShopperActive(true);
    }
    localStorage.setItem('fs:mode', m);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished?: Promise<unknown> } | undefined;
    };
    if (!reduced && typeof doc.startViewTransition === 'function') {
      const root = document.documentElement;
      root.classList.add('is-mode-transitioning');
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        window.clearTimeout(fallbackTimer);
        root.classList.remove('is-mode-transitioning');
      };
      const fallbackTimer = window.setTimeout(cleanup, 450);
      try {
        const vt = doc.startViewTransition(() => {
          flushSync(() => setModeRaw(m));
          window.scrollTo({ top: 0 });
        });
        if (vt?.finished) {
          vt.finished.finally(cleanup);
        } else {
          cleanup();
        }
      } catch {
        cleanup();
        setModeRaw(m);
        window.scrollTo({ top: 0 });
      }
    } else {
      setModeRaw(m);
      window.scrollTo({ top: 0 });
    }
  };

  const undoRemove = useCallback(
    (removed: ListEntry, name: string) => showToast(`"${name}" ירד מהרשימה`, () => actions.restoreEntry(removed)),
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

  if (!familyId) {
    return (
      <div className="app">
        <OnboardingModal
          pendingInviteId={pendingInvite}
          onComplete={(newId) => {
            setFamilyId(newId);
            setPendingInvite(null);
          }}
        />
      </div>
    );
  }

  const remaining = Object.values(state.list).filter((e) => !e.isPurchased && state.catalog[e.itemId]).length;
  const inList = Object.values(state.list).filter((e) => state.catalog[e.itemId]).length;

  return (
    <div className={`app mode-${mode}`}>
        <div className="topbar-safe-shield" ref={safeShieldRef} aria-hidden="true" />
        <header
          className={`topbar${mode === 'home' && headerCollapsed ? ' topbar-collapsed' : ''}${scrolled ? ' topbar-scrolled' : ''}`}
          ref={headerRef}
        >
        <div className="topbar-row" ref={topbarRowRef}>
          <button
            type="button"
            className="topbar-brand"
            onClick={() => setSheet({ kind: 'settings' })}
            aria-label="אודות והגדרות"
            title="אין כלום בבית"
          >
            <img src={fridgeSolo} alt="אין כלום בבית" className="topbar-fridge-icon" />
          </button>
          <div className="mode-toggle" role="tablist">
            <span className="mode-toggle-indicator" data-mode={mode} aria-hidden="true" />
            <button role="tab" aria-selected={mode === 'home'} className={mode === 'home' ? 'on' : ''} onClick={() => setMode('home')}>
              <IconHome className="mode-icon" />
              <span>בבית</span>
              {inList > 0 && (
                <span className="mode-count">
                  <RollingNumber value={inList} />
                </span>
              )}
            </button>
            <button role="tab" aria-selected={mode === 'super'} className={mode === 'super' ? 'on' : ''} onClick={() => setMode('super')}>
              <IconCart className="mode-icon" />
              <span>בסופר</span>
              {remaining > 0 && (
                <span className="mode-count">
                  <RollingNumber value={remaining} />
                </span>
              )}
            </button>
          </div>
          <button className="icon-btn top-icon" onClick={() => setSheet({ kind: 'share' })} aria-label="שיתוף והזמנה">
            <IconShare className="w-5 h-5" />
          </button>
          <button className="icon-btn top-icon" onClick={() => setSheet({ kind: 'settings' })} aria-label="הגדרות">
            <IconSettings className="w-5 h-5" />
            {kind && <span className={`sync-dot sync-${kind === 'local' ? 'local' : sync}`} />}
          </button>
        </div>
        {mode === 'home' && <div ref={setSlot} />}
      </header>

      <div className="app-main-stage">
        {!state.ready ? (
          <div className="app-splash-loading">
            <img src={fridgeBadge} alt="אין כלום בבית" className="splash-fridge-icon" />
            <div className="splash-title">אין כלום בבית</div>
            <div className="splash-sub">רגע, בודקים מה חסר…</div>
          </div>
        ) : mode === 'home' ? (
          <>
            {isShopperActive(state.shopper, me) && state.shopper && (
              <div className="shopper-live-wrap">
                <button
                  type="button"
                  className="shopper-live-banner"
                  onClick={() => setAutoOpenChatTrigger((n) => n + 1)}
                >
                  <span className="shopper-live-status">
                    <span className="chat-live-dot" aria-hidden="true" />
                    <span>{state.shopper.name} נמצא כרגע בסופר</span>
                  </span>
                  <span className="shopper-live-cta">
                    <IconMessage className="w-3.5 h-3.5" />
                    <span>לצ&apos;אט</span>
                  </span>
                </button>
              </div>
            )}
            <CatalogView
              state={state}
              toolbarSlot={slot}
              onToggle={onToggle}
              onQty={onQty}
              onNote={onNote}
              onEdit={onEdit}
              onAddNew={onAddNew}
              onProgrammaticScroll={onProgrammaticScroll}
              voiceFilterCmd={voiceCatalogCmd}
            />
          </>
        ) : (
          <SuperView
            state={state}
            enteredAt={enteredAt}
            onTogglePurchased={onTogglePurchased}
            onCheckout={() => setSheet({ kind: 'checkout' })}
            onGoHome={() => setMode('home')}
            onAskItem={(item) => setAskItemRequest({ id: Date.now(), item })}
          />
        )}
      </div>

      {sheet?.kind === 'add' && (
        <AddItemSheet
          initialName={sheet.name}
          categories={state.categories}
          onClose={() => setSheet(null)}
          onSave={(name, cat, unit, qty) => {
            actions.addNewItem(name, cat, unit, qty);
            setSheet(null);
            showToast(`"${name}" נוסף לרשימה`);
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
            showToast(`נשארו ${remaining} מוצרים לפעם הבאה`);
          }}
          onResetAll={() => {
            actions.checkout('resetAll');
            setSheet(null);
            setMode('home');
            showToast('הרשימה אופסה לקראת הפעם הבאה 👍');
          }}
        />
      )}
      {sheet?.kind === 'settings' && (
        <SettingsSheet
          state={state}
          familyId={familyId}
          backendKind={kind}
          focusSection={sheet.focusSection}
          onSaveCategories={actions.saveCategories}
          onToast={showToast}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'share' && (
        <ShareSheet
          state={state}
          familyId={familyId}
          onToast={showToast}
          onClose={() => setSheet(null)}
        />
      )}

      {pendingInvite && pendingInvite !== familyId && (
        <OnboardingModal
          pendingInviteId={pendingInvite}
          onComplete={(newId) => {
            setFamilyId(newId);
            setPendingInvite(null);
          }}
          onDismissPendingInvite={() => setPendingInvite(null)}
        />
      )}

      {state.ready && (
        <>
          <VoiceAssistant
            state={state}
            mode={mode}
            actions={actions}
            setMode={setMode}
            onCatalogCommand={(cmd) => setVoiceCatalogCmd({ id: Date.now(), ...cmd })}
            onToast={showToast}
            onOpenAiSettings={() => setSheet({ kind: 'settings', focusSection: 'ai' })}
            autoOpenTrigger={autoOpenVoiceTrigger}
            otherSheetOpen={Boolean(sheet) || chatOpen}
            onVoiceSheetChange={setVoiceOpen}
          />
          <SuperChat
            state={state}
            familyId={familyId}
            mode={mode}
            actions={actions}
            onToast={showToast}
            autoOpenTrigger={autoOpenChatTrigger}
            askItemRequest={askItemRequest}
            otherSheetOpen={Boolean(sheet) || voiceOpen}
            onSheetOpenChange={setChatOpen}
          />
        </>
      )}

      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
