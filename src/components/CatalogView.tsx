import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AppState, CatalogItem } from '../types';
import { groupBySub, matches, normalize, sortedCategories } from '../lib/util';
import { ItemCard } from './ItemCard';

type Filter = 'all' | 'core' | 'cart';

interface Props {
  state: AppState;
  toolbarSlot: HTMLElement | null;
  onToggle: (item: CatalogItem) => void;
  onQty: (item: CatalogItem, dir: 1 | -1) => void;
  onNote: (item: CatalogItem) => void;
  onEdit: (item: CatalogItem) => void;
  onAddNew: (name: string) => void;
}

export function CatalogView({ state, toolbarSlot, onToggle, onQty, onNote, onEdit, onAddNew }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // Snapshot of the "forgot something?" list, so items don't vanish the moment you tap them.
  const [coreSnapshot, setCoreSnapshot] = useState<Set<string>>(new Set());
  const [cartSnapshot, setCartSnapshot] = useState<Set<string>>(new Set());
  const [activeCat, setActiveCat] = useState<string>('');
  const tabsRef = useRef<HTMLDivElement>(null);

  const cats = useMemo(() => sortedCategories(state.categories), [state.categories]);
  const nq = normalize(query);
  const items = useMemo(() => Object.values(state.catalog), [state.catalog]);
  const cartCount = Object.keys(state.list).length;

  const visible = useMemo(() => {
    return items.filter((it) => {
      if (filter === 'core' && !coreSnapshot.has(it.id)) return false;
      if (filter === 'cart' && !cartSnapshot.has(it.id)) return false;
      return matches(it, nq);
    });
  }, [items, filter, coreSnapshot, cartSnapshot, nq]);

  const exactExists = nq.length > 0 && items.some((it) => normalize(it.name) === nq);

  const sections = useMemo(
    () =>
      cats
        .map((c) => ({ cat: c, groups: groupBySub(visible.filter((i) => i.categoryId === c.id)) }))
        .filter((s) => s.groups.length > 0),
    [cats, visible]
  );

  const setMode = (f: Filter) => {
    if (f === filter) f = 'all';
    if (f === 'core') {
      setCoreSnapshot(new Set(items.filter((i) => i.isCore && !state.list[i.id]).map((i) => i.id)));
    }
    if (f === 'cart') setCartSnapshot(new Set(Object.keys(state.list)));
    setFilter(f);
    window.scrollTo({ top: 0 });
  };

  // Scroll-spy for the category tabs.
  useEffect(() => {
    const onScroll = () => {
      const topH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-h')) || 0;
      let current = sections[0]?.cat.id ?? '';
      for (const s of sections) {
        const el = document.getElementById(`cat-${s.cat.id}`);
        if (el && el.getBoundingClientRect().top - topH <= 8) current = s.cat.id;
      }
      setActiveCat(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [sections]);

  useEffect(() => {
    tabsRef.current
      ?.querySelector<HTMLElement>(`[data-cat="${activeCat}"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeCat]);

  const jumpTo = (catId: string) => {
    const el = document.getElementById(`cat-${catId}`);
    if (!el) return;
    const topH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-h')) || 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - topH + 2, behavior: 'smooth' });
  };

  const presentCats = new Set(sections.map((s) => s.cat.id));

  const toolbar = (
    <div className="bento-toolbar">
      <div className="search-row">
        <div className="search-box">
          <span className="search-icon" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש או הוספת מוצר לקטלוג…"
            enterKeyHint="search"
            aria-label="חיפוש מוצר"
          />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="נקה חיפוש">
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="chips">
        <button
          type="button"
          className={`bento-chip ${filter === 'core' ? 'bento-chip-core' : ''}`}
          onClick={() => setMode('core')}
        >
          <span>⭐</span>
          <span>בדוק מוצרים קבועים</span>
        </button>
        <button
          type="button"
          className={`bento-chip ${filter === 'cart' ? 'bento-chip-cart' : ''}`}
          onClick={() => setMode('cart')}
        >
          <span>🛒</span>
          <span>ברשימה</span>
          <span className="bento-chip-badge tabular-nums">{cartCount}</span>
        </button>
      </div>
      <div className="cat-tabs" ref={tabsRef} role="tablist" aria-label="ניווט מחלקות">
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            data-cat={c.id}
            role="tab"
            aria-selected={activeCat === c.id}
            className={`bento-tab ${activeCat === c.id ? 'bento-tab-active' : ''}`}
            disabled={!presentCats.has(c.id)}
            onClick={() => jumpTo(c.id)}
            title={c.name}
          >
            <span className="bento-tab-icon">{c.icon}</span>
            <span className="bento-tab-count tabular-nums">
              {Object.values(state.list).filter((e) => state.catalog[e.itemId]?.categoryId === c.id).length || ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {toolbarSlot && createPortal(toolbar, toolbarSlot)}

      <main className="bento-catalog">
        {nq && !exactExists && (
          <button type="button" className="bento-add-tile" onClick={() => onAddNew(query.trim())}>
            <span className="bento-add-icon">＋</span>
            <span className="bento-add-label">
              הוסף את <b>"{query.trim()}"</b> למאגר ולקנייה
            </span>
          </button>
        )}

        {filter === 'core' && sections.length === 0 && (
          <div className="bento-empty-state">
            <span className="bento-empty-icon">✅</span>
            <p>כל המוצרים הקבועים כבר ברשימה!</p>
          </div>
        )}
        {filter === 'cart' && sections.length === 0 && (
          <div className="bento-empty-state">
            <span className="bento-empty-icon">🛒</span>
            <p>הרשימה ריקה – הקש על מוצרים כדי להוסיף</p>
          </div>
        )}
        {filter === 'all' && nq && sections.length === 0 && (
          <div className="bento-empty-state">
            <span className="bento-empty-icon">🔎</span>
            <p>לא נמצא "{query}" במאגר</p>
          </div>
        )}

        {sections.map(({ cat, groups }) => (
          <section key={cat.id} id={`cat-${cat.id}`} className="bento-section">
            <header className="bento-section-header">
              <span className="bento-section-icon" aria-hidden>{cat.icon}</span>
              <h2 className="bento-section-title">{cat.name}</h2>
            </header>

            {groups.map(([sub, its]) => (
              <div key={sub} className="bento-module">
                {groups.length > 1 && (
                  <h3 className="bento-module-title">
                    <span className="bento-module-bullet" aria-hidden />
                    {sub}
                  </h3>
                )}
                <div className="bento-grid">
                  {its.map((it) => (
                    <ItemCard
                      key={it.id}
                      item={it}
                      entry={state.list[it.id]}
                      onToggle={onToggle}
                      onQty={onQty}
                      onNote={onNote}
                      onEdit={onEdit}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
        <p className="bento-footer-hint">טיפ: לחיצה ארוכה על כרטיס מאפשרת עריכה או מחיקה מהמאגר</p>
      </main>
    </>
  );
}
