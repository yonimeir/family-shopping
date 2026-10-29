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
        <span className="card-name">
          {item.isCore && <span className="core-star" aria-label="תדיר">★</span>}
          {item.name}
        </span>
        {!active && <span className="card-hint">{formatQty(item.defaultQty, item.defaultUnit)}</span>}
        {active && entry!.notes && <span className="card-note">💬 {entry!.notes}</span>}
        {active && <span className="card-check" aria-hidden>✓</span>}
      </button>

      {active && (
        <div className="card-controls">
          <button className="qty-btn" onClick={() => onQty(item, 1)} aria-label="הוסף">
            +
          </button>
          <span className="qty-val">{formatQty(entry!.qty, item.defaultUnit)}</span>
          <button className="qty-btn" onClick={() => onQty(item, -1)} aria-label="הפחת">
            −
          </button>
          <button className={`note-btn ${entry!.notes ? 'has-note' : ''}`} onClick={() => onNote(item)} aria-label="הערה">
            💬
          </button>
        </div>
      )}
    </div>
  );
});
