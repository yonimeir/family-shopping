import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { AppState, CatalogItem, ListEntry } from '../types';
import { formatQty, getDeviceId, playAlertChime, sortedCategories } from '../lib/util';
import { getProductPackshot, getItemEmoji } from '../lib/productImages';
import { RollingNumber } from './ui';
import {
  IconAlertTriangle,
  IconBagCheck,
  IconBell,
  IconCart,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconHome,
  IconMapPin,
  IconNote,
  IconSparkles,
} from './Icons';

interface Props {
  state: AppState;
  enteredAt: number;
  onTogglePurchased: (itemId: string) => void;
  onCheckout: () => void;
  onGoHome: () => void;
}

interface PassedAlertItem {
  itemId: string;
  itemName: string;
  categoryId: string;
  categoryName: string;
  addedBy?: string;
  addedAt: number;
}

const STRIKE_HOLD_MS = 430;
const LEAVE_MS = 230;

type StrikePhase = 'striking' | 'leaving';

interface FlipSnapshotItem {
  top: number;
  parentCatId?: string;
}

const PENCIL_PATHS = [
  {
    main: 'M 274 40 C 236 35, 194 37, 150 30 C 106 23, 58 27, 14 20',
    grain: 'M 269 36 C 226 39, 180 30, 134 32 C 90 34, 48 22, 18 24',
  },
  {
    main: 'M 275 21 C 232 26, 188 23, 144 31 C 100 39, 54 33, 14 40',
    grain: 'M 268 25 C 222 22, 176 32, 130 29 C 86 27, 46 38, 19 36',
  },
  {
    main: 'M 274 38 C 238 30, 200 35, 158 28 C 116 21, 68 33, 14 23',
    grain: 'M 268 34 C 226 37, 184 26, 140 31 C 96 36, 54 25, 18 28',
  },
] as const;

function getPencilVariant(id: string): 0 | 1 | 2 {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 3) as 0 | 1 | 2;
}

