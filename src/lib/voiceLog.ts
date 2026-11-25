export type VoiceLogLevel = 'info' | 'warn' | 'error';

export interface VoiceLogEntry {
  id: number;
  ts: string;
  level: VoiceLogLevel;
  stage: string;
  msg: string;
  detail?: string;
}

export const VOICE_LOGS_EVENT = 'fs:voice-logs-updated';
const STORAGE_KEY = 'fs:voice_logs_v1';
const MAX_LOGS = 80;

function sanitizeSensitive(text: string): string {
  return text
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

function formatDetail(detail: unknown): string | undefined {
  if (detail === undefined || detail === null) return undefined;
  let raw = '';
  if (detail instanceof Error) {
    raw = `${detail.name}: ${detail.message}`;
  } else if (typeof detail === 'string') {
    raw = detail;
  } else {
    try {
      raw = JSON.stringify(detail);
    } catch {
      raw = String(detail);
    }
  }
  const clean = sanitizeSensitive(raw).trim();
  if (!clean) return undefined;
  return clean.length > 260 ? `${clean.slice(0, 257)}...` : clean;
}

function nowTimestamp(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function loadInitialLogs(): VoiceLogEntry[] {
  try {
    if (typeof sessionStorage === 'undefined') return [];
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX_LOGS);
  } catch {
    return [];
  }
}

let logs: VoiceLogEntry[] = loadInitialLogs();
let seq = logs.length > 0 ? (logs[logs.length - 1]?.id ?? 0) + 1 : 1;

function persistLogs(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    }
  } catch {
    /* ignore quota errors */
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof Event === 'function') {
      window.dispatchEvent(new Event(VOICE_LOGS_EVENT));
    }
  } catch {
    /* ignore */
  }
}

export function logVoice(
  stage: string,
  msg: string,
  detail?: unknown,
  level: VoiceLogLevel = 'info'
): void {
  const entry: VoiceLogEntry = {
    id: seq++,
    ts: nowTimestamp(),
    level,
    stage,
    msg: sanitizeSensitive(msg),
    ...(detail !== undefined ? { detail: formatDetail(detail) } : {}),
  };
  logs = [...logs.slice(-(MAX_LOGS - 1)), entry];
  persistLogs();
}

export function getVoiceLogs(): VoiceLogEntry[] {
  return [...logs];
}

export function clearVoiceLogs(): void {
  logs = [];
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof Event === 'function') {
      window.dispatchEvent(new Event(VOICE_LOGS_EVENT));
    }
  } catch {
    /* ignore */
  }
}

export function formatVoiceLogsText(meta?: { provider?: string; hasKey?: boolean }): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  const header = [
    `=== Family Shopping Voice Diagnostic Logs ===`,
    `Time: ${new Date().toISOString()}`,
    `Provider: ${meta?.provider ?? 'unknown'} | HasKey: ${meta?.hasKey ? 'yes' : 'no'}`,
    `UA: ${ua}`,
    `Entries: ${logs.length}`,
    `---------------------------------------------`,
  ];
  const lines = logs.map((e) => {
    const tag = e.level.toUpperCase();
    return `${e.ts} [${tag}] (${e.stage}) ${e.msg}${e.detail ? ` | ${e.detail}` : ''}`;
  });
  return [...header, ...lines].join('\n');
}
