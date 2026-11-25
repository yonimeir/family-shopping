import type { AppState } from '../types';
import { logVoice } from './voiceLog';

export type AiProvider = 'gemini' | 'openai' | 'claude';

export type VoiceActionKind =
  | 'add_existing'
  | 'create_and_add'
  | 'remove'
  | 'update_qty'
  | 'set_note'
  | 'mark_purchased'
  | 'clear_list';

export interface VoiceAction {
  kind: VoiceActionKind;
  itemId?: string;
  name?: string;
  categoryId?: string;
  subCategory?: string;
  unit?: string;
  qty?: number;
  note?: string;
  purchased?: boolean;
}

export interface VoiceUiCommand {
  kind: 'switch_mode' | 'filter' | 'search';
  mode?: 'home' | 'super';
  filter?: 'all' | 'core' | 'cart';
  query?: string;
}

export interface VoiceAiResult {
  transcript: string;
  reply: string;
  isRecipeOrMeal: boolean;
  actions: VoiceAction[];
  uiCommand: VoiceUiCommand | null;
  interactionId?: string;
}

export interface VoiceSessionMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ProviderMeta {
  id: AiProvider;
  label: string;
  shortLabel: string;
  modelLabel: string;
  docsUrl: string;
  docsLabel: string;
  placeholder: string;
  supportsNativeAudio: boolean;
  hint: string;
}

export const PROVIDER_META: Record<AiProvider, ProviderMeta> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    modelLabel: 'gemini-3.5-flash-lite (מהיר + גיבוי)',
    docsUrl: 'https://aistudio.google.com/apikey',
    docsLabel: 'קבלת מפתח חינמי ב־Google AI Studio',
    placeholder: 'AIza...',
    supportsNativeAudio: true,
    hint: 'האזנה ישירה באודיו לעברית מדוברת, מותגים וכמויות (כולל מסלול חינמי).',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI ChatGPT',
    shortLabel: 'ChatGPT',
    modelLabel: 'gpt-4o-mini + transcribe',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'קבלת מפתח ב־OpenAI Platform',
    placeholder: 'sk-...',
    supportsNativeAudio: true,
    hint: 'תמלול עברית אוטומטי והבנת פקודות דרך מפתח OpenAI.',
  },
  claude: {
    id: 'claude',
    label: 'Anthropic Claude',
    shortLabel: 'Claude',
    modelLabel: 'claude-haiku-4-5',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'קבלת מפתח ב־Anthropic Console',
    placeholder: 'sk-ant-...',
    supportsNativeAudio: false,
    hint: 'שימוש בזיהוי דיבור מובנה בעברית (כרום/אנדרואיד) + הקלדה חופשית.',
  },
};

const PROVIDER_STORAGE_KEY = 'fs:ai_provider';
const KEY_STORAGE_PREFIX = 'fs:ai_key_';
export const AI_KEY_UPDATED_EVENT = 'fs:ai-key-updated';

function notifyAiKeyUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AI_KEY_UPDATED_EVENT));
  }
}

export function getAiProvider(): AiProvider {
  const raw = localStorage.getItem(PROVIDER_STORAGE_KEY);
  if (raw === 'openai' || raw === 'claude' || raw === 'gemini') return raw;
  return 'gemini';
}

export function setAiProvider(provider: AiProvider): void {
  localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
  notifyAiKeyUpdated();
}

export function getAiKey(provider: AiProvider = getAiProvider()): string {
  return localStorage.getItem(`${KEY_STORAGE_PREFIX}${provider}`)?.trim() || '';
}

export function setAiKey(provider: AiProvider, key: string): void {
  const clean = key.trim();
  const storageKey = `${KEY_STORAGE_PREFIX}${provider}`;
  if (clean) localStorage.setItem(storageKey, clean);
  else localStorage.removeItem(storageKey);
  notifyAiKeyUpdated();
}

