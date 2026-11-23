import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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

const HOLD_MS = 650;

export function SuperView({ state, enteredAt, onTogglePurchased, onCheckout, onGoHome }: Props) {
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [passedAlerts, setPassedAlerts] = useState<PassedAlertItem[]>([]);
  const prevListRef = useRef<Record<string, ListEntry>>(state.list);
  const me = useMemo(getDeviceId, []);

  useWakeLock();

  const entries = Object.values(state.list).filter((e) => state.catalog[e.itemId]);
  const total = entries.length;
  const done = entries.filter((e) => e.isPurchased).length;

  const tap = (id: string) => {
    onTogglePurchased(id);
    navigator.vibrate?.(15);
    setHeld((h) => new Set(h).add(id));
    window.setTimeout(
      () =>
        setHeld((h) => {
          const n = new Set(h);
          n.delete(id);
          return n;
        }),
      HOLD_MS
    );
  };

  const sortedCats = useMemo(() => sortedCategories(state.categories), [state.categories]);
  const catOrder = useMemo(() => new Map(sortedCats.map((c, i) => [c.id, i])), [sortedCats]);

  const sections = sortedCats
    .map((cat) => {
      const rows = entries
        .filter((e) => state.catalog[e.itemId].categoryId === cat.id)
        .map((e) => ({ e, it: state.catalog[e.itemId] }))
        .sort((a, b) => a.it.sortIndex - b.it.sortIndex);
      const todo = rows.filter((r) => !r.e.isPurchased || held.has(r.e.itemId));
      const got = rows.filter((r) => r.e.isPurchased && !held.has(r.e.itemId));
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
    <main className="super-view">
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

      {sections.map(({ cat, todo, total: catTotal, got }) =>
        todo.length === 0 ? null : (
          <section key={cat.id} id={`super-cat-${cat.id}`} className="super-category-card">
            <header className="super-category-header">
              <h2 className="super-category-title font-frank">{cat.name}</h2>
              <span className="super-category-count tabular-nums">
                <RollingNumber value={got.length} />/{catTotal}
              </span>
            </header>
            <div className="super-rows-container">
              {todo.map(({ e, it }) => (
                <SuperRow
                  key={e.itemId}
                  e={e}
                  it={it}
                  isNew={e.addedAt > enteredAt && e.addedByDevice !== me}
                  isPassedDepartment={passedAlertMap.has(e.itemId)}
                  onTap={tap}
                />
              ))}
            </div>
          </section>
        )
      )}

      {collected.length > 0 && (
        <section className="super-collected-module">
          <button
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
                  <SuperRow key={e.itemId} e={e} it={it} onTap={tap} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="super-floating-bar">
        <button type="button" className="bento-btn-primary super-btn-checkout flex items-center justify-center gap-2" onClick={onCheckout}>
          <IconBagCheck className="w-5 h-5" />
          <span>סיימנו קנייה</span>
        </button>
      </div>
    </main>
  );
}

function SuperRow({
  e,
  it,
  isNew,
  isPassedDepartment,
  onTap,
}: {
  e: ListEntry;
  it: CatalogItem;
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

  return (
    <button
      type="button"
      className={`super-item-row ${e.isPurchased ? 'super-item-done' : ''}`}
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
