export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['♠', '♥', '♦', '♣'];

export const ACE_OF_SPADES = { rank: 'A', suit: '♠' };

export function isValidRank(rank) {
  return RANKS.includes(rank);
}

/** Pick a random rank (not sequential — any rank except optionally the current one). */
export function pickRandomRank(excludeRank = null, rng = Math.random) {
  const choices = excludeRank ? RANKS.filter((r) => r !== excludeRank) : [...RANKS];
  return choices[Math.floor(rng() * choices.length)];
}
