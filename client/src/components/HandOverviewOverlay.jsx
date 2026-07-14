import { useEffect } from 'react';
import PlayingCard from './PlayingCard';

/**
 * Full-screen hand viewer: cards laid out in a clear wrapping grid
 * so large hands (iPad / desktop / phone) stay readable and selectable.
 */
export default function HandOverviewOverlay({
  open,
  cards,
  selectedCards,
  onToggleCard,
  disabled,
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const selectedCount = selectedCards.length;

  return (
    <div className="hand-overview" role="dialog" aria-modal="true" aria-label="All cards in hand">
      <button
        type="button"
        className="hand-overview__backdrop"
        onClick={onClose}
        aria-label="Close card overview"
      />

      <div className="hand-overview__panel">
        <header className="hand-overview__header">
          <div>
            <h2 className="hand-overview__title">Your hand</h2>
            <p className="hand-overview__sub">
              {cards.length} card{cards.length === 1 ? '' : 's'}
              {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
              {disabled ? ' · wait for your turn to select' : ' · tap to select'}
            </p>
          </div>
          <button type="button" className="btn btn-gold btn-sm" onClick={onClose}>
            Done
          </button>
        </header>

        <div className="hand-overview__grid">
          {cards.map((card, i) => {
            const sel = selectedCards.includes(i);
            return (
              <button
                key={card.id}
                type="button"
                className={`hand-overview__cell ${sel ? 'hand-overview__cell--selected' : ''}`}
                disabled={disabled}
                onClick={() => onToggleCard(i)}
                aria-pressed={sel}
                aria-label={`${card.rank} of ${card.suit}${sel ? ', selected' : ''}`}
              >
                <PlayingCard
                  card={card}
                  selected={sel}
                  size="md"
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
