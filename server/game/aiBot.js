import { RANKS } from './constants.js';

/**
 * AI opponent decision logic for the BRSP Bluff game.
 */

function shuffle(array) {
  const arr = [...array];
  for (let i = 0; i < arr.length - 1; i++) {
    const j = i + 1 + Math.floor(Math.random() * (arr.length - 1 - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function indexesOfRank(hand, rank) {
  const out = [];
  hand.forEach((card, i) => {
    if (card.rank === rank) out.push(i);
  });
  return out;
}

function allIndexes(hand) {
  return hand.map((_, i) => i);
}

function randomRank() {
  return RANKS[Math.floor(Math.random() * RANKS.length)];
}

function randomHeldRank(hand) {
  const ranks = [...new Set(hand.map((c) => c.rank))];
  return ranks.length ? ranks[Math.floor(Math.random() * ranks.length)] : randomRank();
}

/** Tracks how the AI picks new ranks — varied patterns, not predictable. */
export function createRankMemory() {
  return {
    mode: null,
    streak: 0,
    lastRank: null,
    recentRanks: [],
  };
}

const RANK_MODES = ['repeat', 'sequence', 'burst'];

function nextRankMode(memory) {
  const { mode, streak, lastRank } = memory;
  if (mode === 'repeat' && streak >= 3) return null;
  if (mode === 'sequence' && streak >= 4) return null;
  if (mode === 'burst' && lastRank && streak >= 2) return null;
  return mode;
}

/**
 * Pick a rank for start_rank using rotating random patterns:
 *  - repeat: same rank up to 3 times in a row
 *  - sequence: different rank each pick, up to 4 in a row
 *  - burst: may repeat a rank but max 2 in a row
 */
function pickRankForStart(memory, hand) {
  let mode = nextRankMode(memory);
  let streak = mode ? memory.streak : 0;

  if (!mode) {
    mode = RANK_MODES[Math.floor(Math.random() * RANK_MODES.length)];
    streak = 0;
  }

  const { lastRank, recentRanks } = memory;
  let rank;

  if (mode === 'repeat') {
    if (lastRank && streak > 0 && streak < 3 && Math.random() < 0.72) {
      rank = lastRank;
    } else {
      rank = randomHeldRank(hand);
    }
  } else if (mode === 'sequence') {
    const avoid = new Set(recentRanks.slice(-4));
    const pool = RANKS.filter((r) => !avoid.has(r));
    rank = pool.length ? pool[Math.floor(Math.random() * pool.length)] : randomRank();
  } else {
    if (lastRank && streak === 1 && Math.random() < 0.5) {
      rank = lastRank;
    } else if (lastRank && streak >= 2) {
      const pool = RANKS.filter((r) => r !== lastRank);
      rank = pool[Math.floor(Math.random() * pool.length)];
    } else {
      rank = Math.random() < 0.55 ? randomHeldRank(hand) : randomRank();
    }
  }

  const continued = rank === lastRank;
  return {
    rank,
    memory: {
      mode,
      streak: continued ? streak + 1 : 1,
      lastRank: rank,
      recentRanks: [...recentRanks, rank].slice(-6),
    },
  };
}

/** Opening play: the AI holds the Ace of Spades. Play it alone — honest, no bluff. */
export function decideOpening(hand) {
  const aceIdx = hand.findIndex((c) => c.rank === 'A' && c.suit === '♠');
  if (aceIdx === -1) {
    return { cardIndexes: [0], declaredRank: 'A' };
  }
  return { cardIndexes: [aceIdx], declaredRank: 'A' };
}

/** Starting a new rank with varied rank-pick patterns. */
export function decideStartRank(hand, rankMemory = createRankMemory()) {
  if (hand.length === 0) {
    return { cardIndexes: [], declaredRank: 'A', rankMemory };
  }

  const { rank, memory } = pickRankForStart(rankMemory, hand);
  const matching = indexesOfRank(hand, rank);

  if (matching.length > 0 && Math.random() < 0.62) {
    const count = 1 + Math.floor(Math.random() * matching.length);
    return { cardIndexes: matching.slice(0, count), declaredRank: rank, rankMemory: memory };
  }

  const pool = shuffle(allIndexes(hand));
  const count = Math.min(pool.length, 1 + Math.floor(Math.random() * 2));
  return { cardIndexes: pool.slice(0, count), declaredRank: rank, rankMemory: memory };
}

/** During an active rank round: play matching cards, bluff, or skip. */
export function decidePlaying(hand, currentRank) {
  const matching = indexesOfRank(hand, currentRank);

  if (matching.length > 0) {
    const honestCount = 1 + Math.floor(Math.random() * matching.length);
    let cardIndexes = matching.slice(0, honestCount);

    if (Math.random() < 0.22) {
      const nonMatching = allIndexes(hand).filter((i) => !matching.includes(i));
      if (nonMatching.length > 0) {
        cardIndexes = [...cardIndexes, nonMatching[Math.floor(Math.random() * nonMatching.length)]];
      }
    }
    return { action: 'play', cardIndexes, declaredRank: currentRank };
  }

  if (Math.random() < 0.48) {
    return { action: 'skip' };
  }

  const pool = shuffle(allIndexes(hand));
  const count = Math.min(pool.length, 1 + Math.floor(Math.random() * 2));
  return { action: 'play', cardIndexes: pool.slice(0, count), declaredRank: currentRank };
}

export function maxHonestClaim(opponentHandSizeBeforePlay, declaredRank, aiHand, deckCount = 1) {
  const totalOfRank = 4 * deckCount;
  const aiHas = indexesOfRank(aiHand, declaredRank).length;
  const existOutsideAI = Math.max(0, totalOfRank - aiHas);
  return Math.min(opponentHandSizeBeforePlay, existOutsideAI);
}

/**
 * Decide whether to challenge. Only auto-calls on mathematically impossible claims.
 * Otherwise uses random chance so honest plays usually get through.
 */
export function decideChallenge({
  declaredRank,
  claimedCount,
  aiHand,
  opponentHandSizeBeforePlay,
  challengeAllowed,
  deckCount = 1,
}) {
  if (!challengeAllowed || claimedCount <= 0) return false;

  const maxHonest = maxHonestClaim(
    opponentHandSizeBeforePlay,
    declaredRank,
    aiHand,
    deckCount
  );

  if (claimedCount > maxHonest) return true;

  const aiHas = indexesOfRank(aiHand, declaredRank).length;
  const existOutsideAI = Math.max(0, 4 * deckCount - aiHas);

  let chance = 0.14 + Math.random() * 0.2;

  if (claimedCount >= 2) chance += 0.06;
  if (claimedCount >= 3) chance += 0.08;
  if (aiHas >= 3) chance += 0.07;
  if (existOutsideAI <= 1) chance += 0.05;

  chance = Math.min(chance, 0.42);

  return Math.random() < chance;
}
