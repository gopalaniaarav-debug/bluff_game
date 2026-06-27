import { createShuffledDeck, dealCards } from './deck.js';
import { RANKS, isValidRank } from './constants.js';

function findAceOfSpadesHolderIndex(players) {
  for (let i = 0; i < players.length; i++) {
    if (players[i].hand.some((c) => c.rank === 'A' && c.suit === '♠')) {
      return i;
    }
  }
  throw new Error('No player holds Ace of Spades');
}

function getCurrentPlayerId(state) {
  return state.playerOrder[state.turnIndex];
}

function advanceTurn(state) {
  state.turnIndex = (state.turnIndex + 1) % state.playerOrder.length;
}

function cardsMatchDeclaredRank(cards, declaredRank) {
  return cards.every((card) => card.rank === declaredRank);
}

function getClockwiseDistance(fromPlayerId, toPlayerId, playerOrder) {
  const fromIdx = playerOrder.indexOf(fromPlayerId);
  const toIdx = playerOrder.indexOf(toPlayerId);
  if (fromIdx === -1 || toIdx === -1) return Infinity;
  return (toIdx - fromIdx + playerOrder.length) % playerOrder.length;
}

export function createGameState(players) {
  if (players.length < 2 || players.length > 8) {
    throw new Error('Game requires 2-8 players');
  }

  const deck = createShuffledDeck(players.length);
  const hands = dealCards(deck, players.length);

  const gamePlayers = players.map((player, index) => ({
    id: player.id,
    name: player.name,
    hand: hands[index],
  }));

  const playerOrder = gamePlayers.map((p) => p.id);
  const openerIndex = findAceOfSpadesHolderIndex(gamePlayers);

  return {
    players: gamePlayers,
    playerOrder,
    turnIndex: openerIndex,
    centralPile: [],
    currentRank: 'A',
    lastDeclaredRank: null,
    phase: 'opening',
    pendingPlay: null,
    bluffCalls: [],
    consecutiveSkips: 0,
    winner: null,
    lastReveal: null,
    lastRankEndReason: null,
    lastRandomRank: null,
  };
}

function resolveBluff(state) {
  const { pendingPlay, bluffCalls, playerOrder } = state;
  if (!pendingPlay || bluffCalls.length === 0) {
    throw new Error('No bluff to resolve');
  }

  const sortedCalls = [...bluffCalls].sort(
    (a, b) =>
      getClockwiseDistance(pendingPlay.playerId, a.challengerId, playerOrder) -
      getClockwiseDistance(pendingPlay.playerId, b.challengerId, playerOrder)
  );

  const winningCall = sortedCalls[0];
  const lateCalls = sortedCalls.slice(1).map((c) => c.challengerId);
  const matched = cardsMatchDeclaredRank(pendingPlay.cards, pendingPlay.declaredRank);

  let pickupPlayerId;
  if (matched) {
    pickupPlayerId = winningCall.challengerId;
  } else {
    pickupPlayerId = pendingPlay.playerId;
  }

  const pickupPlayer = state.players.find((p) => p.id === pickupPlayerId);
  const pileSize = state.centralPile.length;
  pickupPlayer.hand.push(...state.centralPile);

  const nonPickupPlayerId =
    pickupPlayerId === pendingPlay.playerId
      ? winningCall.challengerId
      : pendingPlay.playerId;

  state.lastReveal = {
    cards: pendingPlay.cards,
    declaredRank: pendingPlay.declaredRank,
    playerId: pendingPlay.playerId,
    challengerId: winningCall.challengerId,
    matched,
    pickupPlayerId,
    pileSize,
    lateChallengers: lateCalls,
    rankEnded: true,
    nextRankStarterId: nonPickupPlayerId,
  };

  state.centralPile = [];
  state.pendingPlay = null;
  state.bluffCalls = [];
  state.consecutiveSkips = 0;
  state.lastRankEndReason = 'bluff';
  state.currentRank = null;
  state.lastDeclaredRank = null;
  state.turnIndex = playerOrder.indexOf(nonPickupPlayerId);
  state.phase = 'start_rank';

  const winner = checkWinner(state);
  if (winner) {
    state.winner = winner;
    state.phase = 'playing';
  }

  return state;
}

function validatePlayCards(state, playerId, cardIndexes) {
  if (state.winner) throw new Error('Game is already over');
  if (state.phase === 'bluff_window') throw new Error('Waiting for bluff calls');

  const allowedPhases = ['opening', 'playing', 'start_rank'];
  if (!allowedPhases.includes(state.phase)) {
    throw new Error('Cannot play right now');
  }

  const currentPlayerId = getCurrentPlayerId(state);
  if (playerId !== currentPlayerId) throw new Error('Not your turn');

  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('Player not found');

  if (!cardIndexes || cardIndexes.length === 0) {
    throw new Error('Must play at least one card');
  }

  const uniqueIndexes = [...new Set(cardIndexes)];
  if (uniqueIndexes.length !== cardIndexes.length) {
    throw new Error('Duplicate card indexes');
  }

  for (const idx of cardIndexes) {
    if (idx < 0 || idx >= player.hand.length || !Number.isInteger(idx)) {
      throw new Error('Invalid card index');
    }
  }

  return player;
}

function validateDeclaredRank(state, declaredRank) {
  if (!isValidRank(declaredRank)) throw new Error('Invalid rank');

  if (state.phase === 'opening') {
    if (declaredRank !== 'A') throw new Error('Opening rank must be Ace');
    return;
  }

  if (state.phase === 'start_rank') {
    return;
  }

  if (state.phase === 'playing') {
    if (!state.currentRank) throw new Error('No active rank');
    if (declaredRank !== state.currentRank) {
      throw new Error(`Must play as ${state.currentRank} during this rank round`);
    }
  }
}

