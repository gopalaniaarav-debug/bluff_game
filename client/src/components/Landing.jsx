import { useState } from 'react';
import PlayingCard from './PlayingCard';
import { PLAYER_COLORS } from '../gameUtils';
import SavedRoomsList from './SavedRoomsList';
import AboutModal from './AboutModal';

export default function Landing({
  user,
  onLogin,
  onRegister,
  onLogout,
  onCreate,
  onJoin,
  onStartAI,
  error,
  connected,
  roomsRefresh,
}) {
  const [mode, setMode] = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [colorIdx, setColorIdx] = useState(0);
  const [localRoomsRefresh, setLocalRoomsRefresh] = useState(0);
  const [authError, setAuthError] = useState('');
  const [aboutOpen, setAboutOpen] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (mode === 'login') {
        await onLogin(displayName.trim(), password);
      } else {
        await onRegister(displayName.trim(), password);
      }
      setPassword('');
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    await onCreate(PLAYER_COLORS[colorIdx]);
    setLocalRoomsRefresh((k) => k + 1);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomCode.trim()) {
      onJoin(roomCode.trim().toUpperCase(), PLAYER_COLORS[colorIdx]);
    }
  };

  const handleJoinSaved = (code) => {
    onJoin(code, PLAYER_COLORS[colorIdx]);
  };

  const handleStartAI = () => {
    onStartAI?.(PLAYER_COLORS[colorIdx]);
  };

  if (!user) {
    return (
      <div className="screen screen--landing">
        <div className="landing-shine" />
        <div className="landing-inner">
          <h1 className="landing-title">Bluff</h1>
          <p className="landing-tagline">
            Sign in with your display name and password to host private rooms and track your games.
          </p>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tabs__tab ${mode === 'login' ? 'auth-tabs__tab--active' : ''}`}
              onClick={() => { setMode('login'); setAuthError(''); }}
            >
              Log in
            </button>
            <button
              type="button"
              className={`auth-tabs__tab ${mode === 'register' ? 'auth-tabs__tab--active' : ''}`}
              onClick={() => { setMode('register'); setAuthError(''); }}
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuth}>
            <label className="field-label">Display name</label>
            <input
              className="field-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={14}
              placeholder="Your table name"
              required
            />
            <label className="field-label">Password</label>
            <input
              className="field-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 4 characters"
              minLength={4}
              required
            />
            <button type="submit" className="btn btn-gold" disabled={!connected}>
              {mode === 'login' ? 'Log in →' : 'Create account →'}
            </button>
          </form>

          <button type="button" className="landing-about-link" onClick={() => setAboutOpen(true)}>
            About · How to play
          </button>

          {!connected && (
            <p className="error-msg">Server offline — start the game server and refresh.</p>
          )}
          {authError && <p className="error-msg">{authError}</p>}
        </div>

        <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      </div>
    );
  }

  return (
    <div className="screen screen--landing">
      <div className="landing-shine" />
      <div className="landing-inner">
        <div className="landing-cards" aria-hidden>
          <div className="landing-cards__card" style={{ transform: 'rotate(-13deg) translateY(10px)' }}>
            <PlayingCard rank="A" suit="♠" size="lg" />
          </div>
          <div className="landing-cards__card" style={{ transform: 'rotate(-6deg) translateY(-2px)' }}>
            <PlayingCard rank="K" suit="♥" size="lg" />
          </div>
          <div className="landing-cards__card landing-cards__card--center">
            <PlayingCard faceDown size="lg" />
          </div>
          <div className="landing-cards__card" style={{ transform: 'rotate(6deg) translateY(-2px)' }}>
            <PlayingCard rank="Q" suit="♦" size="lg" />
          </div>
          <div className="landing-cards__card" style={{ transform: 'rotate(13deg) translateY(10px)' }}>
            <PlayingCard rank="J" suit="♣" size="lg" />
          </div>
        </div>

        <h1 className="landing-title">Bluff</h1>
        <p className="landing-tagline">
          Welcome back, <span className="landing-tagline__accent">{user.displayName}</span>.
          {' '}Host a room or join with a code.
        </p>

        <div className="landing-user-bar">
          <span className="landing-user-bar__name">{user.displayName}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setAboutOpen(true)}>
            About
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onLogout}>
            Log out
          </button>
        </div>

        <div className="landing-name-row">
          <label className="field-label">Your color</label>
          <div className="color-swatches landing-name-row__swatches">
            {PLAYER_COLORS.map((hex, i) => (
              <button
                key={hex}
                type="button"
                className={`color-swatch ${colorIdx === i ? 'color-swatch--active' : ''}`}
                style={{ background: hex }}
                onClick={() => setColorIdx(i)}
                aria-label={`Color ${i + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="landing-panels">
          <form className="landing-panel landing-panel--host" onSubmit={handleCreate}>
            <div className="landing-panel__title">Host a table</div>
            <div className="landing-panel__desc">Create a private room tied to your account.</div>
            <button type="submit" className="btn btn-gold" disabled={!connected}>
              Create room →
            </button>
          </form>

          <form className="landing-panel landing-panel--join" onSubmit={handleJoin}>
            <div className="landing-panel__title">Join a table</div>
            <div className="landing-panel__desc">Enter a 4-letter code from a friend.</div>
            <label className="field-label">Room code</label>
            <input
              className="field-input field-input--code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="BRSP"
              maxLength={4}
              required
            />
            <div className="landing-panel__spacer" />
            <button type="submit" className="btn btn-outline" disabled={roomCode.length < 4 || !connected}>
              Join room
            </button>
          </form>
        </div>

        <div className="ai-play">
          <button
            type="button"
            className="ai-play__btn"
            onClick={handleStartAI}
            disabled={!connected}
          >
            <span className="ai-play__glow" aria-hidden />
            <span className="ai-play__content">
              <span className="ai-play__icon" aria-hidden>🤖</span>
              <span className="ai-play__text">
                <span className="ai-play__title">Play vs AI</span>
                <span className="ai-play__desc">Instant match against a bluffing bot</span>
              </span>
              <span className="ai-play__arrow" aria-hidden>→</span>
            </span>
          </button>
        </div>

        {!connected && (
          <p className="error-msg">Server offline — start the game server and refresh.</p>
        )}

        {error && <p className="error-msg">{error}</p>}

        <SavedRoomsList
          connected={connected}
          onJoinRoom={handleJoinSaved}
          refreshKey={roomsRefresh + localRoomsRefresh}
        />

        <div className="landing-footer">YOUR ACCOUNT · PRIVATE ROOMS · SCORE HISTORY</div>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
