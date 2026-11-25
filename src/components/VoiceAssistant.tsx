import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Actions } from '../lib/useStore';
import { useVoiceRecorder } from '../lib/useVoiceRecorder';
import {
  AI_KEY_UPDATED_EVENT,
  getAiKey,
  getAiProvider,
  hasActiveAiKey,
  PROVIDER_META,
  runVoiceCommand,
  shouldRequireConfirmation,
  type VoiceAction,
  type VoiceAiResult,
} from '../lib/voiceAi';
import { formatQty } from '../lib/util';
import type { AppState, ListEntry } from '../types';
import {
  IconCheck,
  IconChevronUp,
  IconClose,
  IconLock,
  IconMic,
  IconSparkles,
  IconStop,
  IconUndo,
} from './Icons';
import { RollingNumber, Sheet } from './ui';

type HoldPhase = 'idle' | 'holding' | 'locked' | 'thinking';

interface ChecklistItem {
  key: string;
  action: VoiceAction;
  title: string;
  meta: string;
  badgeText?: string;
  badgeTone?: 'new' | 'warn' | 'inlist' | 'done';
  checked: boolean;
}

interface PendingPlan {
  id: number;
  title: string;
  items: ChecklistItem[];
}

interface VoiceOutcome {
  id: number;
  transcript: string;
  reply: string;
  chips: string[];
  undo?: () => void;
  error?: string;
}

interface Props {
  state: AppState;
  mode: 'home' | 'super';
  actions: Actions;
  setMode: (m: 'home' | 'super') => void;
  onCatalogCommand: (cmd: { filter?: 'all' | 'core' | 'cart'; query?: string }) => void;
  onToast: (text: string, undo?: () => void) => void;
  onOpenAiSettings: () => void;
  autoOpenTrigger: number;
  otherSheetOpen: boolean;
  onVoiceSheetChange?: (open: boolean) => void;
}

function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

