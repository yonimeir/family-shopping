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
    <div className={`clean-card ${active ? 'clean-card-active' : ''}`}>
      <button
        type="button"
        className="clean-card-body"
        {...lp.handlers}
        onClick={() => {
          if (lp.wasLong()) return;
          onToggle(item);
        }}
        aria-pressed={active}
      >
        <div className="clean-card-header">
          <span className="clean-card-title">
            {item.name}
            {item.isCore && <span className="clean-card-star" title="מוצר קבוע">★</span>}
          </span>
          <span className={`clean-card-check ${active ? 'clean-card-check-on' : ''}`} aria-hidden>
            {active ? '✓' : ''}
          </span>
        </div>

        <div className="clean-card-meta">
          {!active ? (
            <span className="clean-card-unit tabular-nums">
              {formatQty(item.defaultQty, item.defaultUnit)}
            </span>
          ) : (
            entry!.notes && (
              <span className="clean-card-note" title={entry!.notes}>
                💬 {entry!.notes}
              </span>
            )
          )}
        </div>
      </button>

      {active && (
        <div className="clean-card-controls" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="clean-stepper-btn"
            onClick={() => onQty(item, 1)}
            aria-label="הוסף כמות"
          >
            +
          </button>
          <span className="clean-stepper-value tabular-nums">
            {formatQty(entry!.qty, item.defaultUnit)}
          </span>
          <button
            type="button"
            className="clean-stepper-btn"
            onClick={() => onQty(item, -1)}
            aria-label="הפחת כמות"
          >
            −
          </button>
          <button
            type="button"
            className={`clean-note-btn ${entry!.notes ? 'clean-note-btn-has' : ''}`}
            onClick={() => onNote(item)}
            aria-label="הערה"
            title={entry!.notes || 'הוסף הערה'}
          >
            💬
          </button>
        </div>
      )}
    </div>
  );
});
