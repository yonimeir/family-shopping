export type NativeQuickAction = 'voice' | 'chat';

interface EinKlumWidgetBridge {
  setUnreadCount?: (count: number) => void;
  setShopperActive?: (active: boolean) => void;
  consumePendingAction?: () => string | null;
}

declare global {
  interface Window {
    EinKlumWidget?: EinKlumWidgetBridge;
    __einKlumAction?: (action: NativeQuickAction) => void;
    __einKlumBack?: () => boolean;
  }
}

export function syncWidgetUnreadCount(count: number): void {
  try {
    window.EinKlumWidget?.setUnreadCount?.(Math.max(0, Math.floor(count)));
  } catch {
    /* Web / iOS no-op */
  }
}

export function syncWidgetShopperState(active: boolean): void {
  try {
    window.EinKlumWidget?.setShopperActive?.(Boolean(active));
  } catch {
    /* Web / iOS no-op */
  }
}

export function consumeNativePendingAction(): NativeQuickAction | null {
  try {
    const raw = window.EinKlumWidget?.consumePendingAction?.();
    if (raw === 'voice' || raw === 'chat') return raw;
    return null;
  } catch {
    return null;
  }
}

export function registerNativeHandlers(handlers: {
  onVoice: () => void;
  onChat: () => void;
}): () => void {
  window.__einKlumAction = (action: NativeQuickAction) => {
    if (action === 'voice') handlers.onVoice();
    else if (action === 'chat') handlers.onChat();
  };

  window.__einKlumBack = () => {
    const hasLightbox = Boolean(document.querySelector('.chat-lightbox-backdrop'));
    const hasSheet = document.body.classList.contains('sheet-open');
    if (!hasLightbox && !hasSheet) return false;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return true;
  };

  return () => {
    delete window.__einKlumAction;
    delete window.__einKlumBack;
  };
}
