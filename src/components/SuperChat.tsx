import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AppState, CatalogItem, ChatMessage } from '../types';
import type { Actions } from '../lib/useStore';
import { getDeviceId, haptic, playAlertChime } from '../lib/util';
import {
  CHAT_MUTE_EVENT,
  CHAT_UNREAD_EVENT,
  CHAT_UNREAD_STORAGE_KEY,
  ITEM_QUICK_REPLIES,
  QUICK_PINGS,
  countUnreadMessages,
  formatChatTime,
  getChatLastRead,
  isChatMuted,
  isShopperActive,
  itemQuestionPresets,
  setChatLastRead,
} from '../lib/chatHelpers';
import { compressShelfPhoto } from '../lib/chatMedia';
import { RollingNumber, Sheet } from './ui';
import { IconBellOff, IconCamera, IconClose, IconMessage, IconSend, IconTrash } from './Icons';

interface Props {
  state: AppState;
  familyId: string;
  mode: 'home' | 'super';
  actions: Actions;
  onToast: (text: string) => void;
  autoOpenTrigger?: number;
  askItemRequest?: { id: number; item: CatalogItem } | null;
  otherSheetOpen?: boolean;
  onSheetOpenChange?: (open: boolean) => void;
}

export function SuperChat({
  state,
  familyId,
  mode,
  actions,
  onToast,
  autoOpenTrigger = 0,
  askItemRequest = null,
  otherSheetOpen = false,
  onSheetOpenChange,
}: Props) {
  const me = useMemo(getDeviceId, []);
  const [open, setOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [activeAskItem, setActiveAskItem] = useState<CatalogItem | null>(null);
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [previewMsg, setPreviewMsg] = useState<ChatMessage | null>(null);
  const [lastReadAt, setLastReadAt] = useState(() => getChatLastRead(familyId));
  const [muted, setMuted] = useState(isChatMuted);

  const feedRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seenIdsRef = useRef<Set<string> | null>(null);
  const previewTimerRef = useRef<number>();
  const lastHandledAutoTriggerRef = useRef(0);
  const lastHandledAskIdRef = useRef(0);

  const shopperActive = isShopperActive(state.shopper, me);

  useEffect(() => {
    onSheetOpenChange?.(open);
  }, [open, onSheetOpenChange]);

  useEffect(() => {
    seenIdsRef.current = null;
    setLastReadAt(getChatLastRead(familyId));
  }, [familyId]);

  useEffect(() => {
    const syncMuted = () => setMuted(isChatMuted());
    window.addEventListener(CHAT_MUTE_EVENT, syncMuted);
    return () => window.removeEventListener(CHAT_MUTE_EVENT, syncMuted);
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(previewTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (autoOpenTrigger > 0 && autoOpenTrigger !== lastHandledAutoTriggerRef.current) {
      lastHandledAutoTriggerRef.current = autoOpenTrigger;
      setOpen(true);
    }
  }, [autoOpenTrigger]);

  useEffect(() => {
    if (askItemRequest && askItemRequest.id !== lastHandledAskIdRef.current) {
      lastHandledAskIdRef.current = askItemRequest.id;
      setActiveAskItem(askItemRequest.item);
      setOpen(true);
    }
  }, [askItemRequest]);

  // Seed existing IDs without chiming; alert only on genuinely new partner messages.
  useEffect(() => {
    if (!state.ready) return;
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(state.chat.map((m) => m.id));
      return;
    }

    const unseenPartnerMsgs: ChatMessage[] = [];
    for (const msg of state.chat) {
      if (!seenIdsRef.current.has(msg.id)) {
        seenIdsRef.current.add(msg.id);
        if (msg.senderDevice !== me) {
          unseenPartnerMsgs.push(msg);
        }
      }
    }

    if (unseenPartnerMsgs.length === 0) return;
    const newest = unseenPartnerMsgs[unseenPartnerMsgs.length - 1];

    if (!open) {
      setPreviewMsg(newest);
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = window.setTimeout(() => setPreviewMsg(null), 4500);
      if (!isChatMuted() && Date.now() - newest.createdAt < 60_000) {
        playAlertChime();
        haptic(14);
      }
    }
  }, [state.ready, state.chat, me, open]);

  // Mark messages read when the drawer is open.
  useEffect(() => {
    if (!open) return;
    setPreviewMsg(null);
    const latestTs = state.chat.reduce((acc, m) => Math.max(acc, m.createdAt), Date.now());
    setLastReadAt(latestTs);
    setChatLastRead(familyId, latestTs);
  }, [open, state.chat, familyId]);

  // Auto-scroll to bottom when opening or receiving new messages.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const el = feedRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [open, state.chat.length]);

  const unreadCount = open ? 0 : countUnreadMessages(state.chat, me, lastReadAt);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_UNREAD_STORAGE_KEY, String(unreadCount));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(CHAT_UNREAD_EVENT, { detail: { unreadCount } }));
  }, [unreadCount]);

  // Capturing-phase Escape closes the lightbox before Vaul Sheet captures Escape.
  useEffect(() => {
    if (!lightboxPhoto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        setLightboxPhoto(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [lightboxPhoto]);

  const closeSheet = useCallback(() => {
    setOpen(false);
    setActiveAskItem(null);
  }, []);

  const openChat = useCallback(() => {
    haptic(10);
    setPreviewMsg(null);
    setOpen(true);
  }, []);

  const sendPing = (text: string) => {
    haptic(10);
    actions.sendChatMessage({ kind: 'ping', text });
  };

  const sendItemPreset = (item: CatalogItem, text: string) => {
    haptic(10);
    actions.sendChatMessage({
      kind: 'item_question',
      text,
      itemId: item.id,
      itemName: item.name,
    });
    setActiveAskItem(null);
  };

  const sendReply = (target: ChatMessage, replyText: string) => {
    haptic(10);
    actions.sendChatMessage({
      kind: 'reply',
      text: replyText,
      replyToId: target.id,
      replyToPreview: target.itemName || target.text.slice(0, 36) || 'תמונה מהמדף',
      itemId: target.itemId,
      itemName: target.itemName,
    });
  };

  const handleSubmitDraft = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftText.trim();
    if (!trimmed || sendingPhoto) return;
    haptic(10);
    if (activeAskItem) {
      actions.sendChatMessage({
        kind: 'item_question',
        text: trimmed,
        itemId: activeAskItem.id,
        itemName: activeAskItem.name,
      });
      setActiveAskItem(null);
    } else {
      actions.sendChatMessage({
        kind: 'text',
        text: trimmed,
      });
    }
    setDraftText('');
  };

  const handlePhotoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSendingPhoto(true);
    try {
      const dataUrl = await compressShelfPhoto(file);
      const caption =
        draftText.trim() ||
        (activeAskItem ? `איזה ${activeAskItem.name} לקחת?` : 'איזה מאלה לקחת?');
      actions.sendChatMessage({
        kind: 'photo',
        text: caption,
        photoDataUrl: dataUrl,
        itemId: activeAskItem?.id,
        itemName: activeAskItem?.name,
      });
      setDraftText('');
      setActiveAskItem(null);
      haptic(12);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה בשליחת התמונה';
      onToast(msg);
    } finally {
      setSendingPhoto(false);
    }
  };

  const handleClearChat = () => {
    haptic(10);
    void actions.clearChat();
    setActiveAskItem(null);
    onToast('השיחה נוקתה');
  };

  return createPortal(
    <>
      {!open && !otherSheetOpen && (
        <div className={`chat-fab-dock ${mode === 'super' ? 'is-super' : ''}`}>
          {previewMsg && (
            <button type="button" className="chat-preview-pill" onClick={openChat}>
              <span className="chat-preview-sender">{previewMsg.senderName}:</span>
              <span className="chat-preview-text">
                {previewMsg.itemName ? `${previewMsg.itemName} · ` : ''}
                {previewMsg.text || 'תמונה מהמדף'}
              </span>
            </button>
          )}
          <button
            type="button"
            className="chat-fab-btn"
            onClick={openChat}
            aria-label={unreadCount > 0 ? `צ'אט קניות (${unreadCount} הודעות חדשות)` : "פתיחת צ'אט קניות"}
            title="צ'אט קניות מהיר"
          >
            <IconMessage className="w-5 h-5" />
            {shopperActive && <span className="chat-fab-presence-dot" aria-hidden="true" />}
            {unreadCount > 0 && (
              <span className="chat-fab-badge">
                <RollingNumber value={unreadCount} />
              </span>
            )}
          </button>
        </div>
      )}

      {open && (
        <Sheet title="צ'אט קניות" onClose={closeSheet}>
          <div className="chat-sheet-wrap">
            {(shopperActive || muted || state.chat.length > 0) && (
              <div className="chat-sheet-top">
                <div className="chat-sheet-status-group">
                  {shopperActive && state.shopper && (
                    <div className="chat-presence-pill" role="status">
                      <span className="chat-live-dot" aria-hidden="true" />
                      <span>{state.shopper.name} נמצא בסופר</span>
                    </div>
                  )}
                  {muted && (
                    <span className="chat-muted-pill" title="התראות קוליות מושתקות במכשיר הזה">
                      <IconBellOff className="w-3.5 h-3.5 shrink-0" />
                      <span>מושתק</span>
                    </span>
                  )}
                </div>
                {state.chat.length > 0 && (
                  <button type="button" className="chat-clear-btn" onClick={handleClearChat}>
                    <IconTrash className="w-3.5 h-3.5 shrink-0" />
                    <span>נקה שיחה</span>
                  </button>
                )}
              </div>
            )}

            <div className="chat-quick-pings" data-no-drag>
              {QUICK_PINGS.map((ping) => (
                <button key={ping} type="button" className="chat-ping-btn" onClick={() => sendPing(ping)}>
                  {ping}
                </button>
              ))}
            </div>

            {activeAskItem && (
              <div className="chat-ask-card" data-no-drag>
                <div className="chat-ask-head">
                  <span className="chat-ask-title">
                    שאלה על: <strong>{activeAskItem.name}</strong>
                  </span>
                  <button
                    type="button"
                    className="chat-ask-dismiss"
                    onClick={() => setActiveAskItem(null)}
                    aria-label="ביטול הצמדת מוצר"
                  >
                    <IconClose className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="chat-ask-presets">
                  {itemQuestionPresets(activeAskItem.name).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="chat-ask-preset-btn"
                      onClick={() => sendItemPreset(activeAskItem, preset)}
                    >
                      {preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="chat-ask-preset-btn is-camera"
                    disabled={sendingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <IconCamera className="w-3.5 h-3.5 shrink-0" />
                    <span>צלם מדף</span>
                  </button>
                </div>
              </div>
            )}

            <div className="chat-messages-list" ref={feedRef} data-no-drag>
              {state.chat.length === 0 ? (
                <div className="chat-empty-state">
                  <div className="chat-empty-icon" aria-hidden="true">
                    <IconMessage className="w-6 h-6" />
                  </div>
                  <div className="chat-empty-title">צ'אט קניות מהיר</div>
                  <p className="chat-empty-sub">
                    עדכונים קצרים, שאלות על תחליפים ותמונות מהמדף. השיחה מתאפסת אוטומטית בסיום הקנייה.
                  </p>
                </div>
              ) : (
                state.chat.map((msg, idx) => {
                  const isMine = msg.senderDevice === me;
                  const hasLaterReply = state.chat.slice(idx + 1).some((later) => later.replyToId === msg.id);
                  const showQuickReplies =
                    !isMine && (msg.kind === 'item_question' || msg.kind === 'photo') && !hasLaterReply;

                  return (
                    <div key={msg.id} className={`chat-msg-group ${isMine ? 'is-mine' : 'is-partner'}`}>
                      <div className={`chat-bubble ${isMine ? 'is-mine' : 'is-partner'} kind-${msg.kind}`}>
                        {!isMine && <div className="chat-bubble-sender">{msg.senderName}</div>}

                        {msg.itemName && <div className="chat-bubble-item-tag">{msg.itemName}</div>}

                        {msg.replyToPreview && (
                          <div className="chat-bubble-reply-quote">{msg.replyToPreview}</div>
                        )}

                        {msg.photoDataUrl && (
                          <button
                            type="button"
                            className="chat-photo-thumb-btn"
                            onClick={() => setLightboxPhoto(msg.photoDataUrl!)}
                            aria-label="הגדלת תמונה מהמדף"
                          >
                            <img src={msg.photoDataUrl} alt={msg.itemName || 'תמונה מהמדף'} className="chat-photo-thumb" />
                          </button>
                        )}

                        {msg.text && <p className="chat-bubble-text">{msg.text}</p>}

                        <div className="chat-bubble-meta">
                          <span className="chat-bubble-time tabular-nums">{formatChatTime(msg.createdAt)}</span>
                        </div>
                      </div>

                      {showQuickReplies && (
                        <div className="chat-quick-replies">
                          {ITEM_QUICK_REPLIES.map((reply) => (
                            <button
                              key={reply}
                              type="button"
                              className="chat-quick-reply-btn"
                              onClick={() => sendReply(msg, reply)}
                            >
                              {reply}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <form className="chat-composer" onSubmit={handleSubmitDraft} data-no-drag>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="chat-file-input"
                onChange={handlePhotoPicked}
              />
              <button
                type="button"
                className="chat-composer-camera"
                disabled={sendingPhoto}
                onClick={() => fileInputRef.current?.click()}
                aria-label="צילום מהמדף"
                title="צילום מהמדף"
              >
                <IconCamera className="w-5 h-5" />
              </button>
              <input
                type="text"
                className="chat-composer-input"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder={activeAskItem ? `שאלה על ${activeAskItem.name}...` : 'כתבו הודעה קצרה...'}
                disabled={sendingPhoto}
              />
              <button
                type="submit"
                className="chat-composer-send"
                disabled={!draftText.trim() || sendingPhoto}
                aria-label="שליחת הודעה"
              >
                <IconSend className="w-4 h-4" />
              </button>
            </form>
          </div>
        </Sheet>
      )}

      {lightboxPhoto && (
        <div
          className="chat-lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="תצוגת תמונה מוגדלת"
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            type="button"
            className="chat-lightbox-close"
            onClick={() => setLightboxPhoto(null)}
            aria-label="סגירת תמונה"
          >
            <IconClose className="w-5 h-5" />
          </button>
          <img
            src={lightboxPhoto}
            alt="תמונה מהמדף"
            className="chat-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>,
    document.body
  );
}
