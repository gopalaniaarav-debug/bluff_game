import { RANKS, SUITS } from './constants.js';

let nextCardId = 0;

function createSingleDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, id: `c${nextCardId++}` });
    }
  }
  return deck;
}

function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function createShuffledDeck(numPlayers) {
  const numDecks = numPlayers > 6 ? 2 : 1;
  let deck = [];
  for (let i = 0; i < numDecks; i++) {
    deck = deck.concat(createSingleDeck());
  }
  return shuffle(deck);
}

export function dealCards(deck, numPlayers) {
  const hands = Array.from({ length: numPlayers }, () => []);
  deck.forEach((card, index) => {
    hands[index % numPlayers].push(card);
  });
  return hands;
}

/** Reset counter between tests */
export function resetCardIdCounter() {
  nextCardId = 0;
}
