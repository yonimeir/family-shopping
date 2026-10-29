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
  const isPriority = active || item.isCore;

  return (
    <div
      className={`bento-card ${active ? 'bento-card-active' : ''} ${item.isCore ? 'bento-card-core' : ''}`}
      data-priority={isPriority ? 'high' : 'normal'}
    >
      <button
        type="button"
        className="bento-card-surface"
        {...lp.handlers}
        onClick={() => {
          if (lp.wasLong()) return;
          onToggle(item);
        }}
        aria-pressed={active}
      >
        <div className="bento-card-header">
          <span className="bento-card-title">
            {item.name}
            {item.isCore && (
              <span className="bento-core-badge" title="מוצר קבוע בתדירות גבוהה">
                ★
              </span>
            )}
          </span>
          <span className={`bento-check-pill ${active ? 'bento-check-visible' : ''}`} aria-hidden>
            {active ? '✓' : ''}
          </span>
        </div>

        <div className="bento-card-footer">
          {!active ? (
            <span className="bento-hint-badge tabular-nums">
              {formatQty(item.defaultQty, item.defaultUnit)}
            </span>
          ) : (
            entry!.notes && (
              <span className="bento-note-badge" title={entry!.notes}>
                💬 {entry!.notes}
              </span>
            )
          )}
        </div>
      </button>

      {active && (
        <div className="bento-card-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="bento-action-btn bento-action-plus"
            onClick={() => onQty(item, 1)}
            aria-label="הוסף כמות"
          >
            +
          </button>
          <span className="bento-qty-value tabular-nums">
            {formatQty(entry!.qty, item.defaultUnit)}
          </span>
          <button
            type="button"
            className="bento-action-btn bento-action-minus"
            onClick={() => onQty(item, -1)}
            aria-label="הפחת כמות"
          >
            −
          </button>
          <button
            type="button"
            className={`bento-note-btn ${entry!.notes ? 'bento-note-has' : ''}`}
            onClick={() => onNote(item)}
            aria-label="הערה למוצר"
            title={entry!.notes || 'הוסף הערה'}
          >
            💬
          </button>
        </div>
      )}
    </div>
  );
});