export function hasActiveAiKey(): boolean {
  return getAiKey(getAiProvider()).length > 0;
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(b64url: string): string {
  const pad = b64url.length % 4 === 0 ? '' : '='.repeat(4 - (b64url.length % 4));
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/** Encodes a provider + key payload into a URL #hash fragment that never reaches servers. */
export function encodeAiHashPayload(provider: AiProvider, key: string): string {
  const clean = key.trim();
  if (!clean) return '';
  return `#ai=${toBase64Url(JSON.stringify({ v: 1, p: provider, k: clean }))}`;
}

/** Validates and decodes an `#ai=...` URL fragment back into a provider + key pair. */
export function decodeAiHashPayload(rawHash: string): { provider: AiProvider; key: string } | null {
  const stripped = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
  if (!stripped.startsWith('ai=')) return null;
  const token = stripped.slice(3).trim();
  if (!token || token.length > 1024) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(token)) as { v?: unknown; p?: unknown; k?: unknown };
    if (parsed?.v !== 1) return null;
    if (parsed.p !== 'gemini' && parsed.p !== 'openai' && parsed.p !== 'claude') return null;
    if (typeof parsed.k !== 'string') return null;
    const trimmedKey = parsed.k.trim();
    if (trimmedKey.length < 8 || trimmedKey.length > 256) return null;
    for (let i = 0; i < trimmedKey.length; i++) {
      const code = trimmedKey.charCodeAt(i);
      if (code < 32 || code === 127) return null;
    }
    return { provider: parsed.p, key: trimmedKey };
  } catch {
    return null;
  }
}

/** Saves a decoded `#ai=...` hash payload into localStorage without touching URL state. */
export function importAiKeyFromHash(rawHash: string): { provider: AiProvider; label: string } | null {
  const decoded = decodeAiHashPayload(rawHash);
  if (!decoded) return null;
  setAiProvider(decoded.provider);
  setAiKey(decoded.provider, decoded.key);
  return { provider: decoded.provider, label: PROVIDER_META[decoded.provider].shortLabel };
}

/** Consumes `#ai=...` from location.href, always scrubbing the hash from URL and history immediately. */
export function consumeAiKeyFromUrlHash(): { provider: AiProvider; label: string } | null {
  const url = new URL(location.href);
  const rawHash = url.hash;
  if (!rawHash.startsWith('#ai=')) return null;
  url.hash = '';
  history.replaceState(null, '', url.toString());
  return importAiKeyFromHash(rawHash);
}

/**
 * Rule confirmed during specification:
 * - Up to 4 existing-item additions without recipe breakdown run immediately (summary + undo card).
 * - Everything else involving list mutations (5+ items, recipes/meals, new catalog items, removals,
 *   qty/note updates, mark purchased, clear list) requires user confirmation checklist first.
 * - Zero list actions (UI commands / read-only Q&A) run immediately without confirmation.
 */
export function shouldRequireConfirmation(result: VoiceAiResult): boolean {
  if (result.actions.length === 0) return false;
  if (result.isRecipeOrMeal) return true;
  if (result.actions.length > 4) return true;
  return result.actions.some((a) => a.kind !== 'add_existing');
}

const VALID_UNITS = ["יח'", 'ק"ג', 'מארז', 'חבילה', 'שקית', 'בקבוק', 'קופסה', 'גביע', 'ליטר'];

const AI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    transcript: {
      type: 'string',
      description: 'Clean verbatim Hebrew transcription of what the user said or typed.',
    },
    reply: {
      type: 'string',
      description: 'Short, helpful Hebrew response summarizing what was understood or answering the question (no emojis).',
    },
    isRecipeOrMeal: {
      type: 'boolean',
      description: 'True only when the user asked for recipe, dish, or meal ingredients (e.g. shakshuka, dinner, cake).',
    },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: [
              'add_existing',
              'create_and_add',
              'remove',
              'update_qty',
              'set_note',
              'mark_purchased',
              'clear_list',
            ],
          },
          itemId: { type: 'string', description: 'Exact catalog ID when item exists in catalog.' },
          name: { type: 'string', description: 'Clean Hebrew product name.' },
          categoryId: { type: 'string', description: 'Best matching category ID when creating a new item.' },
          subCategory: { type: 'string', description: 'Short natural Hebrew sub-category when creating a new item.' },
          unit: { type: 'string', description: `Unit from: ${VALID_UNITS.join(', ')}` },
          qty: { type: 'number', description: 'Positive numeric quantity (defaults to catalog defaultQty if unspecified).' },
          note: { type: 'string', description: 'Optional user note on the item (brand, ripeness, fat %, etc.).' },
          purchased: { type: 'boolean', description: 'True/false for mark_purchased.' },
        },
        required: ['kind'],
      },
    },
    uiCommand: {
      type: ['object', 'null'],
      properties: {
        kind: { type: 'string', enum: ['switch_mode', 'filter', 'search'] },
        mode: { type: 'string', enum: ['home', 'super'] },
        filter: { type: 'string', enum: ['all', 'core', 'cart'] },
        query: { type: 'string' },
      },
      required: ['kind'],
    },
  },
  required: ['transcript', 'reply', 'isRecipeOrMeal', 'actions', 'uiCommand'],
} as const;

