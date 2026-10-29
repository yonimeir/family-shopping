import { memo } from 'react';
import type { CatalogItem, ListEntry } from '../types';
import { formatQty } from '../lib/util';
import { useLongPress } from './ui';

interface Props {
  item: CatalogItem;
  entry?: ListEntry;
  onToggle: (item: CatalogItem) => void;
  onQty: (item: CatalogItem, dir: 1 | -1) => void;
  onNote: (item: CatalogItem) => void;
  onEdit: (item: CatalogItem) => void;
}

export const ItemCard = memo(function ItemCard({ item, entry, onToggle, onQty, onNote, onEdit }: Props) {
  const lp = useLongPress(() => onEdit(item));
  const active = Boolean(entry);

  return (
    <div className={`card ${active ? 'card-on' : ''}`}>
      <button
        className="card-main"
        {...lp.handlers}
        onClick={() => {
          if (lp.wasLong()) return;
          onToggle(item);
        }}
        aria-pressed={active}
      >
        <div className="card-top-row">
          <span className="card-name">
            {item.name}
            {item.isCore && <span className="core-star" title="מוצר קבוע">★</span>}
          </span>
          {active && <span className="card-check" aria-hidden>✓</span>}
        </div>

        <div className="card-meta">
          {!active ? (
            <span className="card-badge-hint">{formatQty(item.defaultQty, item.defaultUnit)}</span>
          ) : (
            entry!.notes && <span className="card-note">💬 {entry!.notes}</span>
          )}
        </div>
      </button>

      {active && (
        <div className="card-controls" onClick={(e) => e.stopPropagation()}>
          <button className="qty-btn" onClick={() => onQty(item, 1)} aria-label="הוסף כמות">
            +
          </button>
          <span className="qty-val">{formatQty(entry!.qty, item.defaultUnit)}</span>
          <button className="qty-btn" onClick={() => onQty(item, -1)} aria-label="הפחת כמות">
            −
          </button>
          <button
            className={`note-btn ${entry!.notes ? 'has-note' : ''}`}
            onClick={() => onNote(item)}
            aria-label="הוסף הערה"
            title={entry!.notes || 'הוסף הערה'}
          >
            💬
          </button>
        </div>
      )}
    </div>
  );
});
