import { useMemo, useRef, useState, useEffect } from 'react';
import PlayingCard from './PlayingCard';
import { computeHandSpread } from '../handLayout';

export default function CardHand({ cards, selectedCards, onToggleCard, disabled, compact = false }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const measure = () => setWidth(el.clientWidth);
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const baseCardWidth = compact ? 64 : 92;
  const { cardWidth, slots } = useMemo(
    () => computeHandSpread(cards.length, width, baseCardWidth),
    [cards.length, width, baseCardWidth]
  );
  const cardHeight = Math.round(cardWidth * 1.4);

  return (
    <div className="card-hand" ref={containerRef}>
      <div className="card-hand__spread" style={{ width: '100%', height: cardHeight + 28 }}>
        {cards.map((card, i) => {
          const slot = slots[i] ?? { left: 0, angle: 0, lift: 0 };
          const sel = selectedCards.includes(i);
          const ty = slot.lift - (sel ? 18 : 0);

          return (
            <div
              key={card.id}
              className="card-hand__slot"
              style={{
                left: slot.left,
                transform: `rotate(${slot.angle}deg) translateY(${ty}px)`,
                zIndex: sel ? 100 + i : i + 1,
              }}
            >
              <PlayingCard
                card={card}
                selected={sel}
                size={compact ? 'sm' : 'lg'}
                style={{ width: cardWidth, height: cardHeight }}
                onClick={disabled ? undefined : () => onToggleCard(i)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