function buildSystemPrompt(state: AppState, currentMode: 'home' | 'super'): string {
  const catsText = [...state.categories]
    .sort((a, b) => a.order - b.order)
    .map((c) => `${c.id}: ${c.name}`)
    .join('\n');

  const catalogText = Object.values(state.catalog)
    .sort((a, b) => a.sortIndex - b.sortIndex)
    .map((it) => `${it.id}|${it.name}|${it.defaultUnit}`)
    .join('\n');

  const activeListText = Object.values(state.list)
    .filter((e) => state.catalog[e.itemId])
    .map((e) => {
      const it = state.catalog[e.itemId];
      const parts = [e.itemId, it.name, `${e.qty} ${it.defaultUnit}`];
      if (e.isPurchased) parts.push('נאסף');
      if (e.notes) parts.push(`הערה:${e.notes}`);
      return parts.join('|');
    })
    .join('\n');

  return [
    'אתה העוזר הקולי החכם של אפליקציית קניות משפחתית בעברית ("אין כלום בבית").',
    'תמיד החזר JSON תקני בלבד התואם בדיוק לסכמה שהוגדרה (בלי טקסט עוטף ובלי אימוג׳ים ב־reply).',
    '',
    `מצב נוכחי באפליקציה: ${currentMode === 'super' ? 'בסופר (super)' : 'בבית (home)'}`,
    '',
    'מחלקות קיימות (categoryId: שם):',
    catsText,
    '',
    'קטלוג מוצרים קיים (itemId|שם|יחידה):',
    catalogText,
    '',
    'הרשימה הפעילה כרגע בבית/בסופר (itemId|שם|כמות|סטטוס|הערה):',
    activeListText || '(הרשימה ריקה כרגע)',
    '',
    'כללי מיפוי קפדניים:',
    '1. transcript: תמלול נקי בעברית של מה שהמשתמש ביקש.',
    '2. reply: תשובה קצרה, ברורה וטבעית בעברית.',
    '3. התאמה לקטלוג: אם מוצר תואם במשמעותו לפריט בקטלוג (למשל "עגבניות" -> itemId של "עגבנייה", "חלב 3%" -> itemId של "חלב" עם note: "3%", "אבוקדו קשה" -> אבוקדו עם note: "קשה"), חובה להשתמש ב־kind: "add_existing" עם ה־itemId המדויק.',
    '4. יצירת מוצר חדש: רק אם המוצר באמת לא קיים בקטלוג (למשל "רוטב טריאקי", "אטריות אורז"), השתמש ב־kind: "create_and_add", השלם categoryId מתוך הרשימה למעלה, תת־קטגוריה טבעית קצרה (subCategory), יחידה מתוך ["יח\'", "ק\\"ג", "מארז", "חבילה", "שקית", "בקבוק", "קופסה", "גביע", "ליטר"] וכמות מספרית qty.',
    '5. מתכונים וארוחות: אם המשתמש מבקש מצרכים למתכון או ארוחה ("מצרכים לשקשוקה", "אנחנו עושים פסטה"), סמן isRecipeOrMeal: true ופרט את כל המצרכים הדרושים (גם אם חלקם כבר ברשימה — תמיד העדף התאמה לקטלוג הקיים עם itemId מדויק).',
    '6. עדכון / מחיקה / סימון בסופר: השתמש ב־"remove" / "update_qty" / "set_note" / "mark_purchased" (עם itemId קיים) או "clear_list".',
    '7. שליטה בממשק ושאילתות: אם ביקשו לעבור מסך ("תעבור לסופר", "תחזור לבית") או לפלטר/לחפש ("תראה את הקבועים", "מה יש ברשימה", "חפש עגבנייה"), החזר uiCommand מתאים. אם זו רק שאלה ("האם שמנו חלב?"), ענה ב־reply מתוך הרשימה הפעילה בלי actions מיותרים.',
  ].join('\n');
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function normalizeMimeType(mime: string): string {
  const clean = mime.split(';')[0]?.trim().toLowerCase();
  if (!clean) return 'audio/webm';
  return clean;
}

function normalizeGeminiAudioMime(mime: string): string {
  const clean = normalizeMimeType(mime);
  if (clean === 'audio/mp4') return 'audio/m4a';
  return clean;
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

function parseAiResult(rawText: string, interactionId?: string): VoiceAiResult {
  let parsed: Partial<VoiceAiResult>;
  try {
    parsed = JSON.parse(extractJsonText(rawText)) as Partial<VoiceAiResult>;
  } catch (err) {
    logVoice('ai:parse', 'כשל בפענוח JSON מהמודל', { snippet: rawText.slice(0, 140), err: String(err) }, 'error');
    throw err;
  }
  const actions = Array.isArray(parsed.actions)
    ? parsed.actions.filter((a): a is VoiceAction => Boolean(a && typeof a.kind === 'string'))
    : [];
  const uiCommand =
    parsed.uiCommand && typeof parsed.uiCommand === 'object' && parsed.uiCommand.kind
      ? parsed.uiCommand
      : null;

  const result: VoiceAiResult = {
    transcript: typeof parsed.transcript === 'string' ? parsed.transcript.trim() : '',
    reply: typeof parsed.reply === 'string' ? parsed.reply.trim() : 'בוצע',
    isRecipeOrMeal: Boolean(parsed.isRecipeOrMeal),
    actions,
    uiCommand,
    interactionId,
  };
  logVoice('ai:parse', 'פוענח JSON מהמודל', {
    transcriptLen: result.transcript.length,
    actionsCount: result.actions.length,
    hasUiCmd: Boolean(result.uiCommand),
  });
  return result;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 25_000): Promise<Response> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('הבקשה ל־AI ארכה יותר מדי (timeout) — נסו שוב.');
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function formatHttpError(provider: AiProvider, status: number, bodyText: string): Error {
  const label = PROVIDER_META[provider].shortLabel;
  if (status === 401 || status === 403) {
    return new Error(`מפתח ה־API של ${label} שגוי או חסום (${status}). בדקו את המפתח בהגדרות.`);
  }
  if (status === 429) {
    return new Error(`חריגת מכסה ב־${label} (429). נסו שוב בעוד כמה שניות או החליפו ספק בהגדרות.`);
  }
  if (status === 503 || status === 502 || status === 504) {
    return new Error(`שרתי ${label} עמוסים כרגע (${status}). ניסינו גם מודלים חלופיים — נסו שוב בעוד כמה שניות.`);
  }
  let detail = '';
  try {
    const parsed = JSON.parse(bodyText);
    detail = parsed?.error?.message || parsed?.message || '';
  } catch {
    detail = bodyText.slice(0, 120);
  }
  return new Error(`שגיאה מול ${label} (${status})${detail ? `: ${detail}` : ''}`);
}

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

interface GeminiModelSpec {
  id: string;
  thinkingLevel: 'minimal' | 'low';
}

const GEMINI_MODELS: readonly GeminiModelSpec[] = [
  { id: 'gemini-3.5-flash-lite', thinkingLevel: 'minimal' },
  { id: 'gemini-3.1-flash-lite', thinkingLevel: 'minimal' },
  { id: 'gemini-4-hydrogen', thinkingLevel: 'low' },
  { id: 'gemini-4-argon', thinkingLevel: 'low' },
];

const GEMINI_COOLDOWN_MS = 90_000;
const geminiCooldownUntil = new Map<string, number>();

type GeminiSchemaMode = 'modern' | 'legacy' | 'prompt_only';
const SCHEMA_MODES: readonly GeminiSchemaMode[] = ['modern', 'legacy', 'prompt_only'];
const SCHEMA_MODE_STORAGE_KEY = 'fs:gemini_schema_mode';

function loadSavedSchemaMode(): GeminiSchemaMode {
  try {
    if (typeof localStorage === 'undefined') return 'modern';
    const raw = localStorage.getItem(SCHEMA_MODE_STORAGE_KEY);
    if (raw === 'modern' || raw === 'legacy' || raw === 'prompt_only') return raw;
  } catch {
    /* ignore storage errors */
  }
  return 'modern';
}

function saveSchemaMode(mode: GeminiSchemaMode): void {
  geminiSchemaMode = mode;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SCHEMA_MODE_STORAGE_KEY, mode);
    }
  } catch {
    /* ignore storage errors */
  }
}