export function SuperView({ state, enteredAt, onTogglePurchased, onCheckout, onGoHome }: Props) {
  const [heldPhases, setHeldPhases] = useState<Record<string, StrikePhase>>({});
  const [showDone, setShowDone] = useState(false);
  const [passedAlerts, setPassedAlerts] = useState<PassedAlertItem[]>([]);
  const prevListRef = useRef<Record<string, ListEntry>>(state.list);
  const timersRef = useRef<Map<string, { leave: number; remove: number }>>(new Map());
  const flipSnapshotRef = useRef<Map<string, FlipSnapshotItem> | null>(null);
  const justArrivedRef = useRef<Set<string>>(new Set());
  const collectedToggleRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLElement>(null);
  const me = useMemo(getDeviceId, []);

  useWakeLock();

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const pair of timers.values()) {
        window.clearTimeout(pair.leave);
        window.clearTimeout(pair.remove);
      }
      timers.clear();
    };
  }, []);

  const captureFlipSnapshot = () => {
    const root = containerRef.current;
    if (!root) return;
    const map = new Map<string, FlipSnapshotItem>();
    root.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => {
      const id = el.dataset.flipId;
      if (!id) return;
      map.set(id, {
        top: el.getBoundingClientRect().top,
        parentCatId: el.dataset.flipParent,
      });
    });
    flipSnapshotRef.current = map;
  };

  useLayoutEffect(() => {
    const prev = flipSnapshotRef.current;
    flipSnapshotRef.current = null;
    if (!prev || !containerRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const root = containerRef.current;
    const catDeltas = new Map<string, number>();

    root.querySelectorAll<HTMLElement>('[data-flip-kind="cat"][data-flip-id]').forEach((el) => {
      const id = el.dataset.flipId;
      if (!id) return;
      const before = prev.get(id);
      if (!before) return;
      catDeltas.set(id, before.top - el.getBoundingClientRect().top);
    });

    root.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => {
      const id = el.dataset.flipId;
      if (!id) return;
      const before = prev.get(id);
      if (!before) return;
      let deltaY = before.top - el.getBoundingClientRect().top;
      if (el.dataset.flipKind === 'row' && el.dataset.flipParent) {
        deltaY -= catDeltas.get(el.dataset.flipParent) ?? 0;
      }
      if (Math.abs(deltaY) > 1) {
        el.animate(
          [{ transform: `translateY(${deltaY}px)` }, { transform: 'translateY(0)' }],
          { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
        );
      }
    });
  }, [heldPhases, state.list]);

  const entries = Object.values(state.list).filter((e) => state.catalog[e.itemId]);
  const total = entries.length;
  const done = entries.filter((e) => e.isPurchased).length;

  const markArriving = (id: string) => {
    justArrivedRef.current.add(id);
    window.setTimeout(() => {
      justArrivedRef.current.delete(id);
    }, 280);
  };

  const tap = (id: string) => {
    const currentEntry = state.list[id];
    const existing = timersRef.current.get(id);
    if (existing) {
      window.clearTimeout(existing.leave);
      window.clearTimeout(existing.remove);
      timersRef.current.delete(id);
    }

    // Checking off an item in todo -> two-stage pencil strike then smooth leave + FLIP
    if (!currentEntry?.isPurchased) {
      onTogglePurchased(id);
      navigator.vibrate?.(15);
      setHeldPhases((prev) => ({ ...prev, [id]: 'striking' }));

      const leaveTimer = window.setTimeout(() => {
        setHeldPhases((prev) => (prev[id] ? { ...prev, [id]: 'leaving' } : prev));
      }, STRIKE_HOLD_MS);

      const removeTimer = window.setTimeout(() => {
        captureFlipSnapshot();
        markArriving(id);
        timersRef.current.delete(id);
        setHeldPhases((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        window.requestAnimationFrame(() => {
          if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            collectedToggleRef.current?.animate(
              [{ transform: 'scale(1)' }, { transform: 'scale(1.025)' }, { transform: 'scale(1)' }],
              { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
            );
          }
        });
      }, STRIKE_HOLD_MS + LEAVE_MS);

      timersRef.current.set(id, { leave: leaveTimer, remove: removeTimer });
      return;
    }

    // Undo mid-strike or mid-leave while still in its department card
    if (id in heldPhases) {
      onTogglePurchased(id);
      navigator.vibrate?.(10);
      setHeldPhases((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    // Un-check from "כבר בעגלה" -> smoothly FLIP item back into its department
    captureFlipSnapshot();
    markArriving(id);
    onTogglePurchased(id);
    navigator.vibrate?.(10);
  };

  const sortedCats = useMemo(() => sortedCategories(state.categories), [state.categories]);
  const catOrder = useMemo(() => new Map(sortedCats.map((c, i) => [c.id, i])), [sortedCats]);

  const sections = sortedCats
    .map((cat) => {
      const rows = entries
        .filter((e) => state.catalog[e.itemId].categoryId === cat.id)
        .map((e) => ({ e, it: state.catalog[e.itemId] }))
        .sort((a, b) => a.it.sortIndex - b.it.sortIndex);
      const todo = rows.filter((r) => !r.e.isPurchased || Boolean(heldPhases[r.e.itemId]));
      const got = rows.filter((r) => r.e.isPurchased && !heldPhases[r.e.itemId]);
      return { cat, todo, got, total: rows.length };
    })
    .filter((s) => s.total > 0);

  // Track furthest reached category index and completed categories
  const { maxCollectedIndex, completedCatIds } = useMemo(() => {
    let maxIdx = -1;
    const completed = new Set<string>();

    for (const section of sections) {
      if (section.got.length > 0) {
        const idx = catOrder.get(section.cat.id) ?? -1;
        if (idx > maxIdx) maxIdx = idx;
      }
      if (section.todo.length === 0 && section.got.length > 0) {
        completed.add(section.cat.id);
      }
    }
    return { maxCollectedIndex: maxIdx, completedCatIds: completed };
  }, [sections, catOrder]);

  // Detect items newly added to departments already passed
  useEffect(() => {
    const prevList = prevListRef.current;
    const incomingPassed: PassedAlertItem[] = [];

    for (const [id, entry] of Object.entries(state.list)) {
      const prevEntry = prevList[id];
      const isNew = !prevEntry && entry.addedAt > enteredAt && entry.addedByDevice !== me && !entry.isPurchased;
      if (isNew) {
        const it = state.catalog[id];
        if (it) {
          const catIdx = catOrder.get(it.categoryId) ?? 999;
          const isPassed = catIdx < maxCollectedIndex || completedCatIds.has(it.categoryId);
          if (isPassed) {
            const cat = state.categories.find((c) => c.id === it.categoryId);
            incomingPassed.push({
              itemId: id,
              itemName: it.name,
              categoryId: it.categoryId,
              categoryName: cat?.name || 'מחלקה קודמת',
              addedBy: entry.addedBy,
              addedAt: entry.addedAt,
            });
          }
        }
      }
    }

    if (incomingPassed.length > 0) {
      setPassedAlerts((prev) => {
        const existing = new Set(prev.map((a) => a.itemId));
        const brandNew = incomingPassed.filter((a) => !existing.has(a.itemId));
        if (!brandNew.length) return prev;

        playAlertChime();
        try {
          navigator.vibrate?.([150, 80, 150]);
        } catch {
          /* unsupported */
        }

        return [...brandNew, ...prev];
      });
    }

    prevListRef.current = state.list;
  }, [state.list, state.catalog, state.categories, enteredAt, me, catOrder, maxCollectedIndex, completedCatIds]);

  // Clear alerts if the shopper checks off the item
  useEffect(() => {
    setPassedAlerts((prev) =>
      prev.filter((alert) => {
        const entry = state.list[alert.itemId];
        return entry && !entry.isPurchased;
      })
    );
  }, [state.list]);

  const scrollToCategory = (catId: string) => {
    const el = document.getElementById(`super-cat-${catId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('super-cat-flash');
      window.setTimeout(() => el.classList.remove('super-cat-flash'), 2000);
    }
  };

  const dismissAlert = (itemId: string) => {
    setPassedAlerts((prev) => prev.filter((a) => a.itemId !== itemId));
  };

  const passedAlertMap = useMemo(() => new Set(passedAlerts.map((a) => a.itemId)), [passedAlerts]);
  const collected = sections.flatMap((s) => s.got);
  const progressRatio = total ? done / total : 0;
  const isComplete = total > 0 && done === total;

  if (total === 0) {
    return (
      <main className="super-view">
        <div className="super-empty">
          <div className="super-empty-icon text-slate-400" aria-hidden>
            <IconCart className="w-12 h-12 mx-auto" />
          </div>
          <h2 className="super-empty-title font-frank">הרשימה ריקה</h2>
          <p className="super-empty-desc">עוברים ל"בבית" ובוחרים מה צריך לקנות</p>
          <button type="button" className="bento-btn-primary flex items-center justify-center gap-2 mx-auto" onClick={onGoHome}>
            <IconHome className="w-4 h-4" />
            <span>לבחירת מוצרים</span>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="super-view" ref={containerRef}>
      <div
        className={`super-progress-card ${isComplete ? 'super-progress-complete' : ''}`}
        aria-label={`נאספו ${done} מתוך ${total}`}
      >
        <div className="super-progress-info">
          <span className="super-progress-label">בעגלה</span>
          <span className="super-progress-numbers tabular-nums">
            <b>
              <RollingNumber value={done} />
            </b>{' '}
            מתוך{' '}
            <b>
              <RollingNumber value={total} />
            </b>
            {isComplete && <IconSparkles className="super-complete-sparkle" aria-hidden="true" />}
          </span>
        </div>
        <div className="super-progress-track">
          <div
            className="super-progress-bar"
            style={{ '--progress': progressRatio } as CSSProperties}
          />
        </div>
      </div>

      {passedAlerts.length > 0 && (
        <aside className="super-alert-banner-container" aria-live="assertive">
          {passedAlerts.map((alert) => (
            <div key={alert.itemId} className="super-alert-banner">
              <div className="super-alert-icon-wrap" aria-hidden="true">
                <IconAlertTriangle className="w-5 h-5" />
              </div>
              <div className="super-alert-content">
                <span className="super-alert-badge">מחלקה שכבר עברת</span>
                <p className="super-alert-text">
                  נוסף: <strong>{alert.itemName}</strong> ({alert.categoryName})
                </p>
                {alert.addedBy && (
                  <div className="super-alert-author">
                    נוסף ע״י <b>{alert.addedBy}</b> מהבית
                  </div>
                )}
              </div>
              <div className="super-alert-actions">
                <button
                  type="button"
                  className="super-alert-btn-jump"
                  onClick={() => scrollToCategory(alert.categoryId)}
                >
                  <IconMapPin className="w-3.5 h-3.5" />
                  <span>קפוץ למחלקה</span>
                </button>
                <button
                  type="button"
                  className="super-alert-btn-close"
                  onClick={() => dismissAlert(alert.itemId)}
                  aria-label="סגירת התראה"
                >
                  <IconClose className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </aside>
      )}

      {sections.map(({ cat, todo, total: catTotal, got }) => {
        if (todo.length === 0) return null;
        const sectionLeaving = todo.every((r) => heldPhases[r.e.itemId] === 'leaving');
        const catFlipId = `cat-${cat.id}`;
        return (
          <section
            key={cat.id}
            id={`super-cat-${cat.id}`}
            data-flip-id={catFlipId}
            data-flip-kind="cat"
            className={`super-category-card${sectionLeaving ? ' super-category-leaving' : ''}`}
          >
            <header className="super-category-header">
              <h2 className="super-category-title font-frank">{cat.name}</h2>
              <span className="super-category-count tabular-nums">
                <RollingNumber value={got.length} />/{catTotal}
              </span>
            </header>
            <div className="super-rows-container">
              {todo.map(({ e, it }) => (
                <div
                  key={e.itemId}
                  className="super-row-slot"
                  data-flip-id={`row-${e.itemId}`}
                  data-flip-kind="row"
                  data-flip-parent={catFlipId}
                >
                  <SuperRow
                    e={e}
                    it={it}
                    phase={heldPhases[e.itemId]}
                    justArrived={justArrivedRef.current.has(e.itemId)}
                    isNew={e.addedAt > enteredAt && e.addedByDevice !== me}
                    isPassedDepartment={passedAlertMap.has(e.itemId)}
                    onTap={tap}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {collected.length > 0 && (
        <section className="super-collected-module" data-flip-id="collected-module" data-flip-kind="cat">
          <button
            ref={collectedToggleRef}
            type="button"
            className="super-collected-toggle"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
          >
            <span className="super-collected-title">
              <IconCheck className="inline-block w-4 h-4 text-emerald-600 me-1.5" />
              כבר בעגלה (<RollingNumber value={collected.length} />)
            </span>
            <IconChevronDown
              className={`super-collected-chevron-svg ${showDone ? 'is-open' : ''}`}
              aria-hidden="true"
            />
          </button>
          {showDone && (
            <div className="super-collected-panel">
              <div className="super-rows-container super-rows-collected">
                {collected.map(({ e, it }) => (
                  <SuperRow
                    key={e.itemId}
                    e={e}
                    it={it}
                    settled
                    justArrived={justArrivedRef.current.has(e.itemId)}
                    onTap={tap}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {createPortal(
        <div className="super-floating-bar">
          <button type="button" className="bento-btn-primary super-btn-checkout flex items-center justify-center gap-2" onClick={onCheckout}>
            <IconBagCheck className="w-5 h-5" />
            <span>סיימנו קנייה</span>
          </button>
        </div>,
        document.body
      )}
    </main>
  );
}

function SuperRow({
  e,
  it,
  phase,
  settled,
  justArrived,
  isNew,
  isPassedDepartment,
  onTap,
}: {
  e: ListEntry;
  it: CatalogItem;
  phase?: StrikePhase;
  settled?: boolean;
  justArrived?: boolean;
  isNew?: boolean;
  isPassedDepartment?: boolean;
  onTap: (id: string) => void;
}) {
  const packshot = getProductPackshot(it.name, it.categoryId);
  const emoji = getItemEmoji(it.name, it.categoryId);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const showImg = Boolean(packshot) && !imgError;
  const authorInitial = e.addedBy?.trim().charAt(0) || '';
  const pencil = PENCIL_PATHS[getPencilVariant(e.itemId)];

  return (
    <button
      type="button"
      className={[
        'super-item-row',
        e.isPurchased ? 'super-item-done' : '',
        phase === 'leaving' ? 'super-item-leaving' : '',
        settled ? 'super-item-settled' : '',
        justArrived ? 'super-item-arriving' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onTap(e.itemId)}
    >
      <span className="super-checkbox" aria-hidden="true">
        <IconCheck className="super-check-svg" />
      </span>
      <div className="super-item-thumb">
        {showImg && !imgLoaded && <span className="packshot-shimmer" aria-hidden="true" />}
        {!showImg && (
          <span className="super-item-placeholder" aria-hidden="true">
            {emoji}
          </span>
        )}
        {showImg && (
          <img
            src={packshot!}
            alt={it.name}
            loading="lazy"
            decoding="async"
            className={`super-item-img ${imgLoaded ? 'super-item-img-loaded' : 'super-item-img-loading'}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        )}
      </div>
      <div className="super-item-content">
        <div className="super-item-title-row">
          <span className="super-item-name font-frank">
            <span className="super-item-name-text">{it.name}</span>
          </span>
          {isPassedDepartment ? (
            <span className="super-badge-passed" title="המוצר נוסף אחרי שכבר עברת את המחלקה הזו">
              <IconAlertTriangle className="w-3 h-3 shrink-0" />
              <span>נוסף אחרי שעברת</span>
            </span>
          ) : isNew ? (
            <span className="super-badge-new">
              <IconBell className="w-3 h-3 shrink-0" />
              <span>נוסף מהבית</span>
            </span>
          ) : null}
        </div>
        {e.notes && (
          <span className="super-item-note">
            <IconNote className="inline-block w-3 h-3 me-1 opacity-70" />
            {e.notes}
          </span>
        )}
      </div>
      <span className="super-item-qty tabular-nums">{formatQty(e.qty, it.defaultUnit)}</span>
      {e.addedBy && (
        <span className="author-chip" title={`נוסף ע"י ${e.addedBy}`}>
          <span className="author-avatar">{authorInitial}</span>
          <span className="author-name">{e.addedBy}</span>
        </span>
      )}
      <svg className="super-pencil-overlay" viewBox="0 0 320 60" preserveAspectRatio="none" aria-hidden="true">
        <path className="super-pencil-smudge" d={pencil.main} pathLength={100} vectorEffect="non-scaling-stroke" />
        <path className="super-pencil-main" d={pencil.main} pathLength={100} vectorEffect="non-scaling-stroke" />
        <path className="super-pencil-grain" d={pencil.grain} pathLength={100} vectorEffect="non-scaling-stroke" />
      </svg>
    </button>
  );
}

/** Keep the screen on while shopping. */
function useWakeLock() {
  const lock = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    let cancelled = false;
    const request = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          lock.current = await navigator.wakeLock.request('screen');
          if (cancelled) lock.current.release();
        }
      } catch {
        /* not supported / denied */
      }
    };
    request();
    const onVis = () => document.visibilityState === 'visible' && request();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      lock.current?.release().catch(() => {});
    };
  }, []);
}
