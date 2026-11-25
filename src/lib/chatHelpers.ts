import type { ChatMessage, ShopperPresence } from '../types';

export const MAX_CHAT_MESSAGES = 35;
export const MAX_CHAT_PHOTOS = 6;
export const SHOPPER_STALE_MS = 3 * 60 * 60 * 1000; // 3 hours
export const SHOPPER_REFRESH_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

export const CHAT_MUTE_KEY = 'fs:chat_muted';
export const CHAT_MUTE_EVENT = 'fs:chat_mute_changed';
export const CHAT_UNREAD_EVENT = 'fs:chat_unread';
export const CHAT_UNREAD_STORAGE_KEY = 'fs:chat_unread_count';

export const QUICK_PINGS = ['אני בקופה', "יוצא עוד 5 דק'", 'צריך עוד משהו?'] as const;
export const ITEM_QUICK_REPLIES = ['כן, קח', 'דלג', 'קח תחליף'] as const;

export function itemQuestionPresets(itemName: string): string[] {
  return [
    `אין ${itemName} — להביא תחליף?`,
    `איזה סוג או גודל של ${itemName} לקחת?`,
  ];
}

/**
 * Deduplicates by id, sorts ascending by timestamp, enforces message cap (35)
 * and limits inline photos to the newest 6 so the Firestore family doc stays lean.
 */
export function appendAndCapChat(existing: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const m of existing) {
    if (m && m.id) map.set(m.id, m);
  }
  map.set(incoming.id, incoming);

  const sorted = [...map.values()].sort((a, b) => a.createdAt - b.createdAt);
  const sliced = sorted.length > MAX_CHAT_MESSAGES ? sorted.slice(sorted.length - MAX_CHAT_MESSAGES) : sorted;

  let photoCount = 0;
  const result = new Array<ChatMessage>(sliced.length);
  for (let i = sliced.length - 1; i >= 0; i--) {
    const msg = sliced[i];
    if (msg.photoDataUrl) {
      photoCount++;
      if (photoCount > MAX_CHAT_PHOTOS) {
        const { photoDataUrl: _removed, ...rest } = msg;
        result[i] = {
          ...rest,
          text: msg.text || 'תמונה מהמדף',
        };
        continue;
      }
    }
    result[i] = msg;
  }
  return result;
}

/** Strips heavy base64 photo payloads when mirroring chat into localStorage cache. */
export function stripPhotosForLocalCache(chat: ChatMessage[]): ChatMessage[] {
  return chat.map((msg) => {
    if (!msg.photoDataUrl) return msg;
    const { photoDataUrl: _removed, ...rest } = msg;
    return {
      ...rest,
      text: msg.text || 'תמונה מהמדף',
    };
  });
}

export function isShopperActive(
  shopper: ShopperPresence | null | undefined,
  myDeviceId: string,
  now = Date.now()
): boolean {
  return Boolean(
    shopper &&
      shopper.active &&
      shopper.deviceId !== myDeviceId &&
      now - shopper.enteredAt < SHOPPER_STALE_MS
  );
}

export function countUnreadMessages(chat: ChatMessage[], myDeviceId: string, lastReadAt: number): number {
  let count = 0;
  for (const msg of chat) {
    if (msg.senderDevice !== myDeviceId && msg.createdAt > lastReadAt) {
      count++;
    }
  }
  return count;
}

export function formatChatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function isChatMuted(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(CHAT_MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setChatMuted(muted: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      if (muted) localStorage.setItem(CHAT_MUTE_KEY, '1');
      else localStorage.removeItem(CHAT_MUTE_KEY);
    }
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CHAT_MUTE_EVENT, { detail: { muted } }));
    }
  } catch {
    /* ignore storage errors */
  }
}

export function getChatLastRead(familyId: string): number {
  try {
    if (typeof localStorage === 'undefined') return 0;
    const raw = localStorage.getItem(`fs:chat_last_read_${familyId}`);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function setChatLastRead(familyId: string, ts: number): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`fs:chat_last_read_${familyId}`, String(ts));
  } catch {
    /* ignore */
  }
}
