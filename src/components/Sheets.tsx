import { useEffect, useRef, useState } from 'react';
import { UNITS } from '../data/seed';
import type { AppState, CatalogItem, Category } from '../types';
import {
  appShareWhatsAppText,
  buildShareText,
  cleanAppUrl,
  familyInviteWhatsAppText,
  familyLink,
  familyLinkWithAi,
  getHomeName,
  getMyName,
  setHomeName,
  setMyName,
  sortedCategories,
  switchFamily,
} from '../lib/util';
import {
  getAiKey,
  getAiProvider,
  hasActiveAiKey,
  PROVIDER_META,
  setAiKey,
  setAiProvider,
  testAiConnection,
  type AiProvider,
} from '../lib/voiceAi';
import { IconCheck, IconCopy, IconEye, IconEyeOff, IconKey, IconShare, IconSparkles } from './Icons';
import {
  clearVoiceLogs,
  formatVoiceLogsText,
  getVoiceLogs,
  VOICE_LOGS_EVENT,
  type VoiceLogEntry,
} from '../lib/voiceLog';
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
              <button type="button" key={u} className={`seg-btn ${unit === u ? 'seg-on' : ''}`} onClick={() => setUnit(u)}>
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
              type="button"
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
              type="button"
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
              <button type="button" key={u} className={`seg-btn ${draft.defaultUnit === u ? 'seg-on' : ''}`} onClick={() => set('defaultUnit', u)}>
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
          type="button"
          className="btn-primary"
          disabled={!draft.name.trim()}
          onClick={() => onSave({ ...draft, name: draft.name.trim(), subCategory: draft.subCategory.trim() || 'אחר' })}
        >
          שמור
        </button>
        {!confirmDel ? (
          <button type="button" className="btn-danger-ghost" onClick={() => setConfirmDel(true)}>
            🗑️ מחק מהמאגר
          </button>
        ) : (
          <button type="button" className="btn-danger" onClick={() => onDelete(item.id)}>
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
        <button type="button" className="btn-primary" onClick={() => onSave(text)}>
          שמור
        </button>
        {initial && (
          <button type="button" className="btn-ghost" onClick={() => onSave('')}>
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
            <button type="button" className="btn-primary" onClick={onKeep}>
              להשאיר לפעם הבאה
            </button>
            <button type="button" className="btn-danger-ghost" onClick={onResetAll}>
              למחוק הכל מהרשימה
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="dialog-text">אספנו הכל! 🎉 מאפסים את הרשימה לקראת הפעם הבאה?</p>
          <div className="sheet-actions">
            <button type="button" className="btn-primary" onClick={onResetAll}>
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
  focusSection,
  onSaveCategories,
  onToast,
  onClose,
}: {
  state: AppState;
  familyId: string;
  backendKind: 'firebase' | 'local' | null;
  focusSection?: 'ai';
  onSaveCategories: (c: Category[]) => void;
  onToast: (t: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(getMyName());
  const [homeName, setHomeNameState] = useState(getHomeName() || (familyId === 'meir-family' ? 'משפחת מאיר' : 'הבית שלנו'));
  const [joinCode, setJoinCode] = useState('');
  const [aiProvider, setAiProviderState] = useState<AiProvider>(() => getAiProvider());
  const [aiKey, setAiKeyState] = useState<string>(() => getAiKey(getAiProvider()));
  const [showKey, setShowKey] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [voiceLogs, setVoiceLogs] = useState<VoiceLogEntry[]>(() => getVoiceLogs());
  const aiBlockRef = useRef<HTMLElement>(null);
  const cats = sortedCategories(state.categories);
  const link = familyLink(familyId);

  useEffect(() => {
    const syncLogs = () => setVoiceLogs(getVoiceLogs());
    syncLogs();
    window.addEventListener(VOICE_LOGS_EVENT, syncLogs);
    return () => window.removeEventListener(VOICE_LOGS_EVENT, syncLogs);
  }, []);

  useEffect(() => {
    if (focusSection !== 'ai') return;
    const t = window.setTimeout(() => {
      aiBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 180);
    return () => window.clearTimeout(t);
  }, [focusSection]);

  const switchAiProvider = (next: AiProvider) => {
    setAiProvider(next);
    setAiProviderState(next);
    setAiKeyState(getAiKey(next));
    setTestResult(null);
  };

  const handleAiKeyChange = (val: string) => {
    setAiKeyState(val);
    setAiKey(aiProvider, val);
    setTestResult(null);
  };

  const runAiTest = async () => {
    setTestingAi(true);
    setTestResult(null);
    const res = await testAiConnection(aiProvider, aiKey);
    setTestingAi(false);
    if (res.ok) {
      setTestResult({ ok: true, msg: 'מחובר בהצלחה! העוזר הקולי מוכן.' });
    } else {
      setTestResult({ ok: false, msg: res.error });
    }
  };

  const providerMeta = PROVIDER_META[aiProvider];

  const shareAiFamilyWhatsApp = () => {
    if (!aiKey.trim()) return;
    const text = familyInviteWhatsAppText(familyId, homeName, { provider: aiProvider, key: aiKey });
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyAiFamilyLink = async () => {
    if (!aiKey.trim()) return;
    try {
      await navigator.clipboard.writeText(familyLinkWithAi(familyId, aiProvider, aiKey));
      onToast('קישור ההזמנה עם מפתח העוזר הקולי הועתק');
    } catch {
      onToast('לא ניתן להעתיק אוטומטית');
    }
  };

  const copyVoiceLogs = async () => {
    try {
      await navigator.clipboard.writeText(
        formatVoiceLogsText({ provider: aiProvider, hasKey: aiKey.trim().length > 0 })
      );
      onToast('הלוג הועתק ללוח (ללא מפתחות API)');
    } catch {
      onToast('לא ניתן להעתיק אוטומטית');
    }
  };

  const handleClearVoiceLogs = () => {
    clearVoiceLogs();
    onToast('הלוג נוקה');
  };

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

  const shareAppWhatsApp = () => {
    const text = appShareWhatsAppText();
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyAppLink = async () => {
    try {
      await navigator.clipboard.writeText(cleanAppUrl());
      onToast('הקישור הנקי לאפליקציה הועתק! 🔗');
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

      <section
        id="settings-ai-block"
        ref={aiBlockRef}
        className={`settings-block ai-settings-block ${focusSection === 'ai' ? 'is-highlighted' : ''}`}
      >
        <div className="ai-settings-header">
          <IconSparkles className="w-4 h-4 text-emerald-600 shrink-0" />
          <h3>עוזר קולי חכם (AI)</h3>
        </div>
        <p className="muted">בחרו ספק AI והדביקו מפתח אישי (נשמר מקומית במכשיר בלבד)</p>

        <div className="ai-provider-tabs" role="tablist" aria-label="בחירת ספק AI">
          {(['gemini', 'openai', 'claude'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={aiProvider === p}
              className={`ai-provider-tab ${aiProvider === p ? 'is-active' : ''}`}
              onClick={() => switchAiProvider(p)}
            >
              <span>{PROVIDER_META[p].shortLabel}</span>
              {getAiKey(p).length > 0 && <span className="ai-tab-dot" aria-hidden="true" />}
            </button>
          ))}
        </div>

        <p className="ai-provider-hint">{providerMeta.hint}</p>

        <div className="ai-key-input-wrap">
          <span className="ai-key-icon" aria-hidden="true">
            <IconKey className="w-4 h-4" />
          </span>
          <input
            type={showKey ? 'text' : 'password'}
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            value={aiKey}
            placeholder={providerMeta.placeholder}
            onChange={(e) => handleAiKeyChange(e.target.value)}
            onBlur={() => setAiKey(aiProvider, aiKey)}
            aria-label={`מפתח API עבור ${providerMeta.shortLabel}`}
          />
          <button
            type="button"
            className="ai-key-eye-btn"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? 'הסתר מפתח' : 'הצג מפתח'}
          >
            {showKey ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
          </button>
        </div>

        <div className="ai-key-actions">
          <button
            type="button"
            className="btn-ghost ai-test-btn"
            disabled={!aiKey.trim() || testingAi}
            onClick={() => void runAiTest()}
          >
            {testingAi ? 'בודק חיבור...' : 'בדיקת חיבור'}
          </button>
          {aiKey.trim() && (
            <button
              type="button"
              className="btn-ghost ai-clear-btn"
              onClick={() => {
                handleAiKeyChange('');
                onToast('המפתח נמחק מהמכשיר');
              }}
            >
              נקה מפתח
            </button>
          )}
          <a
            href={providerMeta.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ai-docs-link"
          >
            {providerMeta.docsLabel}
          </a>
        </div>

        {testResult && (
          <div className={`ai-test-status ${testResult.ok ? 'is-ok' : 'is-err'}`} role="status">
            {testResult.ok && <IconCheck className="w-4 h-4 shrink-0" />}
            <span>{testResult.msg}</span>
          </div>
        )}

        {aiKey.trim().length > 0 && (
          <div className="ai-share-family-card">
            <div className="ai-share-family-head">
              <IconShare className="w-4 h-4 shrink-0" />
              <span>שתפו עם כל המשפחה בקליק</span>
            </div>
            <p className="ai-share-family-desc">
              שולח קישור הזמנה פרטי לבית שכולל את מפתח {providerMeta.shortLabel} ב־#hash (ללא שמירה בענן).
            </p>
            <div className="ai-share-family-actions">
              <button type="button" className="btn-whatsapp ai-share-wa-btn" onClick={shareAiFamilyWhatsApp}>
                <IconShare className="w-4 h-4 shrink-0" />
                <span>שליחה בוואטסאפ לבית</span>
              </button>
              <button type="button" className="btn-secondary ai-share-copy-btn" onClick={copyAiFamilyLink}>
                <IconCopy className="w-4 h-4 shrink-0" />
                <span>העתקת קישור</span>
              </button>
            </div>
          </div>
        )}

        <details className="ai-logs-details">
          <summary className="ai-logs-summary">
            <span>לוג אבחון ותקלות</span>
            <span className="ai-logs-meta">
              {voiceLogs.some((l) => l.level === 'error') && (
                <span className="ai-logs-err-dot" aria-hidden="true" />
              )}
              <span className="ai-logs-count tabular-nums">{voiceLogs.length}</span>
            </span>
          </summary>
          <div className="ai-logs-body">
            <div className="ai-logs-toolbar">
              <button
                type="button"
                className="btn-secondary ai-logs-copy-btn"
                disabled={voiceLogs.length === 0}
                onClick={copyVoiceLogs}
              >
                <IconCopy className="w-3.5 h-3.5 shrink-0" />
                <span>העתק לוג</span>
              </button>
              <button
                type="button"
                className="btn-ghost ai-logs-clear-btn"
                disabled={voiceLogs.length === 0}
                onClick={handleClearVoiceLogs}
              >
                נקה לוג
              </button>
            </div>
            {voiceLogs.length === 0 ? (
              <p className="ai-logs-empty">אין עדיין רישומים בסשן הנוכחי.</p>
            ) : (
              <div className="ai-logs-list" dir="ltr">
                {[...voiceLogs].reverse().map((entry) => (
                  <div key={entry.id} className={`ai-log-row level-${entry.level}`}>
                    <div className="ai-log-head">
                      <span className="ai-log-ts tabular-nums">{entry.ts}</span>
                      <span className="ai-log-stage">{entry.stage}</span>
                      <span className="ai-log-msg">{entry.msg}</span>
                    </div>
                    {entry.detail && <div className="ai-log-detail">{entry.detail}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
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

      <section className="settings-block app-share-block">
        <div className="app-share-header">
          <span className="app-share-icon">🌟</span>
          <div className="app-share-info">
            <h3>שיתוף האפליקציה עם חברים</h3>
            <p className="muted">קישור נקי להקמת בית חדש משלהם (ללא גישה לרשימה שלכם)</p>
          </div>
        </div>

        <div className="home-share-actions">
          <button type="button" className="btn-share-app-wa" onClick={shareAppWhatsApp}>
            💬 שיתוף בוואטסאפ
          </button>
          <button type="button" className="btn-secondary" onClick={copyAppLink}>
            🔗 העתקת קישור
          </button>
        </div>
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
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="למעלה">
                ▲
              </button>
              <button type="button" className="icon-btn" disabled={i === cats.length - 1} onClick={() => move(i, 1)} aria-label="למטה">
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

// ---------------- Share sheet ----------------
export function ShareSheet({
  state,
  familyId,
  onToast,
  onClose,
}: {
  state: AppState;
  familyId: string;
  onToast: (msg: string) => void;
  onClose: () => void;
}) {
  const homeName = getHomeName();
  const inListCount = Object.values(state.list).filter((e) => state.catalog[e.itemId]).length;
  const activeProvider = getAiProvider();
  const activeKey = getAiKey(activeProvider);
  const canShareAi = hasActiveAiKey();
  const [includeAiKey, setIncludeAiKey] = useState(false);

  const shareAppWhatsApp = () => {
    const text = appShareWhatsAppText();
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyAppLink = async () => {
    try {
      await navigator.clipboard.writeText(cleanAppUrl());
      onToast('הקישור הנקי לאפליקציה הועתק! 🔗');
    } catch {
      onToast('לא ניתן להעתיק אוטומטית');
    }
  };

  const shareFamilyWhatsApp = () => {
    const aiShare = canShareAi && includeAiKey ? { provider: activeProvider, key: activeKey } : undefined;
    const text = familyInviteWhatsAppText(familyId, homeName, aiShare);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyFamilyLink = async () => {
    try {
      const urlToCopy =
        canShareAi && includeAiKey
          ? familyLinkWithAi(familyId, activeProvider, activeKey)
          : familyLink(familyId);
      await navigator.clipboard.writeText(urlToCopy);
      onToast(
        canShareAi && includeAiKey
          ? 'קישור ההזמנה + מפתח העוזר הקולי הועתק'
          : 'קישור להצטרפות לבית הועתק! 🔗'
      );
    } catch {
      onToast('לא ניתן להעתיק אוטומטית');
    }
  };

  const shareShoppingList = async () => {
    const text = buildShareText(state);
    if (!text) {
      onToast('אין כרגע מוצרים ברשימה');
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        onToast('הרשימה הועתקה, אפשר לשלוח בוואטסאפ 📋');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        await navigator.clipboard?.writeText(text).catch(() => {});
        onToast('הרשימה הועתקה 📋');
      }
    }
  };

  return (
    <Sheet title="שיתוף" onClose={onClose}>
      <div className="share-sheet-container">
        {/* Section 1: Share clean app link with friends */}
        <section className="share-sheet-card share-card-clean">
          <div className="share-card-header">
            <span className="share-card-icon">🌟</span>
            <div className="share-card-text">
              <h3>המלצה לחברים (קישור נקי)</h3>
              <p>קישור להקמת בית עצמאי – ללא שיתוף הרשימה הפרטית שלכם</p>
            </div>
          </div>
          <div className="home-share-actions">
            <button type="button" className="btn-share-app-wa" onClick={shareAppWhatsApp}>
              💬 שיתוף בוואטסאפ
            </button>
            <button type="button" className="btn-secondary" onClick={copyAppLink}>
              🔗 העתקת קישור
            </button>
          </div>
        </section>

        {/* Section 2: Invite household member to this home */}
        <section className={`share-sheet-card share-card-family ${canShareAi && includeAiKey ? 'is-with-ai' : ''}`}>
          <div className="share-card-header">
            <span className="share-card-icon">👨‍👩‍👧</span>
            <div className="share-card-text">
              <h3>הזמנה לבית שלכם {homeName ? `(${homeName})` : ''}</h3>
              <p>סנכרון מלא באותה רשימת קניות בזמן אמת עם בני הבית</p>
            </div>
          </div>

          {canShareAi && (
            <label className="ai-share-toggle">
              <input
                type="checkbox"
                className="ai-share-checkbox"
                checked={includeAiKey}
                onChange={(e) => setIncludeAiKey(e.target.checked)}
              />
              <span className="ai-share-switch" aria-hidden="true">
                <span className="ai-share-switch-thumb" />
              </span>
              <span className="ai-share-toggle-text">
                <span className="ai-share-toggle-title">
                  <IconKey className="w-3.5 h-3.5 shrink-0" />
                  <span>כלול גם את מפתח העוזר הקולי ({PROVIDER_META[activeProvider].shortLabel})</span>
                </span>
                <span className="ai-share-toggle-sub">
                  נשמר מקומית אצל בני הבית דרך #hash — ללא שמירה בענן
                </span>
              </span>
            </label>
          )}

          <div className="home-share-actions">
            <button type="button" className="btn-whatsapp" onClick={shareFamilyWhatsApp}>
              💬 הזמנה בוואטסאפ
            </button>
            <button type="button" className="btn-secondary" onClick={copyFamilyLink}>
              🔗 העתקת קישור
            </button>
          </div>
        </section>

        {/* Section 3: Send current shopping list as text */}
        <section className="share-sheet-card share-card-list">
          <div className="share-card-header">
            <span className="share-card-icon">📋</span>
            <div className="share-card-text">
              <h3>שליחת רשימת הקניות הנוכחית</h3>
              <p>{inListCount > 0 ? `${inListCount} מוצרים ברשימה כרגע` : 'אין כרגע מוצרים ברשימה'}</p>
            </div>
          </div>
          <div className="home-share-actions">
            <button
              type="button"
              className="btn-secondary share-btn-full"
              disabled={inListCount === 0}
              onClick={shareShoppingList}
            >
              📄 שליחת הרשימה כטקסט
            </button>
          </div>
        </section>
      </div>
    </Sheet>
  );
}
