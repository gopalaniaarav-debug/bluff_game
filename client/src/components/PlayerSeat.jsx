import PlayingCard from './PlayingCard';

export default function PlayerSeat({
  player,
  color,
  isActive,
  isPending,
  tag,
  position,
}) {
  return (
    <div
      className={[
        'player-seat',
        isActive ? 'player-seat--active' : '',
        isPending ? 'player-seat--pending' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={position}
    >
      {tag && <div className="player-seat__tag">{tag}</div>}
      <div className="player-seat__row">
        <div
          className="player-seat__avatar"
          style={{
            background: color,
            boxShadow: isActive
              ? '0 0 0 4px rgba(231,185,74,.8), 0 0 26px rgba(231,185,74,.7)'
              : '0 4px 12px rgba(0,0,0,.4)',
          }}
        >
          {player.name.charAt(0).toUpperCase()}
        </div>
        <div className="player-seat__mini-pile">
          <div style={{ transform: 'rotate(-9deg)' }}>
            <PlayingCard faceDown size="xs" />
          </div>
          <div style={{ position: 'absolute', left: 5, top: -1, transform: 'rotate(7deg)' }}>
            <PlayingCard faceDown size="xs" />
          </div>
          <span className="player-seat__count">{player.cardCount}</span>
        </div>
      </div>
      <div className="player-seat__name">{player.name}</div>
    </div>
  );
}