let geminiSchemaMode: GeminiSchemaMode = loadSavedSchemaMode();

function isSchemaFieldError(status: number, errText: string): boolean {
  if (status !== 400) return false;
  const lower = errText.toLowerCase();
  return (
    lower.includes('response_format') ||
    lower.includes('response_mime_type') ||
    lower.includes('mime_type') ||
    lower.includes('schema')
  );
}

function isThinkingConfigError(status: number, errText: string): boolean {
  if (status !== 400) return false;
  const lower = errText.toLowerCase();
  return lower.includes('thinking_level') || lower.includes('generation_config');
}

function orderedGeminiModels(): GeminiModelSpec[] {
  const now = Date.now();
  const healthy: GeminiModelSpec[] = [];
  const cooling: GeminiModelSpec[] = [];
  for (const spec of GEMINI_MODELS) {
    if ((geminiCooldownUntil.get(spec.id) ?? 0) > now) cooling.push(spec);
    else healthy.push(spec);
  }
  return [...healthy, ...cooling];
}

function isFailoverGeminiStatus(status: number): boolean {
  return status === 429 || status === 404 || status === 500 || status === 502 || status === 503 || status === 504;
}

interface GeminiInteractionResponse {
  id?: string;
  output_text?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  outputs?: Array<{ type?: string; text?: string }>;
}