function validateOpeningAce(player, cardIndexes) {
  const aceIdx = player.hand.findIndex((c) => c.rank === 'A' && c.suit === '♠');
  if (aceIdx === -1) throw new Error('You must hold Ace of Spades to open');
  if (!cardIndexes.includes(aceIdx)) {
    throw new Error('Opening play must include Ace of Spades');
  }
}

export function playCards(gameState, playerId, cardIndexes, declaredRank) {
  const state = structuredClone(gameState);
  const player = validatePlayCards(state, playerId, cardIndexes);
  validateDeclaredRank(state, declaredRank);

  if (state.phase === 'opening') {
    validateOpeningAce(player, cardIndexes);
  }

  const priorPhase = state.phase;

  const playedCards = cardIndexes
    .sort((a, b) => b - a)
    .map((idx) => player.hand.splice(idx, 1)[0]);

  state.centralPile.push(...playedCards);
  state.lastDeclaredRank = declaredRank;
  state.pendingPlay = {
    playerId,
    cards: playedCards,
    declaredRank,
    isOpeningPlay: priorPhase === 'opening',
  };
  state.bluffCalls = [];
  state.consecutiveSkips = 0;

  if (priorPhase === 'start_rank') {
    state.currentRank = declaredRank;
  }

  // Opening with only the Ace of Spades — honest, no challenge window
  if (priorPhase === 'opening' && playedCards.length === 1) {
    state.pendingPlay = null;
    state.phase = 'playing';
    state.lastRankEndReason = null;
    const winner = checkWinner(state);
    if (winner) {
      state.winner = winner;
      return state;
    }
    advanceTurn(state);
    return state;
  }

  state.phase = 'bluff_window';

  return state;
}

export function skipTurn(gameState, playerId) {
  const state = structuredClone(gameState);

  if (state.winner) throw new Error('Game is already over');
  if (state.phase !== 'playing') {
    throw new Error('Can only skip during an active rank round');
  }
  if (!state.currentRank) throw new Error('No active rank');

  const currentPlayerId = getCurrentPlayerId(state);
  if (playerId !== currentPlayerId) throw new Error('Not your turn');

  state.consecutiveSkips += 1;

  if (state.consecutiveSkips >= state.playerOrder.length) {
    state.lastRankEndReason = 'all_skip';
    state.currentRank = null;
    state.consecutiveSkips = 0;
    state.phase = 'start_rank';
    state.turnIndex = state.playerOrder.indexOf(playerId);
    return state;
  }

  advanceTurn(state);
  return state;
}

export function registerBluffCall(gameState, challengerId) {
  const state = structuredClone(gameState);

  if (state.winner) throw new Error('Game is already over');
  if (state.phase !== 'bluff_window' || !state.pendingPlay) {
    throw new Error('No play to challenge');
  }
  if (state.pendingPlay.isOpeningPlay && state.pendingPlay.cards.length === 1) {
    throw new Error('Cannot challenge the opening Ace of Spades');
  }
  if (challengerId === state.pendingPlay.playerId) {
    throw new Error('Cannot challenge your own play');
  }
  if (state.bluffCalls.some((c) => c.challengerId === challengerId)) {
    throw new Error('Already called bluff');
  }

  state.bluffCalls.push({ challengerId, timestamp: Date.now() });
  return state;
}

export function resolveBluffCalls(gameState) {
  const state = structuredClone(gameState);
  if (state.bluffCalls.length === 0) {
    throw new Error('No bluff calls to resolve');
  }
  return resolveBluff(state);
}

export function callBluff(gameState, challengerId) {
  return resolveBluffCalls(registerBluffCall(gameState, challengerId));
}

export function passBluffWindow(gameState) {
  const state = structuredClone(gameState);

  if (state.phase !== 'bluff_window' || !state.pendingPlay) {
    throw new Error('No pending play');
  }

  state.pendingPlay = null;
  state.bluffCalls = [];
  state.phase = 'playing';
  state.lastRankEndReason = null;

  const winner = checkWinner(state);
  if (winner) {
    state.winner = winner;
    return state;
  }

  advanceTurn(state);
  return state;
}

export function checkWinner(gameState) {
  const emptyHand = gameState.players.find((p) => p.hand.length === 0);
  return emptyHand ? emptyHand.id : null;
}

export function getSharedState(gameState) {
  const pending = gameState.pendingPlay;
  const challengeAllowed = pending
    ? !(pending.isOpeningPlay && pending.cards.length === 1)
    : false;

  return {
    playerOrder: gameState.playerOrder,
    turnIndex: gameState.turnIndex,
    centralPileCount: gameState.centralPile.length,
    currentRank: gameState.currentRank,
    lastDeclaredRank: gameState.lastDeclaredRank,
    phase: gameState.phase,
    pendingPlayPlayerId: pending?.playerId ?? null,
    challengeAllowed,
    consecutiveSkips: gameState.consecutiveSkips,
    lastRankEndReason: gameState.lastRankEndReason,
    lastRandomRank: gameState.lastRandomRank,
    players: gameState.players.map((p) => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length,
    })),
    winner: gameState.winner,
    lastReveal: gameState.lastReveal,
  };
}

export function getPlayerHand(gameState, playerId) {
  const player = gameState.players.find((p) => p.id === playerId);
  return player ? [...player.hand] : [];
}
