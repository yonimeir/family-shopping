import { useState } from 'react';
import { UNITS } from '../data/seed';
import type { AppState, CatalogItem, Category } from '../types';
import {
  familyInviteWhatsAppText,
  familyLink,
  getHomeName,
  getMyName,
  setHomeName,
  setMyName,
  sortedCategories,
  switchFamily,
} from '../lib/util';
import { Sheet } from './ui';
import fridgeBadge from '../assets/fridge-retro-badge.png';

// ---------------- Add new item ----------------
export function AddItemSheet({
  initialName,
  categories,
  onSave,
  onClose,
}: {
  initialName: string;
  categories: Category[];
  onSave: (name: string, categoryId: string, unit: string, qty: number) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState("יח'");
  const [qty, setQty] = useState(1);
  return (
    <Sheet title="מוצר חדש למאגר" onClose={onClose}>
      <label className="field">
        <span>שם המוצר</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field">
        <span>יחידה וכמות</span>
        <div className="unit-row">
          <div className="seg">
            {UNITS.slice(0, 5).map((u) => (
              <button key={u} className={`seg-btn ${unit === u ? 'seg-on' : ''}`} onClick={() => setUnit(u)}>
                {u}
              </button>
            ))}
          </div>
          <input
            className="qty-input"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0.1"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value) || 1)}
            aria-label="כמות"
          />
        </div>
      </div>
      <div className="field">
        <span>באיזו מחלקה? (לחיצה שומרת)</span>
        <div className="cat-pick">
          {sortedCategories(categories).map((c) => (
            <button
              key={c.id}
              className="cat-pick-btn"
              disabled={!name.trim()}
              onClick={() => onSave(name, c.id, unit, qty)}
            >
              <span className="cat-pick-icon">{c.icon}</span>
              <span className="cat-pick-name">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

// ---------------- Edit catalog item ----------------
export function EditItemSheet({
  item,
  state,
  onSave,
  onDelete,
  onClose,
}: {
  item: CatalogItem;
  state: AppState;
  onSave: (item: CatalogItem) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CatalogItem>(item);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = <K extends keyof CatalogItem>(k: K, v: CatalogItem[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const subs = [
    ...new Set(Object.values(state.catalog).filter((i) => i.categoryId === draft.categoryId).map((i) => i.subCategory)),
  ];
  const units = UNITS.includes(draft.defaultUnit) ? UNITS : [...UNITS, draft.defaultUnit];

  return (
    <Sheet title="עריכת מוצר" onClose={onClose}>
      <label className="field">
        <span>שם</span>
        <input value={draft.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <div className="field">
        <span>מחלקה</span>
        <div className="cat-pick compact">
          {sortedCategories(state.categories).map((c) => (
            <button
              key={c.id}
              className={`cat-pick-btn ${draft.categoryId === c.id ? 'cat-pick-on' : ''}`}
              onClick={() => set('categoryId', c.id)}
              title={c.name}
            >
              <span className="cat-pick-icon">{c.icon}</span>
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>תת-קטגוריה</span>
        <input list="subs" value={draft.subCategory} onChange={(e) => set('subCategory', e.target.value)} />
        <datalist id="subs">
          {subs.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <div className="field">
        <span>יחידה וכמות ברירת מחדל</span>
        <div className="unit-row">
          <div className="seg">
            {units.map((u) => (
              <button key={u} className={`seg-btn ${draft.defaultUnit === u ? 'seg-on' : ''}`} onClick={() => set('defaultUnit', u)}>
                {u}
              </button>
            ))}
          </div>
          <input
            className="qty-input"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0.1"
            value={draft.defaultQty}
            onChange={(e) => set('defaultQty', Number(e.target.value) || 1)}
            aria-label="כמות"
          />
        </div>
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={draft.isCore} onChange={(e) => set('isCore', e.target.checked)} />
        <span>⭐ מוצר קבוע (נקנה בתדירות גבוהה)</span>
      </label>

      <div className="sheet-actions">
        <button
          className="btn-primary"
          disabled={!draft.name.trim()}
          onClick={() => onSave({ ...draft, name: draft.name.trim(), subCategory: draft.subCategory.trim() || 'אחר' })}
        >
          שמור
        </button>
        {!confirmDel ? (
          <button className="btn-danger-ghost" onClick={() => setConfirmDel(true)}>
            🗑️ מחק מהמאגר
          </button>
        ) : (
          <button className="btn-danger" onClick={() => onDelete(item.id)}>
            בטוח שרוצים למחוק?
          </button>
        )}
      </div>
    </Sheet>
  );
}

// ---------------- Note ----------------
export function NoteSheet({
  item,
  initial,
  onSave,
  onClose,
}: {
  item: CatalogItem;
  initial: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <Sheet title={`הערה: ${item.name}`} onClose={onClose}>
      <textarea
        className="note-input"
        autoFocus
        rows={3}
        value={text}
        placeholder="למשל: רק אם ירוק וקשה, או מותג מסוים..."
        onChange={(e) => setText(e.target.value)}
      />
      <div className="sheet-actions">
        <button className="btn-primary" onClick={() => onSave(text)}>
          שמור
        </button>
        {initial && (
          <button className="btn-ghost" onClick={() => onSave('')}>
            מחק הערה
          </button>
        )}
      </div>
    </Sheet>
  );
}

// ---------------- Checkout ----------------
export function CheckoutSheet({
  remaining,
  onKeep,
  onResetAll,
  onClose,
}: {
  remaining: number;
  onKeep: () => void;
  onResetAll: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="סיימנו קנייה" onClose={onClose}>
      {remaining > 0 ? (
        <>
          <p className="dialog-text">
            נשארו <b>{remaining}</b> מוצרים שלא אספנו.
            <br />
            להשאיר אותם לפעם הבאה?
          </p>
          <div className="sheet-actions">
            <button className="btn-primary" onClick={onKeep}>
              להשאיר לפעם הבאה
            </button>
            <button className="btn-danger-ghost" onClick={onResetAll}>
              למחוק הכל מהרשימה
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="dialog-text">אספנו הכל! 🎉 מאפסים את הרשימה לקראת הפעם הבאה?</p>
          <div className="sheet-actions">
            <button className="btn-primary" onClick={onResetAll}>
              איפוס רשימה
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

// ---------------- Settings ----------------
export function SettingsSheet({
  state,
  familyId,
  backendKind,
  onSaveCategories,
  onToast,
  onClose,
}: {
  state: AppState;
  familyId: string;
  backendKind: 'firebase' | 'local' | null;
  onSaveCategories: (c: Category[]) => void;
  onToast: (t: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(getMyName());
  const [homeName, setHomeNameState] = useState(getHomeName() || (familyId === 'meir-family' ? 'משפחת מאיר' : 'הבית שלנו'));
  const [joinCode, setJoinCode] = useState('');
  const cats = sortedCategories(state.categories);
  const link = familyLink(familyId);

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= cats.length) return;
    const next = [...cats];
    [next[idx], next[j]] = [next[j], next[idx]];
    onSaveCategories(next.map((c, i) => ({ ...c, order: i + 1 })));
  };

  const shareWhatsApp = () => {
    const text = familyInviteWhatsAppText(familyId, homeName);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      onToast('קישור ההזמנה הועתק ללוח!');
    } catch {
      onToast('לא ניתן להעתיק אוטומטית');
    }
  };

  return (
    <Sheet title="הגדרות" onClose={onClose}>
      <div className="settings-brand-banner">
        <img src={fridgeBadge} alt="אין כלום בבית" className="settings-brand-fridge" />
        <div className="settings-brand-info">
          <div className="settings-brand-title">אין כלום בבית</div>
          <div className="settings-brand-sub">רשימת קניות משפחתית חכמה</div>
        </div>
      </div>

      <section className="settings-block">
        <h3>👤 השם או הכינוי שלי</h3>
        <p className="muted">מופיע בתג שם קטן ליד מוצרים שאת/ה מוסיף/ה לרשימה</p>
        <input
          value={name}
          placeholder="למשל: יוני או אבא"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setMyName(name)}
        />
      </section>

      <section className="settings-block home-card-block">
        <div className="home-card-header">
          <div className="home-card-title-wrap">
            <span className="home-card-badge">בית פעיל</span>
            <input
              className="home-card-name-input"
              value={homeName}
              placeholder="שם הבית (למשל: משפחת כהן)"
              onChange={(e) => setHomeNameState(e.target.value)}
              onBlur={() => setHomeName(homeName)}
              title="לחצו לעריכת שם הבית"
            />
          </div>
          <div className="home-card-id" title="קוד הבית לשיתוף">{familyId}</div>
        </div>

        <p className="muted">הזמינו את בני הבית כדי לעדכן יחד את רשימת הקניות בזמן אמת.</p>

        <div className="home-share-actions">
          <button type="button" className="btn-whatsapp" onClick={shareWhatsApp}>
            💬 הזמנה בוואטסאפ
          </button>
          <button type="button" className="btn-secondary" onClick={copyLink}>
            📋 העתקת קישור
          </button>
        </div>

        <details className="join">
          <summary>מעבר לבית אחר / הקמת בית חדש</summary>
          <div className="join-form">
            <input
              value={joinCode}
              placeholder="הדבק קוד בית או קישור הזמנה"
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                if (!switchFamily(joinCode)) onToast('קוד בית לא תקין');
              }}
            >
              מעבר בית
            </button>
          </div>
        </details>
      </section>

      <section className="settings-block">
        <h3>🗺️ סדר המחלקות בסופר</h3>
        <p className="muted">לפי מסלול ההליכה שלכם. קובע את הסדר במצב "בסופר" ובשיתוף.</p>
        <ol className="order-list">
          {cats.map((c, i) => (
            <li key={c.id} className="order-item">
              <span className="order-num">{i + 1}</span>
              <span className="order-name">
                {c.icon} {c.name}
              </span>
              <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="למעלה">
                ▲
              </button>
              <button className="icon-btn" disabled={i === cats.length - 1} onClick={() => move(i, 1)} aria-label="למטה">
                ▼
              </button>
            </li>
          ))}
        </ol>
      </section>
      <p className="muted center">
        {Object.keys(state.catalog).length} מוצרים במאגר · {backendKind === 'firebase' ? '☁️ מסונכרן' : '📱 מקומי'}
      </p>
    </Sheet>
  );
}