function extractGeminiInteractionText(data: GeminiInteractionResponse): string {
  let rawText = data.output_text || '';
  if (!rawText && Array.isArray(data.steps)) {
    for (let i = data.steps.length - 1; i >= 0; i--) {
      const step = data.steps[i];
      if (step.type === 'model_output' && Array.isArray(step.content)) {
        rawText = step.content
          .filter((c) => c.type === 'text' && typeof c.text === 'string')
          .map((c) => c.text)
          .join('');
        if (rawText) break;
      }
    }
  }
  if (!rawText && Array.isArray(data.outputs)) {
    rawText = data.outputs
      .filter((o) => o.type === 'text' && typeof o.text === 'string')
      .map((o) => o.text)
      .join('');
  }
  return rawText;
}

async function runGeminiInteraction(params: {
  key: string;
  systemPrompt: string;
  audio?: Blob;
  text?: string;
  previousInteractionId?: string;
  history: VoiceSessionMessage[];
}): Promise<VoiceAiResult> {
  const audioPayload = params.audio
    ? { data: await blobToBase64(params.audio), mimeType: normalizeGeminiAudioMime(params.audio.type) }
    : null;

  const historyPrefix =
    params.history.length > 0
      ? `הקשר שיחה קודם:\n${params.history.map((m) => `${m.role === 'user' ? 'משתמש' : 'עוזר'}: ${m.text}`).join('\n')}\n\n`
      : '';

  const buildInput = (usePrevId: boolean): unknown => {
    const extraHistory = !usePrevId ? historyPrefix : '';
    if (audioPayload) {
      const hint = params.text?.trim()
        ? `הקשב להקלטה והחזר JSON. הקשר נוסף: ${params.text.trim()}`
        : 'האזן לפקודת המשתמש בעברית והחזר את פעולות ה־JSON המדויקות.';
      return [
        { type: 'text', text: `${extraHistory}${hint}` },
        { type: 'audio', data: audioPayload.data, mime_type: audioPayload.mimeType },
      ];
    }
    return `${extraHistory}${params.text || ''}`;
  };

  const sendAttempt = async (
    spec: GeminiModelSpec,
    usePrevId: boolean,
    schemaMode: GeminiSchemaMode,
    includeThinking: boolean
  ): Promise<Response> => {
    const systemInstruction =
      schemaMode === 'prompt_only'
        ? `${params.systemPrompt}\n\nהחזר JSON גולמי בלבד התואם בדיוק לסכמה:\n${JSON.stringify(AI_RESPONSE_SCHEMA)}`
        : params.systemPrompt;

    const shouldStore = Boolean(usePrevId && params.previousInteractionId);
    const body: Record<string, unknown> = {
      model: spec.id,
      system_instruction: systemInstruction,
      input: buildInput(usePrevId),
      store: shouldStore,
    };
    if (includeThinking) {
      body.generation_config = { thinking_level: spec.thinkingLevel };
    }
    if (schemaMode === 'modern') {
      body.response_format = {
        type: 'text',
        mime_type: 'application/json',
        schema: AI_RESPONSE_SCHEMA,
      };
    } else if (schemaMode === 'legacy') {
      body.response_mime_type = 'application/json';
      body.response_format = AI_RESPONSE_SCHEMA;
    }
    if (shouldStore) {
      body.previous_interaction_id = params.previousInteractionId;
    }

    logVoice('ai:req', 'שליחת בקשה ל-Gemini', {
      provider: 'gemini',
      model: spec.id,
      thinking: includeThinking ? spec.thinkingLevel : 'default',
      store: shouldStore,
      url: GEMINI_INTERACTIONS_URL,
      schemaMode,
      hasAudio: Boolean(audioPayload),
      audioMime: audioPayload?.mimeType ?? '',
      audioB64Len: audioPayload?.data.length ?? 0,
      textLen: params.text?.length ?? 0,
    });

    return fetchWithTimeout(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': params.key,
      },
      body: JSON.stringify(body),
    });
  };

  const parseSuccess = async (res: Response, spec: GeminiModelSpec, stored: boolean, ms: number): Promise<VoiceAiResult> => {
    const data = (await res.json()) as GeminiInteractionResponse;
    const rawText = extractGeminiInteractionText(data);
    logVoice(
      'ai:res',
      rawText ? 'תגובה מ-Gemini' : 'תגובה ריקה מ-Gemini',
      {
        provider: 'gemini',
        model: spec.id,
        status: res.status,
        ms,
        ok: Boolean(rawText),
        keys: Object.keys(data),
        textLen: rawText.length,
        ...(rawText ? {} : { snippet: JSON.stringify(data).slice(0, 160) }),
      },
      rawText ? 'info' : 'error'
    );
    if (!rawText) throw new Error('Gemini לא החזיר תשובה טקסטואלית.');
    const keepId = stored && spec.id === GEMINI_MODELS[0].id ? data.id : undefined;
    return parseAiResult(rawText, keepId);
  };

  const candidates = orderedGeminiModels();
  let lastStatus = 503;
  let lastErrText = '';

  for (let idx = 0; idx < candidates.length; idx++) {
    const spec = candidates[idx];
    const usePrevId = Boolean(params.previousInteractionId && spec.id === GEMINI_MODELS[0].id && idx === 0);
    const startingMode = loadSavedSchemaMode();
    const modesToTry: GeminiSchemaMode[] = [
      startingMode,
      ...SCHEMA_MODES.filter((m) => m !== startingMode),
    ];
    let schemaIdx = 0;
    let includeThinking = true;

    while (true) {
      const activeSchemaMode = modesToTry[schemaIdx];
      const t0 = Date.now();
      const res = await sendAttempt(spec, usePrevId, activeSchemaMode, includeThinking);
      const ms = Date.now() - t0;

      if (res.ok) {
        saveSchemaMode(activeSchemaMode);
        return parseSuccess(res, spec, usePrevId, ms);
      }

      const errText = await res.text();
      logVoice(
        'ai:res',
        'שגיאת HTTP מ-Gemini',
        { provider: 'gemini', model: spec.id, status: res.status, ms, ok: false, snippet: errText.slice(0, 160) },
        'error'
      );
      if (res.status === 401 || res.status === 403) {
        throw formatHttpError('gemini', res.status, errText);
      }
      if (includeThinking && isThinkingConfigError(res.status, errText)) {
        logVoice('ai:schema', 'דילוג על thinking_level למודל זה', { model: spec.id }, 'warn');
        includeThinking = false;
        continue;
      }
      if (isSchemaFieldError(res.status, errText) && schemaIdx + 1 < modesToTry.length) {
        const nextMode = modesToTry[schemaIdx + 1];
        logVoice('ai:schema', 'מעבר למצב סכמה חלופי', { model: spec.id, from: activeSchemaMode, to: nextMode }, 'warn');
        schemaIdx += 1;
        geminiSchemaMode = nextMode;
        continue;
      }
      if (isFailoverGeminiStatus(res.status)) {
        if (res.status === 503 || res.status === 429) {
          geminiCooldownUntil.set(spec.id, Date.now() + GEMINI_COOLDOWN_MS);
        }
        logVoice('ai:failover', 'מעבר למודל גיבוי ב-Gemini', { from: spec.id, status: res.status }, 'warn');
        lastStatus = res.status;
        lastErrText = errText;
        break;
      }
      throw formatHttpError('gemini', res.status, errText);
    }
  }

  if (lastStatus === 503 || lastStatus === 502 || lastStatus === 504) {
    await new Promise((r) => setTimeout(r, 800));
    const retrySpec = GEMINI_MODELS[0];
    const t0 = Date.now();
    const retryRes = await sendAttempt(retrySpec, false, geminiSchemaMode, true);
    const ms = Date.now() - t0;
    if (retryRes.ok) {
      return parseSuccess(retryRes, retrySpec, false, ms);
    }
    const retryErrText = await retryRes.text();
    logVoice(
      'ai:res',
      'שגיאה בניסיון החוזר מול Gemini',
      { provider: 'gemini', model: retrySpec.id, status: retryRes.status, ms, ok: false, snippet: retryErrText.slice(0, 160) },
      'error'
    );
    throw formatHttpError('gemini', retryRes.status, retryErrText);
  }

  throw formatHttpError('gemini', lastStatus, lastErrText);
}

