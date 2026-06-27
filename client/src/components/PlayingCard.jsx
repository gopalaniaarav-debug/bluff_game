import { getSuitInfo } from '../gameUtils';

const SIZE_MAP = {
  xs: 26,
  sm: 64,
  md: 84,
  lg: 92,
  xl: 120,
};

export default function PlayingCard({
  card,
  rank,
  suit,
  selected = false,
  faceDown = false,
  onClick,
  size = 'lg',
  style,
  className = '',
}) {
  const w = SIZE_MAP[size] || SIZE_MAP.lg;
  const h = Math.round(w * 1.4);
  const rad = Math.max(4, w * 0.08);
  const interactive = Boolean(onClick) && !faceDown;

  const displayRank = rank ?? card?.rank ?? 'A';
  const displaySuit = suit ?? card?.suit ?? '♠';
  const suitInfo = getSuitInfo(displaySuit);

  const ring = selected
    ? '0 0 0 3px #e7b94a, 0 14px 26px rgba(0,0,0,.5)'
    : '0 5px 12px rgba(0,0,0,.34)';

  if (faceDown) {
    return (
      <div
        className={`playing-card playing-card--back ${className}`}
        style={{
          width: w,
          height: h,
          borderRadius: rad,
          boxShadow: ring,
          ...style,
        }}
        aria-hidden={!interactive}
      >
        <div className="playing-card__back-monogram" style={{ fontSize: w * 0.26 }}>
          B
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        'playing-card',
        'playing-card--face',
        interactive ? 'playing-card--interactive' : '',
        selected ? 'playing-card--selected' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: w,
        height: h,
        borderRadius: rad,
        boxShadow: ring,
        color: suitInfo.color,
        ...style,
      }}
      onClick={interactive ? onClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="playing-card__watermark" style={{ fontSize: w * 0.32 }}>
        {suitInfo.glyph}
      </div>
      <div className="playing-card__corner playing-card__corner--tl">
        <div style={{ fontSize: w * 0.17, fontWeight: 700 }}>{displayRank}</div>
        <div style={{ fontSize: w * 0.15 }}>{suitInfo.glyph}</div>
      </div>
      <div className="playing-card__corner playing-card__corner--br">
        <div style={{ fontSize: w * 0.17, fontWeight: 700 }}>{displayRank}</div>
        <div style={{ fontSize: w * 0.15 }}>{suitInfo.glyph}</div>
      </div>
      <div className="playing-card__center">
        <div style={{ fontSize: w * 0.5, lineHeight: 0.78 }}>{displayRank}</div>
        <div style={{ fontSize: w * 0.32, marginTop: '6%' }}>{suitInfo.glyph}</div>
      </div>
    </div>
  );
}
