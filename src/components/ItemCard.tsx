import { memo, useState } from 'react';
import type { CatalogItem, ListEntry } from '../types';
import { formatQty } from '../lib/util';
import { useLongPress } from './ui';
import { getProductPackshot, getItemEmoji } from '../lib/productImages';
import { IconCheck, IconStar, IconNote, IconPlus, IconMinus } from './Icons';

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
  const packshotUrl = getProductPackshot(item.name, item.categoryId);
  const emoji = getItemEmoji(item.name, item.categoryId);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

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
        {/* Studio Packshot on pure white background with instant emoji progressive loading */}
        <div className="packshot-media">
          {(!imgLoaded || imgError) && (
            <span className="packshot-placeholder" aria-hidden>
              {emoji}
            </span>
          )}
          {!imgError && (
            <img
              src={packshotUrl}
              alt={item.name}
              loading="lazy"
              decoding="async"
              className={`packshot-img ${imgLoaded ? 'packshot-img-loaded' : 'packshot-img-loading'}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          )}
          <span className={`clean-card-check ${active ? 'clean-card-check-on' : ''}`} aria-hidden>
            {active ? <IconCheck className="check-svg" /> : null}
          </span>
        </div>

        <div className="clean-card-info">
          <div className="clean-card-header">
            <span className="clean-card-title">
              {item.name}
              {item.isCore && <IconStar className="clean-card-star" title="מוצר קבוע" />}
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
                  <IconNote className="inline-block w-3 h-3 me-1 opacity-70" />
                  {entry!.notes}
                </span>
              )
            )}
          </div>
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
            <IconPlus className="w-3.5 h-3.5" />
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
            <IconMinus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className={`clean-note-btn ${entry!.notes ? 'clean-note-btn-has' : ''}`}
            onClick={() => onNote(item)}
            aria-label="הערה"
            title={entry!.notes || 'הוסף הערה'}
          >
            <IconNote className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
});
