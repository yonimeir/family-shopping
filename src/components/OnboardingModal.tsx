import { useState } from 'react';
import fridgeBadge from '../assets/fridge-retro-badge.png';
import { createNewHome, joinHome } from '../lib/util';

interface OnboardingModalProps {
  pendingInviteId: string | null;
  onComplete: (familyId: string) => void;
  onDismissPendingInvite?: () => void;
}

export function OnboardingModal({
  pendingInviteId,
  onComplete,
  onDismissPendingInvite,
}: OnboardingModalProps) {
  const [tab, setTab] = useState<'create' | 'join'>(pendingInviteId ? 'join' : 'create');
  
  // Form fields
  const [homeName, setHomeName] = useState('הבית שלנו');
  const [myName, setMyName] = useState('');
  const [joinCode, setJoinCode] = useState(pendingInviteId || '');
  const [error, setError] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmedHome = homeName.trim() || 'הבית שלנו';
    const trimmedName = myName.trim();
    const id = createNewHome(trimmedHome, trimmedName);
    onComplete(id);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const raw = joinCode.trim();
    if (!raw) {
      setError('נא להזין קוד בית או להדביק קישור הזמנה');
      return;
    }
    const match = raw.match(/(?:[?&]f=)?([a-z0-9_-]{3,40})\s*$/i);
    if (!match) {
      setError('קוד הבית לא תקין. דוגמה לקוד תקין: home-abc123');
      return;
    }
    const targetId = match[1].toLowerCase();
    joinHome(targetId, myName.trim());
    onComplete(targetId);
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <div className="onboarding-brand">
          <img src={fridgeBadge} alt="אין כלום בבית" className="onboarding-fridge-badge" />
          <h1 id="onboarding-title" className="onboarding-title">אין כלום בבית</h1>
          <p className="onboarding-tagline">רשימת קניות משפחתית חכמה ומסונכרנת בזמן אמת</p>
        </div>

        {pendingInviteId ? (
          <div className="onboarding-invite-banner">
            <div className="invite-pill">הזמנה להצטרפות</div>
            <div className="invite-desc">הוזמנת להצטרף לבית עם הקוד: <strong>{pendingInviteId}</strong></div>
            <form onSubmit={handleJoin} className="onboarding-form">
              <label className="onboarding-field">
                <span>מה השם שלך? (אופציונלי)</span>
                <input
                  type="text"
                  placeholder="למשל: דנה"
                  value={myName}
                  onChange={(e) => setMyName(e.target.value)}
                  autoFocus
                />
              </label>

              {error && <div className="onboarding-error">{error}</div>}

              <button type="submit" className="onboarding-submit-btn">
                הצטרפות לבית 🛒
              </button>

              {onDismissPendingInvite && (
                <button
                  type="button"
                  className="onboarding-subtle-btn"
                  onClick={onDismissPendingInvite}
                >
                  אני רוצה להקים בית חדש משלי
                </button>
              )}
            </form>
          </div>
        ) : (
          <div className="onboarding-body">
            <div className="onboarding-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'create'}
                className={tab === 'create' ? 'active' : ''}
                onClick={() => { setTab('create'); setError(''); }}
              >
                הקמת בית חדש
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'join'}
                className={tab === 'join' ? 'active' : ''}
                onClick={() => { setTab('join'); setError(''); }}
              >
                הצטרפות לבית קיים
              </button>
            </div>

            {tab === 'create' ? (
              <form onSubmit={handleCreate} className="onboarding-form">
                <label className="onboarding-field">
                  <span>שם הבית / המשפחה</span>
                  <input
                    type="text"
                    placeholder="למשל: משפחת ישראלי או הבית שלנו"
                    value={homeName}
                    onChange={(e) => setHomeName(e.target.value)}
                    required
                  />
                </label>

                <label className="onboarding-field">
                  <span>השם שלך (כדי שיראו מי הוסיף מוצרים)</span>
                  <input
                    type="text"
                    placeholder="למשל: יוני"
                    value={myName}
                    onChange={(e) => setMyName(e.target.value)}
                  />
                </label>

                {error && <div className="onboarding-error">{error}</div>}

                <button type="submit" className="onboarding-submit-btn">
                  הקמת הבית והתחלת קניות ✨
                </button>
                <div className="onboarding-hint">
                  יוקם עבורכם קוד בית ייחודי, ותוכלו להזמין שותפים ומשפחה בוואטסאפ בכל רגע.
                </div>
              </form>
            ) : (
              <form onSubmit={handleJoin} className="onboarding-form">
                <label className="onboarding-field">
                  <span>קוד בית או קישור הזמנה</span>
                  <input
                    type="text"
                    placeholder="למשל: home-a1b2c3 או הדבק קישור"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    required
                    autoFocus
                  />
                </label>

                <label className="onboarding-field">
                  <span>השם שלך (אופציונלי)</span>
                  <input
                    type="text"
                    placeholder="למשל: תמר"
                    value={myName}
                    onChange={(e) => setMyName(e.target.value)}
                  />
                </label>

                {error && <div className="onboarding-error">{error}</div>}

                <button type="submit" className="onboarding-submit-btn">
                  הצטרפות לבית 🛒
                </button>
                <div className="onboarding-hint">
                  קיבלת קישור בוואטסאפ? הדבק אותו כאן כדי להתחבר מיידית לרשימה המשותפת.
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
