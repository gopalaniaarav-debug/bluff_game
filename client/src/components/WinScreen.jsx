import { getPlayerColor } from '../gameUtils';

const CONFETTI_COLORS = ['#e7b94a', '#e0503e', '#4aa3e0', '#5bbf7a', '#b57ce0', '#f3ead4'];

export default function WinScreen({ winnerName, moveCount, players, playerColors, isHost, onPlayAgain }) {
  const confetti = Array.from({ length: 42 }, (_, i) => ({
    left: (i * 2399) % 100,
    dur: 2.6 + (i % 5) * 0.5,
    delay: ((i * 7) % 30) / 10,
    size: 6 + (i % 4) * 3,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    rot: (i * 53) % 90 - 45,
  }));

  const sorted = [...players].sort((a, b) => {
    if (a.name === winnerName) return -1;
    if (b.name === winnerName) return 1;
    return (a.cardCount ?? 0) - (b.cardCount ?? 0);
  });

  const places = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
  const winnerColor = playerColors[sorted.find((p) => p.name === winnerName)?.id] || '#e7b94a';

  return (
    <div className="screen screen--win">
      {confetti.map((c, i) => (
        <div
          key={i}
          className="confetti-piece"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.size * 1.6,
            background: c.color,
            transform: `rotate(${c.rot}deg)`,
            animationDuration: `${c.dur}s`,
            animationDelay: `${c.delay}s`,
          }}
        />
      ))}

      <div className="win-content">
        <div className="win-medallion win-anim-float" style={{ background: `linear-gradient(180deg,#f0c659,#d39f31)` }}>
          {winnerName.charAt(0).toUpperCase()}
        </div>
        <div className="win-eyebrow">Last one holding nerve</div>
        <h2 className="win-title">{winnerName} wins</h2>
        <p className="win-sub">
          {moveCount != null
            ? `Victory in ${moveCount} move${moveCount === 1 ? '' : 's'}.`
            : 'Emptied their hand without getting caught. Cold.'}
        </p>

        <div className="win-standings">
          {sorted.map((p, i) => (
            <div key={p.id} className={`win-standings__row ${i === 0 ? 'win-standings__row--first' : ''}`}>
              <span className="win-standings__place">{places[i]}</span>
              <span
                className="win-standings__avatar"
                style={{ background: playerColors[p.id] || getPlayerColor(p.id, i) }}
              >
                {p.name.charAt(0)}
              </span>
              <span className="win-standings__name">{p.name}</span>
              <span className="win-standings__cards">{p.cardCount ?? 0} cards</span>
            </div>
          ))}
        </div>

        <div className="win-actions">
          {isHost ? (
            <button type="button" className="btn btn-gold" onClick={onPlayAgain}>
              Rematch
            </button>
          ) : (
            <div className="lobby-waiting">
              <div className="lobby-waiting__dots"><span /><span /><span /></div>
              <span>Waiting for host to deal another round…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
