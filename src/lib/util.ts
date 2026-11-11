import type { AppState, CatalogItem, Category, ListEntry } from '../types';

// ---------- Hebrew-aware search ----------
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '') // niqqud
    .replace(/['"`׳״’‘“”]/g, '')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[()\/\\,.\-–_+%×*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every query token must appear somewhere in the item name (or sub-category). */
export function matches(item: CatalogItem, normQuery: string): boolean {
  if (!normQuery) return true;
  const hay = normalize(item.name) + ' ' + normalize(item.subCategory);
  return normQuery.split(' ').every((t) => hay.includes(t));
}

// ---------- Quantities ----------
export const KG = 'ק"ג';

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function stepUp(qty: number, unit: string): number {
  if (unit === KG) return round1(qty < 0.5 ? qty + 0.1 : qty + 0.5);
  return qty + 1;
}

/** Returns 0 when the item should leave the list. */
export function stepDown(qty: number, unit: string): number {
  if (unit === KG) return Math.max(0, round1(qty <= 0.5 ? qty - 0.1 : qty - 0.5));
  return Math.max(0, qty - 1);
}

export function formatQty(qty: number, unit: string): string {
  const n = Number.isInteger(qty) ? String(qty) : String(round1(qty));
  return `${n} ${unit}`;
}

// ---------- Family identity ----------
const FAMILY_KEY = 'fs:familyId';
const HOME_NAME_KEY = 'fs:homeName';
const NAME_KEY = 'fs:myName';
export const DEFAULT_FAMILY_ID = 'meir-family';

export function randomId(len = 6) {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

export function getHomeName(): string {
  return localStorage.getItem(HOME_NAME_KEY) || '';
}

export function setHomeName(name: string) {
  const trimmed = name.trim();
  if (trimmed) localStorage.setItem(HOME_NAME_KEY, trimmed);
  else localStorage.removeItem(HOME_NAME_KEY);
}

export function generateFamilyId(): string {
  return `home-${randomId(6)}`;
}

/**
 * Resolves the family ID.
 * Priority:
 * 1. Stored ID in localStorage
 * 2. URL parameter (?f=<id>)
 * 3. null (requires Onboarding for new visitors)
 */
export function resolveFamilyId(): string | null {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('f');
  const stored = localStorage.getItem(FAMILY_KEY);

  // If user opens an invite URL
  if (fromUrl && /^[a-z0-9_-]{3,40}$/i.test(fromUrl)) {
    // If not yet joined any home, or already at this home
    if (!stored || stored === fromUrl) {
      localStorage.setItem(FAMILY_KEY, fromUrl);
      url.searchParams.delete('f');
      history.replaceState(null, '', url.toString());
      return fromUrl;
    }
    // If they already have a different home, let App.tsx prompt them
    return stored;
  }

  return stored;
}

export function getPendingInviteFromUrl(): string | null {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('f');
  if (fromUrl && /^[a-z0-9_-]{3,40}$/i.test(fromUrl)) {
    return fromUrl;
  }
  return null;
}

export function createNewHome(homeName: string, myName: string): string {
  const newId = generateFamilyId();
  localStorage.setItem(FAMILY_KEY, newId);
  setHomeName(homeName || 'הבית שלנו');
  if (myName.trim()) setMyName(myName);
  return newId;
}

export function joinHome(familyId: string, myName?: string, homeName?: string): void {
  const cleanId = familyId.trim().toLowerCase();
  localStorage.setItem(FAMILY_KEY, cleanId);
  if (myName && myName.trim()) setMyName(myName);
  if (homeName && homeName.trim()) setHomeName(homeName);
  const url = new URL(location.href);
  if (url.searchParams.has('f')) {
    url.searchParams.delete('f');
    history.replaceState(null, '', url.toString());
  }
}

export function familyLink(familyId: string) {
  return `${location.origin}${location.pathname}?f=${familyId}`;
}

export function cleanAppUrl(): string {
  return `${location.origin}${location.pathname}?ref=share`;
}

export function appShareWhatsAppText(): string {
  const url = cleanAppUrl();
  return `היי! מצאתי אפליקציה מעולה וחינמית לרשימת קניות משפחתית מסונכרנת בזמן אמת – "אין כלום בבית" 🛒🥑\nמוזמנים להקים בית ורשימה משלכם בשניות:\n${url}`;
}

export function familyInviteWhatsAppText(familyId: string, homeName?: string) {
  const name = homeName || getHomeName() || 'הבית';
  const link = familyLink(familyId);
  return `היי! בוא/י ננהל יחד את רשימת הקניות של ${name} באפליקציית "אין כלום בבית" 🛒\nלהצטרפות מיידית לרשימה:\n${link}`;
}

export function switchFamily(idOrLink: string): boolean {
  const m = idOrLink.trim().match(/(?:[?&]f=)?([a-z0-9_-]{3,40})\s*$/i);
  if (!m) return false;
  localStorage.setItem(FAMILY_KEY, m[1].toLowerCase());
  location.reload();
  return true;
}

export function getDeviceId(): string {
  let id = localStorage.getItem('fs:deviceId');
  if (!id) {
    id = randomId(12);
    localStorage.setItem('fs:deviceId', id);
  }
  return id;
}

export function getMyName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}
export function setMyName(n: string) {
  localStorage.setItem(NAME_KEY, n.trim());
}

// ---------- Grouping ----------
export function sortedCategories(cats: Category[]) {
  return [...cats].sort((a, b) => a.order - b.order);
}

export function groupBySub(items: CatalogItem[]): [string, CatalogItem[]][] {
  const map = new Map<string, CatalogItem[]>();
  for (const it of [...items].sort((a, b) => a.sortIndex - b.sortIndex)) {
    const k = it.subCategory || 'אחר';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(it);
  }
  return [...map.entries()];
}

// ---------- Export ----------
export function buildShareText(state: AppState): string {
  const lines: string[] = ['🛒 *רשימת קניות*', ''];
  let count = 0;
  for (const cat of sortedCategories(state.categories)) {
    const rows = Object.values(state.list)
      .filter((e) => !e.isPurchased && state.catalog[e.itemId]?.categoryId === cat.id)
      .map((e) => [state.catalog[e.itemId], e] as [CatalogItem, ListEntry])
      .sort((a, b) => a[0].sortIndex - b[0].sortIndex);
    if (!rows.length) continue;
    lines.push(`${cat.icon} *${cat.name}*`);
    for (const [it, e] of rows) {
      count++;
      lines.push(`• ${it.name} – ${formatQty(e.qty, it.defaultUnit)}${e.notes ? ` _(${e.notes})_` : ''}`);
    }
    lines.push('');
  }
  if (!count) return '';
  lines.push(`סה"כ ${count} מוצרים`);
  return lines.join('\n');
}

export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* iOS – unsupported */
  }
}
