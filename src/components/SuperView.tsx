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

  const collected = sections.flatMap((s) => s.got.map((r) => ({ ...r, icon: s.cat.icon })));
  const pct = total ? Math.round((done / total) * 100) : 0;

  if (total === 0) {
    return (
      <main className="super">
        <div className="empty big">
          <div className="empty-emoji">🛒</div>
          הרשימה ריקה
          <button className="btn-primary" onClick={onGoHome}>
            לבניית הרשימה
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="super">
      <div className="progress" aria-label={`נאספו ${done} מתוך ${total}`}>
        <div className="progress-text">
          נאספו <b>{done}</b> מתוך <b>{total}</b> מוצרים
          {done === total && ' 🎉'}
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {sections.map(({ cat, todo, total: catTotal, got }) =>
        todo.length === 0 ? null : (
          <section key={cat.id} className="super-section">
            <h2 className="super-cat">
              <span>{cat.icon}</span> {cat.name}
              <span className="super-cat-count">
                {got.length}/{catTotal}
              </span>
            </h2>
            {todo.map(({ e, it }) => (
              <Row key={e.itemId} e={e} it={it} isNew={e.addedAt > enteredAt && e.addedByDevice !== me} onTap={tap} />
            ))}
          </section>
        )
      )}

      {collected.length > 0 && (
        <section className="collected">
          <button className="collected-head" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            ✅ נאספו לעגלה ({collected.length}) <span className="chev">{showDone ? '▲' : '▼'}</span>
          </button>
          {showDone &&
            collected.map(({ e, it, icon }) => <Row key={e.itemId} e={e} it={it} icon={icon} onTap={tap} />)}
        </section>
      )}

      <div className="bottom-bar">
        <button className="btn-primary btn-wide" onClick={onCheckout}>
          סיימתי קנייה ✓
        </button>
      </div>
    </main>
  );
}

function Row({
  e,
  it,
  icon,
  isNew,
  onTap,
}: {
  e: ListEntry;
  it: CatalogItem;
  icon?: string;
  isNew?: boolean;
  onTap: (id: string) => void;
}) {
  return (
    <button className={`row ${e.isPurchased ? 'row-done' : ''}`} onClick={() => onTap(e.itemId)}>
      <span className="row-box" aria-hidden>
        {e.isPurchased ? '✓' : ''}
      </span>
      <span className="row-body">
        <span className="row-name">
          {icon && <span className="row-icon">{icon}</span>}
          {it.name}
          {isNew && <span className="badge-new">🆕 נוסף עכשיו</span>}
        </span>
        {e.notes && <span className="row-note">💬 {e.notes}</span>}
      </span>
      <span className="row-qty">{formatQty(e.qty, it.defaultUnit)}</span>
      {e.addedBy && <span className="row-who" title={`נוסף ע"י ${e.addedBy}`}>{e.addedBy.slice(0, 1)}</span>}
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