async function transcribeWithOpenAi(key: string, audio: Blob): Promise<string> {
  const mime = normalizeMimeType(audio.type);
  const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
  for (const model of ['gpt-4o-mini-transcribe', 'whisper-1']) {
    const form = new FormData();
    form.append('file', audio, `voice.${ext}`);
    form.append('model', model);
    form.append('language', 'he');
    logVoice('ai:req', 'שליחת שמע לתמלול ב-OpenAI', { provider: 'openai', model, bytes: audio.size, mime });
    const t0 = Date.now();
    const res = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const ms = Date.now() - t0;
    if (res.ok) {
      const json = (await res.json()) as { text?: string };
      logVoice('ai:res', 'תמלול OpenAI הצליח', { provider: 'openai', model, status: res.status, ms, ok: true, textLen: json.text?.length ?? 0 });
      return json.text?.trim() || '';
    }
    const errText = await res.text();
    logVoice('ai:res', 'שגיאה בתמלול OpenAI', { provider: 'openai', model, status: res.status, ms, ok: false, snippet: errText.slice(0, 160) }, 'error');
    if (res.status !== 404 && !errText.toLowerCase().includes('model')) {
      throw formatHttpError('openai', res.status, errText);
    }
  }
  throw new Error('לא הצלחתי לתמלל את האודיו מול OpenAI.');
}