function LiveWaveform({
  analyserRef,
  active,
  bars = 12,
}: {
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  active: boolean;
  bars?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let rafId = 0;
    const freqBuf = new Uint8Array(32);

    const tick = (t: number) => {
      const container = wrapRef.current;
      if (container) {
        const analyser = analyserRef.current;
        if (analyser) analyser.getByteFrequencyData(freqBuf);
        const children = container.children;
        for (let i = 0; i < children.length; i++) {
          const el = children[i] as HTMLElement;
          const level = analyser
            ? (freqBuf[(i * 2) % freqBuf.length] || 0) / 255
            : 0.25 + 0.25 * Math.sin(t * 0.008 + i * 0.8);
          const scaleY = Math.max(0.24, Math.min(1.45, 0.28 + level * 1.15));
          el.style.transform = `scaleY(${scaleY.toFixed(3)})`;
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [active, analyserRef]);

  return (
    <div ref={wrapRef} className="voice-waveform" aria-hidden="true">
      {Array.from({ length: bars }, (_, idx) => (
        <span key={idx} className="voice-wave-bar" />
      ))}
    </div>
  );
}

export function VoiceAssistant({
  state,
  mode,
  actions,
  setMode,
  onCatalogCommand,
  onToast,
  onOpenAiSettings,
  autoOpenTrigger,
  otherSheetOpen,
  onVoiceSheetChange,
}: Props) {
  const recorder = useVoiceRecorder();
  const { start: startRecorder, stop: stopRecorder, cancel: cancelRecorder, clearError: clearRecorderError } = recorder;
  const [holdPhase, setHoldPhase] = useState<HoldPhase>('idle');
  const holdPhaseRef = useRef<HoldPhase>('idle');
  const [sheetOpen, setSheetOpenState] = useState(false);
  const [outcome, setOutcome] = useState<VoiceOutcome | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [thinkingLabel, setThinkingLabel] = useState('מקשיב ומפענח...');

  const hudRef = useRef<HTMLDivElement>(null);
  const lockPillRef = useRef<HTMLDivElement>(null);

  const gestureRef = useRef({
    watching: false,
    holdEngaged: false,
    locked: false,
    cancelled: false,
    stopTap: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    holdTimer: 0,
  });

  const updateHoldPhase = useCallback((next: HoldPhase) => {
    holdPhaseRef.current = next;
    setHoldPhase(next);
  }, []);

  const setSheetOpen = useCallback(
    (open: boolean) => {
      setSheetOpenState(open);
      onVoiceSheetChange?.(open);
    },
    [onVoiceSheetChange]
  );

  // Clean up any leftover recorder session when settings or another modal opens
  useEffect(() => {
    if (otherSheetOpen && (holdPhaseRef.current === 'holding' || holdPhaseRef.current === 'locked')) {
      cancelRecorder();
      updateHoldPhase('idle');
    }
  }, [otherSheetOpen, cancelRecorder, updateHoldPhase]);

  useEffect(() => {
    const syncAvailability = () => {
      if (!hasActiveAiKey() && (holdPhaseRef.current === 'holding' || holdPhaseRef.current === 'locked')) {
        cancelRecorder();
        updateHoldPhase('idle');
      }
    };
    window.addEventListener(AI_KEY_UPDATED_EVENT, syncAvailability);
    return () => window.removeEventListener(AI_KEY_UPDATED_EVENT, syncAvailability);
  }, [cancelRecorder, updateHoldPhase]);

  const closeSheet = useCallback(() => {
    cancelRecorder();
    updateHoldPhase('idle');
    setSheetOpen(false);
    setPendingPlan(null);
    setOutcome(null);
  }, [cancelRecorder, setSheetOpen, updateHoldPhase]);

  const startHandsFreeOnDock = useCallback(async () => {
    if (holdPhaseRef.current === 'thinking' || holdPhaseRef.current === 'locked') return;
    if (!hasActiveAiKey()) {
      onToast('הדביקו מפתח API בהגדרות כדי להפעיל הקלטה');
      onOpenAiSettings();
      return;
    }
    setSheetOpen(false);
    setOutcome(null);
    setPendingPlan(null);
    const recMode = PROVIDER_META[getAiProvider()].supportsNativeAudio ? 'audio' : 'speech';
    const ok = await startRecorder(recMode);
    if (ok) {
      haptic(14);
      updateHoldPhase('locked');
    } else {
      clearRecorderError();
      updateHoldPhase('idle');
      onToast('לא הצלחתי להפעיל את המיקרופון — בדקו הרשאה בהגדרות');
    }
  }, [clearRecorderError, onOpenAiSettings, onToast, setSheetOpen, startRecorder, updateHoldPhase]);

  // Triggered when app launched from `?voice=1` PWA shortcut
  useEffect(() => {
    if (autoOpenTrigger <= 0) return;
    void startHandsFreeOnDock();
  }, [autoOpenTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildChecklistItems = useCallback(
    (result: VoiceAiResult): ChecklistItem[] => {
      const catNameMap = new Map(state.categories.map((c) => [c.id, c.name]));
      return result.actions.map((action, idx) => {
        const key = `${Date.now()}_${idx}`;
        const existingItem = action.itemId ? state.catalog[action.itemId] : undefined;
        const unit = action.unit || existingItem?.defaultUnit || "יח'";
        const qty = typeof action.qty === 'number' && action.qty > 0 ? action.qty : existingItem?.defaultQty ?? 1;

        if (action.kind === 'create_and_add') {
          const catName = (action.categoryId && catNameMap.get(action.categoryId)) || 'כללי';
          return {
            key,
            action,
            title: action.name || 'מוצר חדש',
            meta: `${formatQty(qty, unit)} · ${catName}${action.note ? ` · ${action.note}` : ''}`,
            badgeText: 'חדש למאגר',
            badgeTone: 'new',
            checked: true,
          };
        }

        if (action.kind === 'remove') {
          return {
            key,
            action,
            title: existingItem?.name || action.name || 'הסרת מוצר',
            meta: 'הסרה מהרשימה',
            badgeText: 'הסרה',
            badgeTone: 'warn',
            checked: true,
          };
        }

        if (action.kind === 'clear_list') {
          return {
            key,
            action,
            title: 'איפוס כל הרשימה',
            meta: 'מחיקת כל הפריטים הפעילים',
            badgeText: 'איפוס מלא',
            badgeTone: 'warn',
            checked: true,
          };
        }

        if (action.kind === 'mark_purchased') {
          return {
            key,
            action,
            title: existingItem?.name || action.name || 'סימון מוצר',
            meta: action.purchased === false ? 'החזרה לרשימת הקנייה' : 'סימון כנאסף בעגלה',
            badgeText: action.purchased === false ? 'להביא' : 'נאסף',
            badgeTone: 'done',
            checked: true,
          };
        }

        if (action.kind === 'update_qty' || action.kind === 'set_note') {
          return {
            key,
            action,
            title: existingItem?.name || action.name || 'עדכון מוצר',
            meta: [
              action.qty ? formatQty(action.qty, unit) : '',
              action.note ? `הערה: ${action.note}` : '',
            ]
              .filter(Boolean)
              .join(' · ') || 'עדכון פרטים',
            badgeText: 'עדכון',
            badgeTone: 'inlist',
            checked: true,
          };
        }

        const alreadyInList = Boolean(existingItem && state.list[existingItem.id]);
        const defaultUncheckedForRecipe = Boolean(result.isRecipeOrMeal && alreadyInList);
        return {
          key,
          action,
          title: existingItem?.name || action.name || 'מוצר',
          meta: `${formatQty(qty, unit)}${action.note ? ` · ${action.note}` : ''}`,
          badgeText: alreadyInList ? 'כבר ברשימה' : undefined,
          badgeTone: alreadyInList ? 'inlist' : undefined,
          checked: !defaultUncheckedForRecipe,
        };
      });
    },
    [state.catalog, state.categories, state.list]
  );

  const executeActionsBatch = useCallback(
    (batchActions: VoiceAction[]): {
      chips: string[];
      undo: (() => void) | null;
      appliedCount: number;
    } => {
      const beforeList: Record<string, ListEntry> = { ...state.list };
      const affectedIds: string[] = [];
      const createdCatalogIds: string[] = [];
      const chips: string[] = [];
      let didClearAll = false;
      let appliedCount = 0;

      for (const act of batchActions) {
        if (act.kind === 'clear_list') {
          void actions.checkout('resetAll');
          didClearAll = true;
          appliedCount++;
          chips.push('הרשימה אופסה');
          continue;
        }

        if (act.kind === 'create_and_add') {
          const itemName = act.name?.trim();
          if (!itemName) continue;
          const validCatId =
            act.categoryId && state.categories.some((c) => c.id === act.categoryId)
              ? act.categoryId
              : state.categories[0]?.id || 'pantry';
          const unit = act.unit || "יח'";
          const qty = typeof act.qty === 'number' && act.qty > 0 ? act.qty : 1;
          const created = actions.addNewItem(itemName, validCatId, unit, qty, act.subCategory, act.note);
          createdCatalogIds.push(created.id);
          affectedIds.push(created.id);
          chips.push(`${created.name} · ${formatQty(qty, unit)}`);
          appliedCount++;
          continue;
        }

        const item = act.itemId ? state.catalog[act.itemId] : undefined;
        if (!item) continue;

        if (act.kind === 'add_existing') {
          const qty = typeof act.qty === 'number' && act.qty > 0 ? act.qty : item.defaultQty;
          void actions.addOrUpdateList(item, qty, act.note);
          affectedIds.push(item.id);
          chips.push(`${item.name} · ${formatQty(qty, item.defaultUnit)}`);
          appliedCount++;
        } else if (act.kind === 'remove') {
          void actions.removeFromList(item.id);
          affectedIds.push(item.id);
          chips.push(`הוסר: ${item.name}`);
          appliedCount++;
        } else if (act.kind === 'update_qty') {
          const qty = typeof act.qty === 'number' && act.qty > 0 ? act.qty : item.defaultQty;
          void actions.addOrUpdateList(item, qty, act.note);
          affectedIds.push(item.id);
          chips.push(`${item.name} · ${formatQty(qty, item.defaultUnit)}`);
          appliedCount++;
        } else if (act.kind === 'set_note') {
          if (state.list[item.id]) {
            void actions.setNote(item.id, act.note || '');
          } else {
            void actions.addOrUpdateList(item, item.defaultQty, act.note || '');
          }
          affectedIds.push(item.id);
          chips.push(`${item.name} (הערה)`);
          appliedCount++;
        } else if (act.kind === 'mark_purchased') {
          if (state.list[item.id]) {
            void actions.setPurchased(item.id, act.purchased !== false);
            affectedIds.push(item.id);
            chips.push(item.name);
            appliedCount++;
          }
        }
      }

      const undo =
        didClearAll || (affectedIds.length === 0 && createdCatalogIds.length === 0)
          ? null
          : () => actions.restoreVoiceUndo(beforeList, affectedIds, createdCatalogIds);

      return { chips, undo, appliedCount };
    },
    [actions, state.catalog, state.categories, state.list]
  );

  const applyUiCommand = useCallback(
    (cmd: VoiceAiResult['uiCommand']) => {
      if (!cmd) return;
      if (cmd.kind === 'switch_mode' && cmd.mode) {
        setMode(cmd.mode);
      } else if (cmd.kind === 'filter') {
        if (mode !== 'home') setMode('home');
        onCatalogCommand({ filter: cmd.filter || 'all', query: '' });
      } else if (cmd.kind === 'search') {
        if (mode !== 'home') setMode('home');
        onCatalogCommand({ filter: 'all', query: cmd.query || '' });
      }
    },
    [mode, onCatalogCommand, setMode]
  );

  const runCommand = useCallback(
    async ({ audio, text }: { audio?: Blob; text?: string }) => {
      const currentProv = getAiProvider();
      if (!getAiKey(currentProv)) {
        updateHoldPhase('idle');
        onToast('הדביקו מפתח API בהגדרות כדי להפעיל הקלטה');
        onOpenAiSettings();
        return;
      }

      updateHoldPhase('thinking');
      setThinkingLabel(audio ? 'מקשיב ומפענח...' : 'מבין פקודה...');

      try {
        const result = await runVoiceCommand({
          state,
          currentMode: mode,
          audio,
          text,
          history: [],
          providerOverride: currentProv,
        });

        applyUiCommand(result.uiCommand);
        const transcript = result.transcript || text?.trim() || '';
        const needsConfirm = shouldRequireConfirmation(result);

        if (!needsConfirm && result.actions.length === 0) {
          setPendingPlan(null);
          setOutcome({
            id: Date.now(),
            transcript,
            reply: result.reply,
            chips: [],
          });
          updateHoldPhase('idle');
          setSheetOpen(true);
          return;
        }

        if (!needsConfirm) {
          const { chips, undo } = executeActionsBatch(result.actions);
          setPendingPlan(null);
          setOutcome({
            id: Date.now(),
            transcript,
            reply: result.reply,
            chips,
            undo: undo ?? undefined,
          });
          updateHoldPhase('idle');
          setSheetOpen(true);
          return;
        }

        const checklist = buildChecklistItems(result);
        setOutcome({
          id: Date.now(),
          transcript,
          reply: result.reply,
          chips: [],
        });
        setPendingPlan({
          id: Date.now(),
          title: result.isRecipeOrMeal ? 'אישור מצרכים מהרשימה' : 'אישור עדכונים לפני ביצוע',
          items: checklist,
        });
        updateHoldPhase('idle');
        setSheetOpen(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'אירעה שגיאה בעיבוד הפקודה.';
        setPendingPlan(null);
        setOutcome({
          id: Date.now(),
          transcript: text?.trim() || '',
          reply: '',
          chips: [],
          error: msg,
        });
        updateHoldPhase('idle');
        setSheetOpen(true);
      }
    },
    [
      applyUiCommand,
      buildChecklistItems,
      executeActionsBatch,
      mode,
      onOpenAiSettings,
      onToast,
      setSheetOpen,
      state,
      updateHoldPhase,
    ]
  );

  const stopAndProcess = useCallback(async () => {
    const res = await stopRecorder();
    if (!res.audio && !res.transcript) {
      updateHoldPhase('idle');
      return;
    }
    if (res.audio && res.audio.size < 900) {
      updateHoldPhase('idle');
      onToast('ההקלטה קצרה מדי — נסו שוב');
      return;
    }
    await runCommand({ audio: res.audio, text: res.transcript });
  }, [onToast, runCommand, stopRecorder, updateHoldPhase]);

  // ---------- Floating Dock FAB Pointer Handlers ----------
  const onFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (holdPhaseRef.current === 'thinking' || e.button !== 0) return;
    e.stopPropagation();

    const g = gestureRef.current;
    window.clearTimeout(g.holdTimer);

    if (holdPhaseRef.current === 'locked') {
      gestureRef.current = {
        watching: true,
        holdEngaged: false,
        locked: false,
        cancelled: false,
        stopTap: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        holdTimer: 0,
      };
      return;
    }

    gestureRef.current = {
      watching: true,
      holdEngaged: false,
      locked: false,
      cancelled: false,
      stopTap: false,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      holdTimer: 0,
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore synthetic */
    }

    if (!hasActiveAiKey()) return;

    gestureRef.current.holdTimer = window.setTimeout(async () => {
      const curr = gestureRef.current;
      if (!curr.watching || curr.cancelled || curr.locked) return;

      curr.holdEngaged = true;
      updateHoldPhase('holding');
      haptic(16);
      hudRef.current?.style.setProperty('--cancel-pull', '0px');
      lockPillRef.current?.style.setProperty('--lock-pull', '0px');

      const recMode = PROVIDER_META[getAiProvider()].supportsNativeAudio ? 'audio' : 'speech';
      const started = await startRecorder(recMode);
      if (!started) {
        curr.cancelled = true;
        curr.watching = false;
        clearRecorderError();
        updateHoldPhase('idle');
        onToast('לא הצלחתי להפעיל את המיקרופון — בדקו הרשאה בהגדרות');
      }
    }, 200);
  };

  const onFabPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g.watching || g.stopTap || g.cancelled || g.locked) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (!g.holdEngaged) {
      if (Math.hypot(dx, dy) > 14) {
        window.clearTimeout(g.holdTimer);
      }
      return;
    }

    const upPull = Math.max(0, -dy);
    const sidePull = Math.max(0, -dx);
    lockPillRef.current?.style.setProperty('--lock-pull', `${Math.min(54, upPull * 0.72)}px`);
    hudRef.current?.style.setProperty('--cancel-pull', `${Math.min(92, sidePull * 0.78)}px`);

    if (upPull >= 46 && upPull > sidePull) {
      g.locked = true;
      haptic(22);
      updateHoldPhase('locked');
      return;
    }

    if (sidePull >= 72) {
      g.cancelled = true;
      haptic(12);
      cancelRecorder();
      updateHoldPhase('idle');
    }
  };

  const onFabPointerEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g.watching) return;
    g.watching = false;
    window.clearTimeout(g.holdTimer);

    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }

    if (e.type === 'pointercancel') {
      if (g.holdEngaged) {
        cancelRecorder();
        updateHoldPhase('idle');
      }
      return;
    }

    if (g.stopTap) {
      void stopAndProcess();
      return;
    }

    if (g.cancelled || g.locked) return;

    if (!g.holdEngaged) {
      if (e.type === 'pointerup') {
        window.requestAnimationFrame(() => {
          void startHandsFreeOnDock();
        });
      }
      return;
    }

    if (recorder.elapsedMs < 350) {
      cancelRecorder();
      updateHoldPhase('idle');
      onToast('החזיקו עוד רגע כדי להקליט, או לחצו לחיצה קצרה לפתיחה');
      return;
    }

    void stopAndProcess();
  };

  const toggleChecklistItem = (key: string) => {
    setPendingPlan((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) => (it.key === key ? { ...it, checked: !it.checked } : it)),
          }
        : null
    );
  };

  const confirmPendingPlan = () => {
    if (!pendingPlan) return;
    const selected = pendingPlan.items.filter((i) => i.checked).map((i) => i.action);
    if (selected.length === 0) return;
    const { undo, appliedCount } = executeActionsBatch(selected);
    closeSheet();
    if (undo) {
      onToast(`בוצעו ${appliedCount} עדכונים`, () => {
        undo();
        onToast('העדכון בוטל ↩');
      });
    } else if (appliedCount > 0) {
      onToast(`בוצעו ${appliedCount} עדכונים`);
    }
  };

  const checkedCount = pendingPlan ? pendingPlan.items.filter((i) => i.checked).length : 0;

  return createPortal(
    <>
      {/* 1. Floating Dock Recorder (Hold-to-Record OR Tap to Record/Stop) */}
      {!otherSheetOpen && !sheetOpen && (
        <div className={`voice-fab-dock ${mode === 'super' ? 'is-super' : ''}`}>
          {holdPhase === 'holding' && (
            <>
              <div ref={lockPillRef} className="voice-lock-capsule" aria-hidden="true">
                <IconChevronUp className="voice-lock-arrow" />
                <IconLock className="w-4 h-4" />
              </div>
              <div ref={hudRef} className="voice-hold-hud" role="status">
                <span className="voice-rec-dot" aria-hidden="true" />
                <span className="voice-rec-timer tabular-nums">{formatElapsed(recorder.elapsedMs)}</span>
                <LiveWaveform analyserRef={recorder.analyserRef} active bars={10} />
                <span className="voice-hold-cancel-hint">החליקו שמאלה לביטול</span>
              </div>
            </>
          )}

          {holdPhase === 'locked' && (
            <div className="voice-hold-hud is-locked" role="status">
              <span className="voice-rec-dot" aria-hidden="true" />
              <span className="voice-rec-timer tabular-nums">{formatElapsed(recorder.elapsedMs)}</span>
              <LiveWaveform analyserRef={recorder.analyserRef} active bars={10} />
              <button
                type="button"
                className="voice-dock-cancel"
                onClick={() => {
                  cancelRecorder();
                  updateHoldPhase('idle');
                }}
                aria-label="ביטול הקלטה"
              >
                <IconClose className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {holdPhase === 'thinking' && (
            <div className="voice-thinking-pill" role="status">
              <IconSparkles className="w-4 h-4 text-emerald-600 animate-spin" />
              <span>{thinkingLabel}</span>
            </div>
          )}

          <button
            type="button"
            className={`voice-fab-btn ${holdPhase === 'holding' ? 'is-holding' : ''} ${holdPhase === 'locked' ? 'is-recording' : ''} ${holdPhase === 'thinking' ? 'is-thinking' : ''}`}
            onPointerDown={onFabPointerDown}
            onPointerMove={onFabPointerMove}
            onPointerUp={onFabPointerEnd}
            onPointerCancel={onFabPointerEnd}
            onClick={(e) => {
              if (e.detail !== 0 || holdPhaseRef.current === 'thinking') return;
              if (holdPhaseRef.current === 'locked') {
                void stopAndProcess();
              } else {
                void startHandsFreeOnDock();
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={holdPhase === 'locked' ? 'עצור הקלטה ושלח' : 'הקלטת פקודה קולית'}
            title={holdPhase === 'locked' ? 'לחצו לעצירה ושליחה' : 'החזיקו או לחצו להקלטה'}
          >
            {holdPhase === 'locked' ? <IconStop className="w-5 h-5" /> : <IconMic className="w-6 h-6" />}
          </button>
        </div>
      )}

      {/* 2. Post-Recording Result Sheet (Only opens after recording finishes) */}
      {sheetOpen && (
        <Sheet title="תוצאת העוזר הקולי" onClose={closeSheet}>
          <div className="voice-sheet-wrap">
            {outcome?.error ? (
              <div className="voice-bubble is-error">{outcome.error}</div>
            ) : (
              <>
                {outcome?.transcript && (
                  <div className="voice-out-block">
                    <span className="voice-out-label">מה הבנתי</span>
                    <p className="voice-out-transcript">“{outcome.transcript}”</p>
                  </div>
                )}

                {pendingPlan ? (
                  <>
                    {outcome?.reply && outcome.reply !== outcome.transcript && (
                      <p className="voice-out-reply">{outcome.reply}</p>
                    )}
                    <div className="voice-checklist-card">
                      <div className="voice-checklist-head">
                        <span>{pendingPlan.title}</span>
                        <span className="voice-checklist-count tabular-nums">
                          {checkedCount}/{pendingPlan.items.length} נבחרו
                        </span>
                      </div>
                      <div className="voice-checklist-rows">
                        {pendingPlan.items.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            role="checkbox"
                            aria-checked={item.checked}
                            className={`voice-check-row ${item.checked ? 'is-checked' : ''}`}
                            onClick={() => toggleChecklistItem(item.key)}
                          >
                            <span className="voice-check-box" aria-hidden="true">
                              <IconCheck className="voice-check-svg" />
                            </span>
                            <span className="voice-check-text">
                              <span className="voice-check-title">{item.title}</span>
                              <span className="voice-check-meta">{item.meta}</span>
                            </span>
                            {item.badgeText && (
                              <span className={`voice-check-badge tone-${item.badgeTone || 'inlist'}`}>
                                {item.badgeText}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="voice-checklist-actions">
                        <button
                          type="button"
                          className="btn-primary voice-confirm-btn"
                          disabled={checkedCount === 0}
                          onClick={confirmPendingPlan}
                        >
                          <span>
                            אשר ובצע (<RollingNumber value={checkedCount} />)
                          </span>
                        </button>
                        <button type="button" className="btn-ghost" onClick={closeSheet}>
                          בטל
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  outcome && (
                    <div className="voice-out-block">
                      <span className="voice-out-label">
                        {outcome.chips.length > 0 ? 'מה בוצע' : 'תשובה'}
                      </span>
                      <p className="voice-out-reply">{outcome.reply}</p>
                      {outcome.chips.length > 0 && (
                        <div className="voice-out-chips">
                          {outcome.chips.map((c, idx) => (
                            <span key={idx} className="voice-out-chip">
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                      {outcome.undo && (
                        <button
                          type="button"
                          className="voice-out-undo"
                          onClick={() => {
                            outcome.undo?.();
                            closeSheet();
                            onToast('הפעולה בוטלה ↩');
                          }}
                        >
                          <IconUndo className="w-3.5 h-3.5" />
                          <span>בטל פעולה</span>
                        </button>
                      )}
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </Sheet>
      )}
    </>,
    document.body
  );
}
