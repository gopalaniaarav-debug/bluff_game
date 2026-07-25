import { useEffect } from 'react';

const RULE_SECTIONS = [
  {
    title: 'Goal',
    body: [
      'Be the first player to empty your hand. Every card you play goes face-down onto the central pile — truthfully or as a bluff.',
    ],
  },
  {
    title: 'Setup',
    body: [
      '2–8 players. One standard deck is dealt evenly (two decks if more than 6 players).',
      'Whoever is dealt the Ace of Spades opens the game.',
    ],
  },
  {
    title: 'Opening — Ace of Spades',
    body: [
      'The opener must play the Ace of Spades on the first turn (extra cards may be added with it).',
      'The opening rank is always Aces.',
      'If only the Ace of Spades is played alone, it is honest and cannot be challenged — play continues to the next player.',
      'If the opener adds extra cards with the Ace, that play can be challenged like any other claim.',
    ],
  },
  {
    title: 'Playing a turn',
    body: [
      'On your turn during an active rank round, select one or more cards and play them face-down as the current rank (for example: “two Nines”).',
      'Cards may honestly match the rank, or you may bluff with cards of other ranks — or mix both.',
      'After you play, a challenge window opens for everyone else at the table.',
    ],
  },
  {
    title: 'Challenge window (Call Bluff / Pass)',
    body: [
      'Other players may Call Bluff to flip the cards you just played, or Pass to accept the play.',
      'The window closes when someone calls, or when every eligible player has passed.',
      'You cannot challenge your own play. You cannot challenge a lone opening Ace of Spades.',
      'If multiple people call at once, the challenger closest clockwise from the player who just played is resolved first.',
    ],
  },
  {
    title: 'Resolving a bluff call',
    body: [
      'If the cards match the declared rank (truthful play), the challenger picks up the entire central pile.',
      'If any card does not match (a lie), the player who played picks up the entire central pile.',
      'The rank round then ends. The player who did not pick up the pile chooses the next rank and plays first.',
    ],
  },
  {
    title: 'Skipping',
    body: [
      'During an active rank round, you may Skip instead of playing.',
      'If every player at the table skips in a row, the rank ends. The player who played the last card chooses the next rank and starts that round.',
    ],
  },
  {
    title: 'Starting a new rank',
    body: [
      'When a rank ends (after a bluff or after everyone skips), the designated starter picks any rank (A, 2–10, J, Q, or K) and plays one or more cards claiming that rank.',
      'That claim can be honest or a bluff, and it can be challenged.',
    ],
  },
  {
    title: 'Winning',
    body: [
      'The first player to play their last card(s) and empty their hand wins — but only after the challenge window on that play closes without a successful call against them (or if the play cannot be challenged).',
      'If a successful bluff call forces them to pick up the pile, they are not the winner yet.',
    ],
  },
  {
    title: 'Quitting & reconnecting',
    body: [
      'If you disconnect mid-game, you have a reconnect window to rejoin the same seat.',
      'With two players, quitting forfeits the game to the other player. With more players, the quitter’s cards go to the pile and the game continues.',
    ],
  },
  {
    title: 'AI mode',
    body: [
      'Play vs AI starts an instant private match against a bluffing bot using the same BRSP rules.',
      'The bot can play honestly, bluff, skip, start ranks, and call bluff — including when your claim is mathematically impossible given the cards it holds.',
    ],
  },
];

export default function AboutModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="about-overlay" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <button type="button" className="about-overlay__backdrop" onClick={onClose} aria-label="Close about" />
      <div className="about-modal">
        <header className="about-modal__header">
          <div>
            <p className="about-modal__eyebrow">BRSP Edition</p>
            <h2 id="about-title" className="about-modal__title">How to play</h2>
          </div>
          <button type="button" className="about-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="about-modal__body">
          <p className="about-modal__lead">
            Bluff is a lying card game: play cards face-down, claim a rank, and dare others to call you out.
            Empty your hand first to win.
          </p>

          {RULE_SECTIONS.map((section) => (
            <section key={section.title} className="about-section">
              <h3 className="about-section__title">{section.title}</h3>
              <ul className="about-section__list">
                {section.body.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="about-modal__footer">
          <button type="button" className="btn btn-gold" onClick={onClose}>
            Got it — let’s play
          </button>
        </footer>
      </div>
    </div>
  );
}
