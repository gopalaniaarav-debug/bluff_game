import ScoresPanel from './ScoresPanel';
import { getPlayerColor } from '../gameUtils';

export default function Lobby({
  roomCode,
  players,
  hostId,
  playerId,
  playerName,
  playerColors,
  scoresRefresh,
  onStart,
}) {
  const isHost = hostId === playerId;
  const canStart = players.length >= 2;
  const yourName = playerName || players.find((p) => p.id === playerId)?.name || '';
  const slots = Array.from({ length: 8 }, (_, i) => {
    const p = players[i];
    if (!p) return { empty: true };
    return {
      empty: false,
      ...p,
      color: playerColors[p.id] || getPlayerColor(p.id, i),
      isYou: p.id === playerId,
    };
  });

  const copyCode = () => navigator.clipboard?.writeText(roomCode);

  return (
    <div className="screen screen--lobby">
      <div className="lobby-wrap">
        <div className="lobby-header">
          <div>
            <div className="lobby-eyebrow">Room code · share to invite</div>
            <button type="button" className="lobby-code-block" onClick={copyCode}>
              <span className="lobby-code-block__code">{roomCode}</span>
              <span className="lobby-code-block__hint">
                tap to
                <br />
                copy link
              </span>
            </button>
          </div>
          <div className="lobby-header__right">
            <div className="lobby-header__title">The Lobby</div>
            <div className="lobby-header__sub">{players.length} of 8 seated</div>
          </div>
        </div>

        {!canStart && (
          <div className="lobby-banner">
            <span className="lobby-banner__dot" />
            <span>
              Waiting for at least one more player — you need <strong>2</strong> to deal. Share the code above.
            </span>
          </div>
        )}

        <div className="lobby-grid">
          {slots.map((slot, i) =>
            slot.empty ? (
              <div key={`empty-${i}`} className="lobby-slot lobby-slot--empty">
                <div className="lobby-slot__empty-avatar">+</div>
                <div className="lobby-slot__empty-label">Open seat</div>
              </div>
            ) : (
              <div key={slot.id} className={`lobby-slot ${slot.isYou ? 'lobby-slot--you' : ''}`}>
                <div className="lobby-slot__avatar-wrap">
                  <div className="lobby-slot__avatar" style={{ background: slot.color }}>
                    {slot.name.charAt(0).toUpperCase()}
                  </div>
                  {slot.isHost && <span className="lobby-slot__host">HOST</span>}
                </div>
                <div className="lobby-slot__name">
                  {slot.name}
                  {slot.isYou ? ' (you)' : ''}
                </div>
                <div className="lobby-slot__status lobby-slot__status--ready">ready</div>
              </div>
            )
          )}
        </div>

        <div className="lobby-actions">
          {isHost ? (
            <button
              type="button"
              className="btn btn-gold btn-gold--lg"
              disabled={!canStart}
              onClick={onStart}
            >
              {canStart ? 'Deal · start game →' : 'Need 2 players to start'}
            </button>
          ) : (
            <div className="lobby-waiting">
              <div className="lobby-waiting__dots">
                <span /><span /><span />
              </div>
              <span>Waiting for host to start the game</span>
            </div>
          )}
        </div>

        <ScoresPanel
          playerName={yourName}
          roomCode={roomCode}
          refreshKey={scoresRefresh}
          className="scores-panel--lobby"
        />
      </div>
    </div>
  );
}
