import { useEffect, useState } from 'react';
import PlayingCard from './PlayingCard';
import { RANK_NAMES } from '../gameUtils';

export default function BluffRevealModal({ reveal, players, onClose }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, [reveal]);

  if (!reveal) return null;

  const playerName = players.find((p) => p.id === reveal.playerId)?.name ?? 'Player';
  const challengerName = players.find((p) => p.id === reveal.challengerId)?.name ?? 'Challenger';
  const pickupName = players.find((p) => p.id === reveal.pickupPlayerId)?.name ?? 'Someone';
  const claimName = RANK_NAMES[reveal.declaredRank] || reveal.declaredRank;
  const isLie = !reveal.matched;

  return (
    <div className="reveal-screen">
      {mounted && (
        <div className="reveal-content">
          <div className="reveal-intro reveal-anim-drop">
            <div className="reveal-intro__eyebrow">
              {challengerName} called bluff on {playerName}
            </div>
            <div className="reveal-intro__title">
              Claim was &ldquo;{claimName}&rdquo; — let&apos;s see…
            </div>
          </div>

          <div className="reveal-cards-row">
            {reveal.cards.map((card, i) => (
              <div
                key={i}
                className="reveal-flip"
                style={{ animationDelay: `${0.55 + i * 0.24}s` }}
              >
                <PlayingCard card={card} size="xl" />
              </div>
            ))}
          </div>

          <div className="reveal-stamp reveal-anim-stamp">
            <div
              className={`reveal-stamp__text reveal-stamp__text--${isLie ? 'lie' : 'truth'}`}
            >
              {isLie ? 'Bluff!' : 'Honest'}
            </div>
            <p className="reveal-stamp__sub">
              {isLie
                ? `${playerName} was lying — `
                : `${playerName} told the truth — `}
              <strong>{pickupName}</strong> picks up the pile ({reveal.pileSize} cards).
            </p>
          </div>

          <button type="button" className="btn btn-outline reveal-continue reveal-anim-fade" onClick={onClose}>
            Continue →
          </button>
        </div>
      )}
    </div>
  );
}
