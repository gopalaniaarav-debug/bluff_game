export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const RANK_NAMES = {
  A: 'Aces',
  2: 'Twos',
  3: 'Threes',
  4: 'Fours',
  5: 'Fives',
  6: 'Sixes',
  7: 'Sevens',
  8: 'Eights',
  9: 'Nines',
  10: 'Tens',
  J: 'Jacks',
  Q: 'Queens',
  K: 'Kings',
};

export const PLAYER_COLORS = [
  '#e7b94a',
  '#4aa3e0',
  '#e0503e',
  '#5bbf7a',
  '#b57ce0',
  '#e08a3e',
];

export const SUIT_INFO = {
  '♠': { glyph: '♠', color: '#28323a' },
  '♥': { glyph: '♥', color: '#d8453a' },
  '♦': { glyph: '♦', color: '#2f6fd0' },
  '♣': { glyph: '♣', color: '#1f8a5b' },
  S: { glyph: '♠', color: '#28323a' },
  H: { glyph: '♥', color: '#d8453a' },
  D: { glyph: '♦', color: '#2f6fd0' },
  C: { glyph: '♣', color: '#1f8a5b' },
};

/** Seat positions for opponents around the oval (design spec) */
export const OPPONENT_SEATS = [
  { top: '11%', left: '50%' },
  { top: '24%', left: '15%' },
  { top: '24%', left: '85%' },
  { top: '56%', left: '7%' },
  { top: '56%', left: '93%' },
  { top: '72%', left: '18%' },
  { top: '72%', left: '82%' },
];

export function nextRank(rank) {
  const idx = RANKS.indexOf(rank);
  return RANKS[(idx + 1) % RANKS.length];
}

export function getSuitInfo(suit) {
  return SUIT_INFO[suit] || SUIT_INFO['♠'];
}

export function getPlayerColor(playerId, index = 0) {
  let hash = 0;
  const str = playerId || String(index);
  for (let i = 0; i < str.length; i++) hash = (hash + str.charCodeAt(i) * (i + 1)) % PLAYER_COLORS.length;
  return PLAYER_COLORS[hash];
}

export function getSeatStyle(index, total) {
  const seat = OPPONENT_SEATS[index % OPPONENT_SEATS.length];
  return {
    top: seat.top,
    left: seat.left,
    transform: 'translate(-50%, -50%)',
  };
}

export function getTurnHaloStyle(seatIndex) {
  const seat = OPPONENT_SEATS[seatIndex % OPPONENT_SEATS.length];
  return {
    top: seat.top,
    left: seat.left,
    transform: 'translate(-50%, -50%)',
  };
}
