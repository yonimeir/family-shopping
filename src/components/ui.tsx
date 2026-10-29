import { useEffect, useRef, type ReactNode } from 'react';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="סגור">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export interface ToastData {
  id: number;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function Toast({ toast, onDone }: { toast: ToastData | null; onDone: () => void }) {
  const timer = useRef<number>();
  useEffect(() => {
    if (!toast) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(onDone, toast.onAction ? 4500 : 2500);
    return () => window.clearTimeout(timer.current);
  }, [toast, onDone]);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.text}</span>
      {toast.onAction && (
        <button
          className="toast-action"
          onClick={() => {
            toast.onAction!();
            onDone();
          }}
        >
          {toast.actionLabel ?? 'בטל'}
        </button>
      )}
    </div>
  );
}

/** Tap vs. long-press without breaking scroll. */
export function useLongPress(onLong: () => void, ms = 550) {
  const t = useRef<number>();
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    window.clearTimeout(t.current);
    start.current = null;
  };
  return {
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        t.current = window.setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(25);
          onLong();
        }, ms);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
    /** Call at the start of onClick; returns true if this click was a long press and should be ignored. */
    wasLong: () => {
      const f = fired.current;
      fired.current = false;
      return f;
    },
  };
}
