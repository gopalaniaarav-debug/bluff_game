import { useEffect, useState } from 'react';
import { getServerUrl } from '../socket';

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ScoresPanel({ playerName, roomCode, refreshKey = 0, className = '' }) {
  const [scores, setScores] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const name = playerName?.trim();
    const room = roomCode?.trim().toUpperCase();
    if (!name || !room) {
      setScores(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({ player: name, room });
    fetch(`${getServerUrl()}/api/scores?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setScores(data);
      })
      .catch(() => {
        if (!cancelled) setScores({ myWins: [], opponentWins: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playerName, roomCode, refreshKey]);

  if (!playerName?.trim() || !roomCode?.trim()) return null;

  return (
    <div className={`scores-panel ${className}`.trim()}>
      <div className="scores-panel__title">Score history · {roomCode.toUpperCase()}</div>

      {loading && !scores && <p className="scores-panel__empty">Loading scores…</p>}

      {scores && (
        <div className="scores-panel__grid">
          <div className="scores-panel__col">
            <h3 className="scores-panel__heading">Your wins</h3>
            {scores.myWins?.length ? (
              <ul className="scores-panel__list">
                {scores.myWins.map((s) => (
                  <li key={s.id} className="scores-panel__item scores-panel__item--win">
                    <span className="scores-panel__moves">{s.moveCount} moves</span>
                    <span className="scores-panel__meta">{formatDate(s.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="scores-panel__empty">No wins yet</p>
            )}
          </div>

          <div className="scores-panel__col">
            <h3 className="scores-panel__heading">Opponent wins</h3>
            {scores.opponentWins?.length ? (
              <ul className="scores-panel__list">
                {scores.opponentWins.map((s) => (
                  <li key={s.id} className="scores-panel__item scores-panel__item--loss">
                    <span className="scores-panel__moves">
                      {s.winnerName} · {s.moveCount} moves
                    </span>
                    <span className="scores-panel__meta">{formatDate(s.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="scores-panel__empty">No losses recorded</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
