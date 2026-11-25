export interface Category {
  id: string;
  name: string;
  order: number;
  icon: string;
}

/** Permanent catalog entry (rarely changes). */
export interface CatalogItem {
  id: string;
  name: string;
  categoryId: string;
  subCategory: string;
  defaultUnit: string;
  defaultQty: number;
  isCore: boolean;
  /** Stable display order inside a sub-category. */
  sortIndex: number;
}

/**
 * Active shopping-list state. A document exists ONLY while the item is in the cart
 * (inCart === true is implied by existence).
 */
export interface ListEntry {
  itemId: string;
  qty: number;
  notes: string;
  isPurchased: boolean;
  /** Display name of who added it (may be empty). */
  addedBy: string;
  /** Random per-device id – used to flag items your partner added while you shop. */
  addedByDevice: string;
  addedAt: number;
  purchasedAt?: number;
}

export type ChatMessageKind = 'text' | 'ping' | 'item_question' | 'photo' | 'reply';

export interface ChatMessage {
  id: string;
  kind: ChatMessageKind;
  text: string;
  senderName: string;
  senderDevice: string;
  createdAt: number;
  itemId?: string;
  itemName?: string;
  photoDataUrl?: string;
  replyToId?: string;
  replyToPreview?: string;
}

export interface ShopperPresence {
  name: string;
  deviceId: string;
  enteredAt: number;
  active: boolean;
}

export interface AppState {
  ready: boolean;
  categories: Category[];
  catalog: Record<string, CatalogItem>;
  list: Record<string, ListEntry>;
  chat: ChatMessage[];
  shopper: ShopperPresence | null;
}

export type CheckoutMode = 'keepRemaining' | 'resetAll';

export interface Backend {
  readonly kind: 'firebase' | 'local';
  subscribe(cb: (s: AppState) => void, onSyncState?: (s: SyncState) => void): () => void;
  setEntry(entry: ListEntry): Promise<void>;
  patchEntry(itemId: string, patch: Partial<ListEntry>): Promise<void>;
  removeEntry(itemId: string): Promise<void>;
  upsertCatalogItem(item: CatalogItem): Promise<void>;
  deleteCatalogItem(id: string): Promise<void>;
  saveCategories(categories: Category[]): Promise<void>;
  checkout(mode: CheckoutMode): Promise<void>;
  sendChatMessage(msg: ChatMessage): Promise<void>;
  clearChat(): Promise<void>;
  setShopper(shopper: ShopperPresence | null): Promise<void>;
}

export type SyncState = 'synced' | 'pending' | 'offline';
