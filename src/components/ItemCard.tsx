import { memo, useState } from 'react';
import type { CatalogItem, ListEntry } from '../types';
import { formatQty } from '../lib/util';
import { RollingNumber, useLongPress } from './ui';
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
  const showImg = Boolean(packshotUrl) && !imgError;

  const authorInitial = entry?.addedBy?.trim().charAt(0) || '';

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
        <div className="packshot-media">
          {showImg && !imgLoaded && <span className="packshot-shimmer" aria-hidden="true" />}
          {!showImg && (
            <span className="packshot-placeholder" aria-hidden="true">
              {emoji}
            </span>
          )}
          {showImg && (
            <img
              src={packshotUrl!}
              alt={item.name}
              loading="lazy"
              decoding="async"
              className={`packshot-img ${imgLoaded ? 'packshot-img-loaded' : 'packshot-img-loading'}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          )}
          <span className={`clean-card-check ${active ? 'clean-card-check-on' : ''}`} aria-hidden="true">
            <IconCheck className="check-svg" />
          </span>

          {active && (entry!.addedBy || entry!.notes) && (
            <div className="clean-card-overlay-badges">
              {entry!.addedBy && (
                <span className="author-chip" title={`נוסף ע"י ${entry!.addedBy}`}>
                  <span className="author-avatar">{authorInitial}</span>
                  <span className="author-name">{entry!.addedBy}</span>
                </span>
              )}
              {entry!.notes && (
                <span className="clean-card-note" title={entry!.notes}>
                  <IconNote className="w-2.5 h-2.5 shrink-0" />
                  <span className="clean-card-note-text">{entry!.notes}</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="clean-card-info">
          <div className="clean-card-header">
            <span className="clean-card-title">
              {item.name}
              {item.isCore && <IconStar className="clean-card-star" title="מוצר קבוע" />}
            </span>
          </div>
        </div>
      </button>

      {/* Fixed-height morphing footer slot: eliminates vertical layout shift when toggling */}
      <div className="clean-card-footer">
        {!active ? (
          <button
            type="button"
            className="clean-card-idle-btn"
            onClick={() => onToggle(item)}
            aria-label={`הוסף ${item.name} לרשימה`}
          >
            <span className="clean-card-unit tabular-nums">
              {formatQty(item.defaultQty, item.defaultUnit)}
            </span>
            <span className="clean-card-add-pill" aria-hidden="true">
              <IconPlus className="w-3.5 h-3.5" />
            </span>
          </button>
        ) : (
          <div className="clean-card-controls" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="clean-stepper-btn"
              onClick={() => onQty(item, 1)}
              aria-label="הוסף כמות"
            >
              <IconPlus className="w-3.5 h-3.5" />
            </button>
            <span className="clean-stepper-value">
              <RollingNumber value={formatQty(entry!.qty, item.defaultUnit)} />
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
    </div>
  );
});
