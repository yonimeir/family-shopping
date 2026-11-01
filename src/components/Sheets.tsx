import { useState } from 'react';
import { UNITS } from '../data/seed';
import type { AppState, CatalogItem, Category } from '../types';
import { familyLink, getMyName, setMyName, sortedCategories, switchFamily } from '../lib/util';
import { Sheet } from './ui';

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

  const shareLink = async () => {
    const text = 'הצטרפות לרשימת הקניות המשפחתית שלנו 🛒';
    try {
      if (navigator.share) await navigator.share({ title: 'קניות משפחתיות', text, url: link });
      else {
        await navigator.clipboard.writeText(link);
        onToast('הקישור הועתק');
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <Sheet title="הגדרות" onClose={onClose}>
      <section className="settings-block">
        <h3>👤 השם שלי</h3>
        <p className="muted">מופיע כאות קטנה ליד מוצרים שהוספת</p>
        <input
          value={name}
          placeholder="למשל: יוני"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setMyName(name)}
        />
      </section>

      <section className="settings-block">
        <h3>👫 שיתוף עם בן/בת הזוג</h3>
        {backendKind === 'local' ? (
          <p className="warn">
            ⚠️ מצב מקומי: הנתונים נשמרים רק במכשיר הזה (מסונכרנים בין לשוניות). לסנכרון בין טלפונים צריך לחבר Firebase – ראו
            README.
          </p>
        ) : (
          <p className="muted">שלחו את הקישור. מי שפותח אותו מצטרף לרשימה המשותפת.</p>
        )}
        <button className="btn-primary" onClick={shareLink}>
          📤 שלח קישור הצטרפות
        </button>
        <details className="join">
          <summary>הצטרפות לרשימה קיימת</summary>
          <input value={joinCode} placeholder="הדבק קישור או קוד" onChange={(e) => setJoinCode(e.target.value)} />
          <button className="btn-ghost" onClick={() => !switchFamily(joinCode) && onToast('קוד לא תקין')}>
            הצטרף
          </button>
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
