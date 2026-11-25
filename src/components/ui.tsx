import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons';

const SHEET_EXIT_MS = 200;

/** Subtle Flighty/NumberFlow vertical rolling counter; skips animation on first mount. */
export function RollingNumber({ value, className }: { value: number | string; className?: string }) {
  const [anim, setAnim] = useState<{ val: number | string; dir: 'up' | 'down' | null }>({
    val: value,
    dir: null,
  });

  useLayoutEffect(() => {
    if (value === anim.val) return;
    const prevNum = typeof anim.val === 'number' ? anim.val : parseFloat(String(anim.val));
    const nextNum = typeof value === 'number' ? value : parseFloat(String(value));
    const dir: 'up' | 'down' =
      !Number.isNaN(prevNum) && !Number.isNaN(nextNum) && nextNum !== prevNum
        ? nextNum > prevNum
          ? 'up'
          : 'down'
        : 'up';
    setAnim({ val: value, dir });
  }, [value, anim.val]);

  return (
    <span className={`rolling-num tabular-nums ${className ?? ''}`}>
      <span key={String(anim.val)} className={anim.dir ? `roll-val roll-${anim.dir}` : 'roll-val'}>
        {anim.val}
      </span>
    </span>
  );
}

/** Vaul-style swipeable bottom sheet rendered in a portal over document.body. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const mountedAtRef = useRef(performance.now());
  const backdropPointerDownRef = useRef(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number>();
  const drag = useRef({
    watching: false,
    engaged: false,
    fromHeader: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastY: 0,
    lastT: 0,
    dy: 0,
    vy: 0,
  });

  const triggerClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    document.body.classList.remove('sheet-open');
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      onCloseRef.current();
    }, SHEET_EXIT_MS);
  }, []);

  useEffect(() => {
    const originY = window.scrollY + window.innerHeight * 0.42;
    document.documentElement.style.setProperty('--sheet-origin-y', `${originY}px`);
    document.body.classList.add('no-scroll', 'sheet-open');

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') triggerClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(closeTimer.current);
      document.body.classList.remove('no-scroll', 'sheet-open');
    };
  }, [triggerClose]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (closing || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, summary, [data-no-drag]')) return;

    const fromHeader = Boolean(target.closest('.sheet-handle-bar, .sheet-head'));
    const bodyEl = bodyRef.current;
    const atTop = !bodyEl || bodyEl.scrollTop <= 0;
    if (!fromHeader && !atTop) return;

    const now = performance.now();
    drag.current = {
      watching: true,
      engaged: fromHeader,
      fromHeader,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastY: e.clientY,
      lastT: now,
      dy: 0,
      vy: 0,
    };
    if (fromHeader) {
      sheetRef.current?.classList.add('sheet-dragging');
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore synthetic events */
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.watching || closing) return;
    const rawDy = e.clientY - d.startY;
    const rawDx = e.clientX - d.startX;

    if (!d.engaged) {
      if (rawDy < -6 || Math.abs(rawDx) > Math.abs(rawDy) + 4) {
        d.watching = false;
        return;
      }
      const bodyEl = bodyRef.current;
      if (rawDy > 6 && (!bodyEl || bodyEl.scrollTop <= 0)) {
        d.engaged = true;
        d.startY = e.clientY;
        sheetRef.current?.classList.add('sheet-dragging');
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore synthetic events */
        }
      } else {
        return;
      }
    }

    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    const delta = e.clientY - d.startY;
    // Soft rubber-banding if pulled upward past top edge
    const dy = delta >= 0 ? delta : -Math.pow(-delta, 0.65);
    d.vy = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = now;
    d.dy = dy;

    sheetRef.current?.style.setProperty('--sheet-drag', `${dy}px`);
    const alpha = Math.max(0.15, 1 - Math.max(0, dy) / 360);
    backdropRef.current?.style.setProperty('--sheet-alpha', String(alpha));
  };

  const finishDrag = () => {
    const d = drag.current;
    if (!d.watching) return;
    const wasEngaged = d.engaged;
    const { dy, vy, pointerId } = d;
    d.watching = false;
    d.engaged = false;
    d.pointerId = -1;
    sheetRef.current?.classList.remove('sheet-dragging');
    try {
      if (pointerId >= 0 && sheetRef.current?.hasPointerCapture?.(pointerId)) {
        sheetRef.current.releasePointerCapture(pointerId);
      }
    } catch {
      /* ignore */
    }

    if (!wasEngaged) return;
    if (dy > 110 || (vy > 0.45 && dy > 24)) {
      triggerClose();
    } else {
      sheetRef.current?.style.setProperty('--sheet-drag', '0px');
      backdropRef.current?.style.setProperty('--sheet-alpha', '1');
    }
  };

  return createPortal(
    <div
      ref={backdropRef}
      className={`sheet-backdrop ${closing ? 'sheet-backdrop-closing' : ''}`}
      onPointerDown={(e) => {
        backdropPointerDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const startedOnBackdrop = backdropPointerDownRef.current;
        backdropPointerDownRef.current = false;
        if (!startedOnBackdrop || e.target !== e.currentTarget) return;
        if (performance.now() - mountedAtRef.current < 260) return;
        triggerClose();
      }}
    >
      <div
        ref={sheetRef}
        className={`sheet ${closing ? 'sheet-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div className="sheet-handle-bar" aria-hidden="true">
          <span className="sheet-handle" />
        </div>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={triggerClose} aria-label="סגור">
            <IconClose className="w-5 h-5" />
          </button>
        </div>
        <div ref={bodyRef} className="sheet-body">
          {children}
        </div>
      </div>
    </div>,
    document.body
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
  return createPortal(
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.text}</span>
      {toast.onAction && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.onAction!();
            onDone();
          }}
        >
          {toast.actionLabel ?? 'בטל'}
        </button>
      )}
    </div>,
    document.body
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