async function runOpenAiCommand(params: {
  key: string;
  systemPrompt: string;
  audio?: Blob;
  text?: string;
  history: VoiceSessionMessage[];
}): Promise<VoiceAiResult> {
  let userText = params.text?.trim() || '';
  if (params.audio) {
    const spoken = await transcribeWithOpenAi(params.key, params.audio);
    userText = userText ? `${spoken}\n(${userText})` : spoken;
  }
  if (!userText) throw new Error('לא נקלט דיבור — נסו שוב קרוב יותר למיקרופון.');

  const messages = [
    {
      role: 'system',
      content: `${params.systemPrompt}\n\nסכמת ה־JSON המחייבת:\n${JSON.stringify(AI_RESPONSE_SCHEMA)}`,
    },
    ...params.history.map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: userText },
  ];

  logVoice('ai:req', 'שליחת פקודה ל-OpenAI', { provider: 'openai', model: 'gpt-4o-mini', textLen: userText.length });
  const t0 = Date.now();
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages,
    }),
  });
  const ms = Date.now() - t0;

  if (!res.ok) {
    const errText = await res.text();
    logVoice('ai:res', 'שגיאת HTTP מ-OpenAI', { provider: 'openai', model: 'gpt-4o-mini', status: res.status, ms, ok: false, snippet: errText.slice(0, 160) }, 'error');
    throw formatHttpError('openai', res.status, errText);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawText = data.choices?.[0]?.message?.content || '';
  logVoice('ai:res', 'תגובה מ-OpenAI', { provider: 'openai', model: 'gpt-4o-mini', status: res.status, ms, ok: Boolean(rawText), textLen: rawText.length });
  if (!rawText) throw new Error('ChatGPT לא החזיר תשובה.');
  const result = parseAiResult(rawText);
  if (!result.transcript) result.transcript = userText;
  return result;
}

