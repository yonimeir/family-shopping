import { memo } from 'react';
import type { CatalogItem, ListEntry } from '../types';
import { formatQty } from '../lib/util';
import { getItemIcon } from '../lib/itemIcons';
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
  const icon = getItemIcon(item.name, item.categoryId);

  return (
    <div
      className={`app-card ${active ? 'app-card-active' : ''} ${item.isCore ? 'app-card-core' : ''}`}
    >
      <button
        type="button"
        className="app-card-body"
        {...lp.handlers}
        onClick={() => {
          if (lp.wasLong()) return;
          onToggle(item);
        }}
        aria-pressed={active}
      >
        <div className="app-card-avatar-wrap">
          <span className="app-card-emoji" aria-hidden>{icon}</span>
          {item.isCore && (
            <span className="app-card-star-pill" title="מוצר קבוע">★</span>
          )}
          <span className={`app-card-check ${active ? 'app-card-check-on' : ''}`} aria-hidden>
            {active ? '✓' : ''}
          </span>
        </div>

        <div className="app-card-info">
          <span className="app-card-title">{item.name}</span>
          <div className="app-card-meta">
            {!active ? (
              <span className="app-card-unit-badge tabular-nums">
                {formatQty(item.defaultQty, item.defaultUnit)}
              </span>
            ) : (
              entry!.notes && (
                <span className="app-card-note-badge" title={entry!.notes}>
                  💬 {entry!.notes}
                </span>
              )
            )}
          </div>
        </div>
      </button>

      {active && (
        <div className="app-card-stepper" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="app-stepper-btn"
            onClick={() => onQty(item, 1)}
            aria-label="הוסף כמות"
          >
            +
          </button>
          <span className="app-stepper-val tabular-nums">
            {formatQty(entry!.qty, item.defaultUnit)}
          </span>
          <button
            type="button"
            className="app-stepper-btn"
            onClick={() => onQty(item, -1)}
            aria-label="הפחת כמות"
          >
            −
          </button>
          <button
            type="button"
            className={`app-stepper-note ${entry!.notes ? 'app-stepper-note-active' : ''}`}
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
