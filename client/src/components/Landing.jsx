import { useState } from 'react';
import PlayingCard from './PlayingCard';
import { PLAYER_COLORS } from '../gameUtils';
import SavedRoomsList from './SavedRoomsList';

export default function Landing({ onCreate, onJoin, error, connected, roomsRefresh }) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [colorIdx, setColorIdx] = useState(0);
  const [localRoomsRefresh, setLocalRoomsRefresh] = useState(0);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (name.trim()) {
      await onCreate(name.trim(), PLAYER_COLORS[colorIdx]);
      setLocalRoomsRefresh((k) => k + 1);
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (name.trim() && roomCode.trim()) {
      onJoin(name.trim(), roomCode.trim().toUpperCase(), PLAYER_COLORS[colorIdx]);
    }
  };

  const handleJoinSaved = (code) => {
    if (name.trim()) {
      onJoin(name.trim(), code, PLAYER_COLORS[colorIdx]);
    }
  };

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
          Read the table. Bury the lie. Call it when you smell one.{' '}
          <span className="landing-tagline__accent">2–8 players, one room code.</span>
        </p>

        <div className="landing-name-row">
          <label className="field-label">Your name</label>
          <input
            className="field-input landing-name-row__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={14}
            placeholder="Enter your display name"
          />
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
            <div className="landing-panel__desc">Spin up a private room and share the code. You deal.</div>
            <button type="submit" className="btn btn-gold" disabled={!name.trim() || !connected}>
              Create room →
            </button>
          </form>

          <form className="landing-panel landing-panel--join" onSubmit={handleJoin}>
            <div className="landing-panel__title">Join a table</div>
            <div className="landing-panel__desc">Got a 4-letter code from a friend? Drop in.</div>
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
            <button type="submit" className="btn btn-outline" disabled={!name.trim() || roomCode.length < 4 || !connected}>
              Join room
            </button>
          </form>
        </div>

        {!connected && (
          <p className="error-msg">Server offline — start the game server and refresh. For ngrok, tunnel port 5173 with the Vite dev server running.</p>
        )}

        {error && <p className="error-msg">{error}</p>}

        <SavedRoomsList
          playerName={name}
          connected={connected}
          onJoinRoom={handleJoinSaved}
          refreshKey={roomsRefresh + localRoomsRefresh}
        />

        <div className="landing-footer">NO APP · NO ACCOUNT · WORKS ON ANY PHONE BROWSER</div>
      </div>
    </div>
  );
}