async function runClaudeCommand(params: {
  key: string;
  systemPrompt: string;
  text?: string;
  history: VoiceSessionMessage[];
}): Promise<VoiceAiResult> {
  const userText = params.text?.trim() || '';
  if (!userText) throw new Error('לא נקלט טקסט לשליחה ל־Claude.');

  const messages = [
    ...params.history.map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: userText },
  ];

  logVoice('ai:req', 'שליחת פקודה ל-Claude', { provider: 'claude', model: 'claude-haiku-4-5', textLen: userText.length });
  const t0 = Date.now();
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': params.key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: `${params.systemPrompt}\n\nהחזר JSON גולמי בלבד התואם בדיוק לסכמה:\n${JSON.stringify(AI_RESPONSE_SCHEMA)}`,
      messages,
    }),
  });
  const ms = Date.now() - t0;

  if (!res.ok) {
    const errText = await res.text();
    logVoice('ai:res', 'שגיאת HTTP מ-Claude', { provider: 'claude', model: 'claude-haiku-4-5', status: res.status, ms, ok: false, snippet: errText.slice(0, 160) }, 'error');
    throw formatHttpError('claude', res.status, errText);
  }

  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const rawText = data.content?.find((b) => b.type === 'text')?.text || '';
  logVoice('ai:res', 'תגובה מ-Claude', { provider: 'claude', model: 'claude-haiku-4-5', status: res.status, ms, ok: Boolean(rawText), textLen: rawText.length });
  if (!rawText) throw new Error('Claude לא החזיר תשובה.');
  const result = parseAiResult(rawText);
  if (!result.transcript) result.transcript = userText;
  return result;
}

export async function runVoiceCommand(params: {
  state: AppState;
  currentMode: 'home' | 'super';
  audio?: Blob;
  text?: string;
  previousInteractionId?: string;
  history?: VoiceSessionMessage[];
  providerOverride?: AiProvider;
}): Promise<VoiceAiResult> {
  const provider = params.providerOverride ?? getAiProvider();
  const key = getAiKey(provider);
  if (!key) {
    throw new Error(`חסר מפתח API עבור ${PROVIDER_META[provider].shortLabel}. הגדירו אותו בהגדרות.`);
  }

  const systemPrompt = buildSystemPrompt(params.state, params.currentMode);
  const history = params.history ?? [];

  if (provider === 'gemini') {
    return runGeminiInteraction({
      key,
      systemPrompt,
      audio: params.audio,
      text: params.text,
      previousInteractionId: params.previousInteractionId,
      history,
    });
  }
  if (provider === 'openai') {
    return runOpenAiCommand({
      key,
      systemPrompt,
      audio: params.audio,
      text: params.text,
      history,
    });
  }
  return runClaudeCommand({
    key,
    systemPrompt,
    text: params.text,
    history,
  });
}

export async function testAiConnection(
  provider: AiProvider,
  rawKey: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = rawKey.trim();
  if (!key) return { ok: false, error: 'הדביקו קודם מפתח API תקין' };

  try {
    if (provider === 'gemini') {
      const candidates = orderedGeminiModels();
      let lastStatus = 503;
      let lastErrText = '';
      for (const spec of candidates) {
        let includeThinking = true;
        while (true) {
          const payload: Record<string, unknown> = {
            model: spec.id,
            input: 'Reply with the single word OK.',
            store: false,
          };
          if (includeThinking) {
            payload.generation_config = { thinking_level: spec.thinkingLevel };
          }
          const res = await fetchWithTimeout(GEMINI_INTERACTIONS_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': key,
            },
            body: JSON.stringify(payload),
          });
          if (res.ok) return { ok: true };
          const errText = await res.text();
          if (res.status === 401 || res.status === 403) {
            throw formatHttpError('gemini', res.status, errText);
          }
          if (includeThinking && isThinkingConfigError(res.status, errText)) {
            includeThinking = false;
            continue;
          }
          if (isFailoverGeminiStatus(res.status)) {
            if (res.status === 503 || res.status === 429) {
              geminiCooldownUntil.set(spec.id, Date.now() + GEMINI_COOLDOWN_MS);
            }
            lastStatus = res.status;
            lastErrText = errText;
            break;
          }
          throw formatHttpError('gemini', res.status, errText);
        }
      }
      throw formatHttpError('gemini', lastStatus, lastErrText);
    }

    if (provider === 'openai') {
      const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'OK' }],
        }),
      });
      if (!res.ok) throw formatHttpError('openai', res.status, await res.text());
      return { ok: true };
    }

    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 8,
        messages: [{ role: 'user', content: 'OK' }],
      }),
    });
    if (!res.ok) throw formatHttpError('claude', res.status, await res.text());
    return { ok: true };
  } catch (err) {
    if (err instanceof TypeError) {
      return { ok: false, error: 'שגיאת רשת בגישה לשרת ה־API.' };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'שגיאה בבדיקת החיבור.' };
  }
}
