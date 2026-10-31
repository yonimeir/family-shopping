import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, CatalogItem, ListEntry } from '../types';
import { formatQty, getDeviceId, sortedCategories } from '../lib/util';

interface Props {
  state: AppState;
  enteredAt: number;
  onTogglePurchased: (itemId: string) => void;
  onCheckout: () => void;
  onGoHome: () => void;
}

const HOLD_MS = 650;

export function SuperView({ state, enteredAt, onTogglePurchased, onCheckout, onGoHome }: Props) {
  // Items just tapped stay in place briefly so the list doesn't jump under your thumb.
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
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

  const sections = sortedCategories(state.categories)
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

  const collected = sections.flatMap((s) => s.got);
  const pct = total ? Math.round((done / total) * 100) : 0;

  if (total === 0) {
    return (
      <main className="super-view">
        <div className="super-empty">
          <div className="super-empty-icon" aria-hidden>🛒</div>
          <h2 className="super-empty-title">הרשימה ריקה לקנייה</h2>
          <p className="super-empty-desc">סמן מוצרים במצב "בבית" כדי לבנות את מסלול הקנייה</p>
          <button type="button" className="bento-btn-primary" onClick={onGoHome}>
            לבניית הרשימה 🏠
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="super-view">
      <div className="super-progress-card" aria-label={`נאספו ${done} מתוך ${total}`}>
        <div className="super-progress-info">
          <span className="super-progress-label">התקדמות בסופר</span>
          <span className="super-progress-numbers tabular-nums">
            <b>{done}</b> מתוך <b>{total}</b> מוצרים
            {done === total && ' 🎉'}
          </span>
        </div>
        <div className="super-progress-track">
          <div className="super-progress-bar" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {sections.map(({ cat, todo, total: catTotal, got }) =>
        todo.length === 0 ? null : (
          <section key={cat.id} className="super-category-card">
            <header className="super-category-header">
              <span className="super-category-icon" aria-hidden>{cat.icon}</span>
              <h2 className="super-category-title">{cat.name}</h2>
              <span className="super-category-count tabular-nums">
                {got.length}/{catTotal}
              </span>
            </header>
            <div className="super-rows-container">
              {todo.map(({ e, it }) => (
                <SuperRow
                  key={e.itemId}
                  e={e}
                  it={it}
                  isNew={e.addedAt > enteredAt && e.addedByDevice !== me}
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
              ✓ נאספו לעגלה (<span className="tabular-nums">{collected.length}</span>)
            </span>
            <span className="super-collected-chevron" aria-hidden>
              {showDone ? '▲' : '▼'}
            </span>
          </button>
          {showDone && (
            <div className="super-rows-container super-rows-collected">
              {collected.map(({ e, it }) => (
                <SuperRow key={e.itemId} e={e} it={it} onTap={tap} />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="super-floating-bar">
        <button type="button" className="bento-btn-primary super-btn-checkout" onClick={onCheckout}>
          <span>סיימתי קנייה בסופר</span>
          <span aria-hidden>✓</span>
        </button>
      </div>
    </main>
  );
}

function SuperRow({
  e,
  it,
  isNew,
  onTap,
}: {
  e: ListEntry;
  it: CatalogItem;
  isNew?: boolean;
  onTap: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`super-item-row ${e.isPurchased ? 'super-item-done' : ''}`}
      onClick={() => onTap(e.itemId)}
    >
      <span className="super-checkbox" aria-hidden>
        {e.isPurchased ? '✓' : ''}
      </span>
      <div className="super-item-content">
        <div className="super-item-title-row">
          <span className="super-item-name">{it.name}</span>
          {isNew && <span className="super-badge-new">חדש</span>}
        </div>
        {e.notes && <span className="super-item-note">💬 {e.notes}</span>}
      </div>
      <span className="super-item-qty tabular-nums">{formatQty(e.qty, it.defaultUnit)}</span>
      {e.addedBy && (
        <span className="super-item-author" title={`נוסף ע"י ${e.addedBy}`}>
          {e.addedBy.slice(0, 1)}
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
