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
const NAME_KEY = 'fs:myName';

function randomId(len = 20) {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

/** URL ?f=<id> wins (partner opened the shared link), then localStorage, else create a new family. */
export function resolveFamilyId(): string {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('f');
  if (fromUrl && /^[a-z0-9]{12,40}$/.test(fromUrl)) {
    localStorage.setItem(FAMILY_KEY, fromUrl);
    url.searchParams.delete('f');
    history.replaceState(null, '', url.toString());
    return fromUrl;
  }
  let id = localStorage.getItem(FAMILY_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(FAMILY_KEY, id);
  }
  return id;
}

export function familyLink(familyId: string) {
  return `${location.origin}${location.pathname}?f=${familyId}`;
}

export function switchFamily(idOrLink: string): boolean {
  const m = idOrLink.trim().match(/(?:[?&]f=)?([a-z0-9]{12,40})\s*$/);
  if (!m) return false;
  localStorage.setItem(FAMILY_KEY, m[1]);
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
