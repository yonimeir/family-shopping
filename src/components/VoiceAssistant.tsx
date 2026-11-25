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
  type AiProvider,
  type VoiceAction,
  type VoiceAiResult,
  type VoiceSessionMessage,
} from '../lib/voiceAi';
import { formatQty } from '../lib/util';
import type { AppState, ListEntry } from '../types';
import {
  IconCheck,
  IconChevronUp,
  IconClose,
  IconKey,
  IconLock,
  IconMic,
  IconSend,
  IconSparkles,
  IconTrash,
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

interface ThreadEntry {
  id: number;
  role: 'user' | 'assistant' | 'error';
  text: string;
}

interface SummaryCardData {
  id: number;
  title: string;
  chips: string[];
  undo: () => void;
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

const QUICK_PROMPTS = [
  { label: 'חצי קילו עגבניות וחלב', size: 'wide' },
  { label: 'מצרכים לשקשוקה', size: 'normal' },
  { label: 'תעבור למצב סופר', size: 'normal' },
  { label: 'האם שמנו ביצים?', size: 'wide' },
] as const;

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
  const { cancel: cancelRecorder } = recorder;
  const [holdPhase, setHoldPhase] = useState<HoldPhase>('idle');
  const [sheetOpen, setSheetOpenState] = useState(false);
  const [provider, setProvider] = useState<AiProvider>(() => getAiProvider());
  const [hasKey, setHasKey] = useState<boolean>(() => hasActiveAiKey());
  const [textInput, setTextInput] = useState('');
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [summaryCard, setSummaryCard] = useState<SummaryCardData | null>(null);
  const [thinkingLabel, setThinkingLabel] = useState('מפענח...');

  const sessionHistoryRef = useRef<VoiceSessionMessage[]>([]);
  const interactionIdRef = useRef<string | undefined>(undefined);
  const summaryTimerRef = useRef<number | null>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const lockPillRef = useRef<HTMLDivElement>(null);

  const gestureRef = useRef({
    watching: false,
    holdEngaged: false,
    locked: false,
    cancelled: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    holdTimer: 0,
  });

  const refreshKeyState = useCallback(() => {
    setProvider(getAiProvider());
    setHasKey(hasActiveAiKey());
  }, []);

  const setSheetOpen = useCallback(
    (open: boolean) => {
      setSheetOpenState(open);
      onVoiceSheetChange?.(open);
    },
    [onVoiceSheetChange]
  );

  // Sync provider/key state whenever Settings closes, Sheet opens, or URL hash imports a key
  useEffect(() => {
    refreshKeyState();
  }, [otherSheetOpen, sheetOpen, refreshKeyState]);

  useEffect(() => {
    window.addEventListener(AI_KEY_UPDATED_EVENT, refreshKeyState);
    return () => window.removeEventListener(AI_KEY_UPDATED_EVENT, refreshKeyState);
  }, [refreshKeyState]);

  const closeSheet = useCallback(() => {
    cancelRecorder();
    setHoldPhase('idle');
    setSheetOpen(false);
    setPendingPlan(null);
    setThread([]);
    setTextInput('');
    sessionHistoryRef.current = [];
    interactionIdRef.current = undefined;
  }, [cancelRecorder, setSheetOpen]);

  // Triggered when app launched from `?voice=1` PWA shortcut
  useEffect(() => {
    if (autoOpenTrigger <= 0) return;
    refreshKeyState();
    setSheetOpen(true);
    if (!hasActiveAiKey()) return;

    let cancelled = false;
    const recMode = PROVIDER_META[getAiProvider()].supportsNativeAudio ? 'audio' : 'speech';
    void recorder.start(recMode).then((ok) => {
      if (cancelled) return;
      if (ok) {
        setHoldPhase('locked');
      } else {
        recorder.clearError();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [autoOpenTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const showSummaryWithTimer = useCallback((card: SummaryCardData) => {
    if (summaryTimerRef.current !== null) window.clearTimeout(summaryTimerRef.current);
    setSummaryCard(card);
    summaryTimerRef.current = window.setTimeout(() => {
      setSummaryCard(null);
    }, 6800);
  }, []);

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
        setHoldPhase('idle');
        setSheetOpen(true);
        return;
      }

      setHoldPhase('thinking');
      setThinkingLabel(audio ? 'מקשיב ומפענח...' : 'מבין פקודה...');

      try {
        const result = await runVoiceCommand({
          state,
          currentMode: mode,
          audio,
          text,
          previousInteractionId: interactionIdRef.current,
          history: sessionHistoryRef.current,
          providerOverride: currentProv,
        });

        if (result.interactionId) interactionIdRef.current = result.interactionId;
        const userLog = result.transcript || text || '(פקודה קולית)';
        sessionHistoryRef.current = [
          ...sessionHistoryRef.current.slice(-6),
          { role: 'user', text: userLog },
          { role: 'assistant', text: result.reply },
        ];

        applyUiCommand(result.uiCommand);

        const needsConfirm = shouldRequireConfirmation(result);

        if (!needsConfirm && result.actions.length === 0) {
          // Pure navigation/filter or Q&A
          if (result.uiCommand && !sheetOpen) {
            onToast(result.reply);
          } else {
            setThread((prev) => [
              ...prev,
              { id: Date.now(), role: 'user', text: userLog },
              { id: Date.now() + 1, role: 'assistant', text: result.reply },
            ]);
            setPendingPlan(null);
            setSheetOpen(true);
          }
          setHoldPhase('idle');
          return;
        }

        if (!needsConfirm) {
          // Up to 4 existing-item additions -> immediate execute + undoable summary
          const { chips, undo, appliedCount } = executeActionsBatch(result.actions);
          if (appliedCount > 0 && undo) {
            if (sheetOpen) {
              setThread((prev) => [
                ...prev,
                { id: Date.now(), role: 'user', text: userLog },
                { id: Date.now() + 1, role: 'assistant', text: `${result.reply} (${chips.join(' · ')})` },
              ]);
              onToast(`נוספו ${appliedCount} מוצרים`, () => {
                undo();
                onToast('הפעולה בוטלה');
              });
            } else {
              showSummaryWithTimer({
                id: Date.now(),
                title: appliedCount === 1 ? 'נוסף לרשימה' : `נוספו ${appliedCount} מוצרים`,
                chips,
                undo: () => {
                  undo();
                  setSummaryCard(null);
                  onToast('הפעולה בוטלה ↩');
                },
              });
            }
          } else {
            setThread((prev) => [
              ...prev,
              { id: Date.now(), role: 'user', text: userLog },
              { id: Date.now() + 1, role: 'assistant', text: result.reply },
            ]);
            setSheetOpen(true);
          }
          setHoldPhase('idle');
          return;
        }

        // 5+ items, recipes/meals, new catalog items, removals, updates, clear list -> confirmation checklist
        const checklist = buildChecklistItems(result);
        setThread((prev) => [
          ...prev,
          { id: Date.now(), role: 'user', text: userLog },
          { id: Date.now() + 1, role: 'assistant', text: result.reply },
        ]);
        setPendingPlan({
          id: Date.now(),
          title: result.isRecipeOrMeal ? 'אישור מצרכים מהרשימה' : 'אישור עדכונים לפני ביצוע',
          items: checklist,
        });
        setSheetOpen(true);
        setHoldPhase('idle');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'אירעה שגיאה בעיבוד הפקודה.';
        setThread((prev) => [
          ...prev,
          ...(text ? [{ id: Date.now(), role: 'user' as const, text }] : []),
          { id: Date.now() + 1, role: 'error', text: msg },
        ]);
        setSheetOpen(true);
        setHoldPhase('idle');
      }
    },
    [
      applyUiCommand,
      buildChecklistItems,
      executeActionsBatch,
      mode,
      onToast,
      setSheetOpen,
      sheetOpen,
      showSummaryWithTimer,
      state,
    ]
  );

  const stopAndProcess = useCallback(async () => {
    const res = await recorder.stop();
    if (!res.audio && !res.transcript) {
      setHoldPhase('idle');
      return;
    }
    if (res.audio && res.audio.size < 900) {
      setHoldPhase('idle');
      onToast('ההקלטה קצרה מדי — נסו שוב');
      return;
    }
    await runCommand({ audio: res.audio, text: res.transcript });
  }, [onToast, recorder, runCommand]);

  // ---------- WhatsApp FAB Pointer Handlers ----------
  const onFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (holdPhase === 'thinking' || e.button !== 0) return;
    e.stopPropagation();

    const g = gestureRef.current;
    window.clearTimeout(g.holdTimer);
    gestureRef.current = {
      watching: true,
      holdEngaged: false,
      locked: false,
      cancelled: false,
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

    gestureRef.current.holdTimer = window.setTimeout(async () => {
      const curr = gestureRef.current;
      if (!curr.watching || curr.cancelled || curr.locked) return;

      if (!hasActiveAiKey()) {
        curr.watching = false;
        curr.cancelled = true;
        haptic(12);
        setSheetOpen(true);
        return;
      }

      curr.holdEngaged = true;
      setSummaryCard(null);
      setHoldPhase('holding');
      haptic(16);
      hudRef.current?.style.setProperty('--cancel-pull', '0px');
      lockPillRef.current?.style.setProperty('--lock-pull', '0px');

      const recMode = PROVIDER_META[getAiProvider()].supportsNativeAudio ? 'audio' : 'speech';
      const started = await recorder.start(recMode);
      if (!started) {
        curr.cancelled = true;
        setHoldPhase('idle');
        setSheetOpen(true);
      }
    }, 180);
  };

  const onFabPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g.watching || g.cancelled || g.locked) return;

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
      setHoldPhase('locked');
      setSheetOpen(true);
      return;
    }

    if (sidePull >= 72) {
      g.cancelled = true;
      haptic(12);
      recorder.cancel();
      setHoldPhase('idle');
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
        setHoldPhase('idle');
      }
      return;
    }

    if (g.cancelled || g.locked) return;

    if (!g.holdEngaged) {
      if (e.type === 'pointerup') {
        window.requestAnimationFrame(() => {
          refreshKeyState();
          setSheetOpen(true);
        });
      }
      setHoldPhase('idle');
      return;
    }

    if (recorder.elapsedMs < 350) {
      recorder.cancel();
      setHoldPhase('idle');
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
    setPendingPlan(null);
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

  const submitTypedCommand = async (raw?: string) => {
    const clean = (raw ?? textInput).trim();
    if (!clean || holdPhase === 'thinking') return;
    setTextInput('');
    await runCommand({ text: clean });
  };

  const startLockedInSheet = async () => {
    if (!hasActiveAiKey()) {
      onOpenAiSettings();
      return;
    }
    const recMode = PROVIDER_META[getAiProvider()].supportsNativeAudio ? 'audio' : 'speech';
    const ok = await recorder.start(recMode);
    if (ok) {
      haptic(14);
      setHoldPhase('locked');
    }
  };

  const checkedCount = pendingPlan ? pendingPlan.items.filter((i) => i.checked).length : 0;
  const activeMeta = PROVIDER_META[provider];

  return createPortal(
    <>
      {/* 1. Floating Summary Card for quick 1-4 existing item additions */}
      {summaryCard && !sheetOpen && (
        <div
          key={summaryCard.id}
          className={`voice-summary-card ${mode === 'super' ? 'is-super' : ''}`}
          onPointerEnter={() => {
            if (summaryTimerRef.current !== null) window.clearTimeout(summaryTimerRef.current);
          }}
          role="status"
        >
          <div className="voice-summary-head">
            <span className="voice-summary-badge" aria-hidden="true">
              <IconCheck className="w-3.5 h-3.5" />
            </span>
            <span className="voice-summary-title">{summaryCard.title}</span>
            <button
              type="button"
              className="voice-summary-undo"
              onClick={summaryCard.undo}
            >
              <IconUndo className="w-3.5 h-3.5" />
              <span>בטל הכל</span>
            </button>
            <button
              type="button"
              className="voice-summary-close"
              onClick={() => setSummaryCard(null)}
              aria-label="סגירת סיכום"
            >
              <IconClose className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="voice-summary-chips">
            {summaryCard.chips.map((c, idx) => (
              <span key={idx} className="voice-summary-chip">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 2. Floating Hold-to-Record HUD + Lock Capsule + Persistent FAB */}
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

          {holdPhase === 'thinking' && (
            <div className="voice-thinking-pill" role="status">
              <IconSparkles className="w-4 h-4 text-emerald-600 animate-spin" />
              <span>{thinkingLabel}</span>
            </div>
          )}

          <button
            type="button"
            className={`voice-fab-btn ${holdPhase === 'holding' ? 'is-holding' : ''} ${holdPhase === 'thinking' ? 'is-thinking' : ''}`}
            onPointerDown={onFabPointerDown}
            onPointerMove={onFabPointerMove}
            onPointerUp={onFabPointerEnd}
            onPointerCancel={onFabPointerEnd}
            onClick={(e) => {
              if (e.detail === 0 && holdPhase !== 'thinking') {
                refreshKeyState();
                setSheetOpen(true);
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="עוזר קולי (החזיקו להקלטה או לחצו לפתיחה)"
            title="החזיקו להקלטה · גררו מעלה לנעילה"
          >
            <IconMic className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* 3. Full Voice Assistant Sheet (Vaul swipeable) */}
      {sheetOpen && (
        <Sheet title="עוזר קולי חכם" onClose={closeSheet}>
          <div className="voice-sheet-wrap">
            <div className="voice-sheet-meta-bar">
              <span className="voice-provider-pill">
                <span className={`voice-provider-dot ${hasKey ? 'is-ready' : ''}`} />
                <span>{activeMeta.shortLabel}</span>
              </span>
              <button
                type="button"
                className="voice-settings-shortcut"
                onClick={() => {
                  closeSheet();
                  onOpenAiSettings();
                }}
              >
                <IconKey className="w-3.5 h-3.5" />
                <span>{hasKey ? 'החלפת ספק / מפתח' : 'הגדרת מפתח API'}</span>
              </button>
            </div>

            {!hasKey ? (
              <div className="voice-setup-card">
                <div className="voice-setup-badge">
                  <IconSparkles className="w-5 h-5" />
                </div>
                <h3 className="voice-setup-title">מדברים, והאפליקציה מסדרת את הקניות</h3>
                <p className="voice-setup-desc">
                  חברו מפתח אישי חינמי של <strong>Gemini</strong> (או מפתח של <strong>ChatGPT</strong> /{' '}
                  <strong>Claude</strong>) פעם אחת בהגדרות — והעוזר יוסיף מוצרים, יפרק מתכונים וישלוט ברשימה.
                </p>
                <button
                  type="button"
                  className="btn-primary voice-setup-btn"
                  onClick={() => {
                    closeSheet();
                    onOpenAiSettings();
                  }}
                >
                  <IconKey className="w-4 h-4" />
                  <span>להגדרת מפתח API</span>
                </button>
              </div>
            ) : (
              <>
                {(recorder.error || thread.length > 0) && (
                  <div className="voice-thread">
                    {recorder.error && (
                      <div className="voice-bubble is-error">{recorder.error}</div>
                    )}
                    {thread.map((msg) => (
                      <div
                        key={msg.id}
                        className={`voice-bubble ${
                          msg.role === 'user'
                            ? 'is-user'
                            : msg.role === 'error'
                              ? 'is-error'
                              : 'is-assistant'
                        }`}
                      >
                        {msg.text}
                      </div>
                    ))}
                  </div>
                )}

                {thread.length === 0 && !pendingPlan && holdPhase !== 'locked' && (
                  <div className="voice-empty-guide">
                    <p className="voice-empty-hint">
                      החזיקו את המיקרופון מהמסך הראשי כמו בוואטסאפ, או נסו פקודה מהירה:
                    </p>
                    <div className="voice-bento-prompts">
                      {QUICK_PROMPTS.map((q) => (
                        <button
                          key={q.label}
                          type="button"
                          className={`voice-prompt-tile ${q.size === 'wide' ? 'is-wide' : ''}`}
                          onClick={() => void submitTypedCommand(q.label)}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {holdPhase === 'thinking' && (
                  <div className="voice-sheet-thinking">
                    <IconSparkles className="w-4 h-4 text-emerald-600 animate-spin" />
                    <span>{thinkingLabel}</span>
                  </div>
                )}

                {pendingPlan && (
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
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setPendingPlan(null)}
                      >
                        בטל
                      </button>
                    </div>
                  </div>
                )}

                {/* Composer / Locked Continuous Recorder */}
                {holdPhase === 'locked' ? (
                  <div className="voice-locked-bar">
                    <button
                      type="button"
                      className="icon-btn voice-locked-cancel"
                      onClick={() => {
                        recorder.cancel();
                        setHoldPhase('idle');
                      }}
                      aria-label="ביטול הקלטה"
                    >
                      <IconTrash className="w-4 h-4 text-red-600" />
                    </button>
                    <div className="voice-locked-center">
                      <div className="voice-locked-top">
                        <span className="voice-rec-dot" aria-hidden="true" />
                        <span className="voice-rec-timer tabular-nums">
                          {formatElapsed(recorder.elapsedMs)}
                        </span>
                        <span className="voice-locked-label">מוקלט ברצף</span>
                      </div>
                      <LiveWaveform analyserRef={recorder.analyserRef} active bars={14} />
                      {recorder.liveTranscript && (
                        <div className="voice-live-transcript">{recorder.liveTranscript}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="voice-locked-send"
                      onClick={() => void stopAndProcess()}
                      aria-label="שליחת הקלטה"
                    >
                      <IconSend className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <form
                    className="voice-composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitTypedCommand();
                    }}
                  >
                    <button
                      type="button"
                      className="voice-composer-mic"
                      disabled={holdPhase === 'thinking'}
                      onClick={() => void startLockedInSheet()}
                      aria-label="הקלטה רצופה"
                      title="הקלטה"
                    >
                      <IconMic className="w-5 h-5" />
                    </button>
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="הקלידו או לחצו על המיקרופון…"
                      aria-label="פקודה לעוזר הקולי"
                    />
                    <button
                      type="submit"
                      className="voice-composer-send"
                      disabled={!textInput.trim() || holdPhase === 'thinking'}
                      aria-label="שלח פקודה"
                    >
                      <IconSend className="w-4 h-4" />
                    </button>
                  </form>
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
