import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AppState, CatalogItem } from '../types';
import { groupBySub, matches, normalize, sortedCategories } from '../lib/util';
import { ItemCard } from './ItemCard';
import { RollingNumber } from './ui';
import { IconSearch, IconStar, IconCart, IconPlus, IconClose, IconCheck } from './Icons';

type Filter = 'all' | 'core' | 'cart';

interface Props {
  state: AppState;
  toolbarSlot: HTMLElement | null;
  onToggle: (item: CatalogItem) => void;
  onQty: (item: CatalogItem, dir: 1 | -1) => void;
  onNote: (item: CatalogItem) => void;
  onEdit: (item: CatalogItem) => void;
  onAddNew: (name: string) => void;
  onProgrammaticScroll?: (collapse: boolean) => void;
}

export function CatalogView({ state, toolbarSlot, onToggle, onQty, onNote, onEdit, onAddNew, onProgrammaticScroll }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [coreSnapshot, setCoreSnapshot] = useState<Set<string>>(new Set());
  const [cartSnapshot, setCartSnapshot] = useState<Set<string>>(new Set());
  const [activeCat, setActiveCat] = useState<string>('');
  const [scrolledPastSearch, setScrolledPastSearch] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    onProgrammaticScroll?.(false);
    window.scrollTo({ top: 0 });
  };

  // Scroll-spy for the category tabs + quick-search reveal.
  useEffect(() => {
    const onScroll = () => {
      const rootStyle = getComputedStyle(document.documentElement);
      const stickyH = parseFloat(rootStyle.getPropertyValue('--sticky-h')) || parseFloat(rootStyle.getPropertyValue('--top-h')) || 0;
      let current = sections[0]?.cat.id ?? '';
      for (const s of sections) {
        const el = document.getElementById(`cat-${s.cat.id}`);
        if (el && el.getBoundingClientRect().top - stickyH <= 8) current = s.cat.id;
      }
      setActiveCat(current);
      setScrolledPastSearch((prev) => (prev ? window.scrollY > 65 : window.scrollY > 105));
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
    const rootStyle = getComputedStyle(document.documentElement);
    const fullH = parseFloat(rootStyle.getPropertyValue('--top-h')) || 0;
    const rowH = parseFloat(rootStyle.getPropertyValue('--topbar-row-h')) || 60;
    const rawDelta = el.getBoundingClientRect().top;
    const willCollapse = rawDelta > 40 && rawDelta + window.scrollY > 90;
    const targetOffset = willCollapse ? Math.max(44, fullH - rowH) : fullH;
    onProgrammaticScroll?.(willCollapse);
    window.scrollTo({ top: Math.max(0, rawDelta + window.scrollY - targetOffset + 2), behavior: 'smooth' });
  };

  const focusSearchFromTop = () => {
    onProgrammaticScroll?.(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => searchInputRef.current?.focus(), 260);
  };

  const presentCats = useMemo(() => new Set(sections.map((s) => s.cat.id)), [sections]);

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of Object.values(state.list)) {
      const cid = state.catalog[e.itemId]?.categoryId;
      if (cid) counts[cid] = (counts[cid] || 0) + 1;
    }
    return counts;
  }, [state.list, state.catalog]);

  // Only the slim horizontal category rail + quick-search icon stay sticky in the top header
  const stickyTabsBar = (
    <div className={`cat-tabs-bar${scrolledPastSearch ? ' has-quick-search' : ''}`}>
      {scrolledPastSearch && (
        <button
          type="button"
          className="cat-quick-search"
          onClick={focusSearchFromTop}
          aria-label="חזרה לחיפוש"
          title="חיפוש מהיר"
        >
          <IconSearch className="w-4 h-4" />
        </button>
      )}
      <div className="cat-tabs" ref={tabsRef} role="tablist" aria-label="ניווט מחלקות">
        {cats.map((c) => {
          const countInCat = catCounts[c.id] || 0;
          return (
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
              <span className="bento-tab-label">{c.name}</span>
              {countInCat > 0 && (
                <span className="bento-tab-count">
                  <RollingNumber value={countInCat} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {toolbarSlot && createPortal(stickyTabsBar, toolbarSlot)}

      <main className="bento-catalog">
        <div className="catalog-discovery-bar">
          <div className="search-row">
            <div className="search-box">
              <span className="search-icon" aria-hidden>
                <IconSearch className="w-4 h-4" />
              </span>
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="מה חסר בבית? חפשו או הוסיפו…"
                enterKeyHint="search"
                aria-label="חיפוש מוצר"
              />
              {query && (
                <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="נקה חיפוש">
                  <IconClose className="w-4 h-4" />
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
              <IconStar className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>הקבועים שלנו</span>
            </button>
            <button
              type="button"
              className={`bento-chip ${filter === 'cart' ? 'bento-chip-cart' : ''}`}
              onClick={() => setMode('cart')}
            >
              <IconCart className="w-3.5 h-3.5" />
              <span>ברשימה</span>
              <span className="bento-chip-badge">
                <RollingNumber value={cartCount} />
              </span>
            </button>
          </div>
        </div>

        {nq && !exactExists && (
          <button type="button" className="bento-add-tile" onClick={() => onAddNew(query.trim())}>
            <span className="bento-add-icon">
              <IconPlus className="w-4 h-4" />
            </span>
            <span className="bento-add-label">
              הוספת <b>"{query.trim()}"</b> לרשימה
            </span>
          </button>
        )}

        {filter === 'core' && sections.length === 0 && (
          <div className="bento-empty-state">
            <span className="bento-empty-icon text-emerald-500">
              <IconCheck className="w-8 h-8 mx-auto" />
            </span>
            <p>כל המוצרים הקבועים כבר ברשימה</p>
          </div>
        )}
        {filter === 'cart' && sections.length === 0 && (
          <div className="bento-empty-state">
            <span className="bento-empty-icon text-slate-400">
              <IconCart className="w-8 h-8 mx-auto" />
            </span>
            <p>המקרר ריק? סמנו מה צריך להביא</p>
          </div>
        )}
        {filter === 'all' && nq && sections.length === 0 && (
          <div className="bento-empty-state">
            <span className="bento-empty-icon text-slate-400">
              <IconSearch className="w-8 h-8 mx-auto" />
            </span>
            <p>לא מצאנו "{query}". רוצים להוסיף?</p>
          </div>
        )}

        {sections.map(({ cat, groups }) => {
          const inCatCount = catCounts[cat.id] || 0;
          const sectionTotal = groups.reduce((acc, [, its]) => acc + its.length, 0);
          return (
            <section key={cat.id} id={`cat-${cat.id}`} className="bento-section">
              <header className="bento-section-header">
                <h2 className="bento-section-title">{cat.name}</h2>
                <span className="bento-section-rule" aria-hidden="true" />
                <span className={`bento-section-meta tabular-nums ${inCatCount > 0 ? 'is-active' : ''}`}>
                  {inCatCount > 0 ? `${inCatCount} בסל` : `${sectionTotal}`}
                </span>
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
          );
        })}
        <p className="bento-footer-hint">טיפ: לחיצה ארוכה על מוצר תאפשר לערוך או למחוק אותו</p>
      </main>
    </>
  );
}
