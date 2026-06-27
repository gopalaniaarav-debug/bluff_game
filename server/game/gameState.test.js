import { describe, it, expect } from 'vitest';
import { createShuffledDeck, dealCards } from './deck.js';
import {
  createGameState,
  playCards,
  callBluff,
  checkWinner,
  passBluffWindow,
  registerBluffCall,
  resolveBluffCalls,
  skipTurn,
} from './gameState.js';

const PLAYERS = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Carol' },
];

const ACE_SPADES = { rank: 'A', suit: '♠', id: 'A♠' };
const ACE_HEARTS = { rank: 'A', suit: '♥', id: 'A♥' };
const KING_SPADES = { rank: 'K', suit: '♠', id: 'K♠' };

function makeStateWithHands(hands, overrides = {}) {
  return {
    players: PLAYERS.map((p, i) => ({ ...p, hand: hands[i] })),
    playerOrder: PLAYERS.map((p) => p.id),
    turnIndex: 0,
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
    ...overrides,
  };
}

describe('deck', () => {
  it('creates 52 cards for up to 6 players', () => {
    expect(createShuffledDeck(4)).toHaveLength(52);
  });

  it('creates 104 cards for more than 6 players', () => {
    expect(createShuffledDeck(7)).toHaveLength(104);
  });

  it('deals all cards evenly with extras to first players', () => {
    const deck = createShuffledDeck(3);
    const hands = dealCards(deck, 3);
    expect(hands.reduce((sum, h) => sum + h.length, 0)).toBe(52);
  });
});

describe('createGameState', () => {
  it('starts with Ace of Spades holder and opening phase', () => {
    const state = createGameState(PLAYERS);
    const openerId = state.playerOrder[state.turnIndex];
    const opener = state.players.find((p) => p.id === openerId);
    expect(opener.hand.some((c) => c.rank === 'A' && c.suit === '♠')).toBe(true);
    expect(state.phase).toBe('opening');
    expect(state.currentRank).toBe('A');
  });

  it('rejects invalid player counts', () => {
    expect(() => createGameState([{ id: 'a', name: 'A' }])).toThrow();
  });
});

describe('opening play', () => {
  it('requires Ace of Spades in opening play', () => {
    let state = makeStateWithHands([
      [ACE_SPADES, KING_SPADES],
      [{ rank: '3', suit: '♥', id: '3♥' }],
      [{ rank: '2', suit: '♦', id: '2♦' }],
    ]);
    state = playCards(state, 'p1', [0], 'A');
    expect(state.phase).toBe('playing');
    expect(state.currentRank).toBe('A');
    expect(state.playerOrder[state.turnIndex]).toBe('p2');
  });

  it('rejects opening without Ace of Spades', () => {
    const state = makeStateWithHands([
      [KING_SPADES, ACE_HEARTS],
      [{ rank: '3', suit: '♥', id: '3♥' }],
      [{ rank: '2', suit: '♦', id: '2♦' }],
    ]);
    expect(() => playCards(state, 'p1', [1], 'A')).toThrow('Ace of Spades');
  });

  it('allows bluffing extra cards after Ace of Spades', () => {
    let state = makeStateWithHands([
      [ACE_SPADES, KING_SPADES],
      [{ rank: '3', suit: '♥', id: '3♥' }, { rank: '5', suit: '♦', id: '5♦' }],
      [{ rank: '2', suit: '♦', id: '2♦' }],
    ]);
    state = playCards(state, 'p1', [0, 1], 'A');
    expect(state.phase).toBe('bluff_window');
    state = callBluff(state, 'p2');
    expect(state.lastReveal.matched).toBe(false);
    expect(state.lastReveal.pickupPlayerId).toBe('p1');
  });

  it('auto-advances when opening with only Ace of Spades (no challenge)', () => {
    let state = makeStateWithHands([
      [ACE_SPADES, KING_SPADES],
      [{ rank: '3', suit: '♥', id: '3♥' }],
      [{ rank: '2', suit: '♦', id: '2♦' }],
    ]);
    state = playCards(state, 'p1', [0], 'A');
    expect(state.phase).toBe('playing');
    expect(state.pendingPlay).toBeNull();
    expect(state.playerOrder[state.turnIndex]).toBe('p2');
  });
});

describe('rank rounds', () => {
  function afterOpening() {
    let state = makeStateWithHands([
      [ACE_SPADES, { rank: '7', suit: '♠', id: '7♠' }],
      [{ rank: '7', suit: '♥', id: '7♥' }, { rank: '5', suit: '♦', id: '5♦' }],
      [{ rank: '2', suit: '♦', id: '2♦' }],
    ], { phase: 'opening' });
    state = playCards(state, 'p1', [0], 'A');
    return state;
  }

  it('requires playing the current rank during a round', () => {
    let state = afterOpening();
    expect(state.phase).toBe('playing');
    expect(state.currentRank).toBe('A');
    expect(() => playCards(state, 'p2', [0], '7')).toThrow();
    state = playCards(state, 'p2', [0], 'A');
    expect(state.phase).toBe('bluff_window');
  });

  it('ends rank on bluff call — non-pickup player starts next rank', () => {
    let state = afterOpening();
    state = playCards(state, 'p2', [0], 'A');
    state = callBluff(state, 'p3');
    expect(state.phase).toBe('start_rank');
    expect(state.currentRank).toBeNull();
    expect(state.playerOrder[state.turnIndex]).toBe('p3');
    expect(state.lastReveal.rankEnded).toBe(true);
  });

  it('allows choosing any rank when starting a new rank', () => {
    let state = afterOpening();
    state = playCards(state, 'p2', [0], 'A');
    state = callBluff(state, 'p3');
    state = playCards(state, 'p3', [0], 'K');
    expect(state.currentRank).toBe('K');
    expect(state.phase).toBe('bluff_window');
  });

  it('last skipper chooses rank when all players skip', () => {
    let state = afterOpening();
    state = skipTurn(state, 'p2');
    state = skipTurn(state, 'p3');
    state = skipTurn(state, 'p1');
    expect(state.lastRankEndReason).toBe('all_skip');
    expect(state.currentRank).toBeNull();
    expect(state.phase).toBe('start_rank');
    expect(state.playerOrder[state.turnIndex]).toBe('p1');
  });

  it('in a 2-player game the last skipper chooses the rank', () => {
    let state = makeStateWithHands(
      [[ACE_SPADES], [{ rank: '3', suit: '♥', id: '3♥' }]],
      {
        phase: 'playing',
        currentRank: 'A',
        playerOrder: ['p1', 'p2'],
        players: [
          { id: 'p1', name: 'Alice', hand: [ACE_SPADES] },
          { id: 'p2', name: 'Bob', hand: [{ rank: '3', suit: '♥', id: '3♥' }] },
        ],
        turnIndex: 0,
      }
    );
    state = skipTurn(state, 'p1');
    state = skipTurn(state, 'p2');
    expect(state.phase).toBe('start_rank');
    expect(state.playerOrder[state.turnIndex]).toBe('p2');
  });
});

describe('callBluff', () => {
  it('challenger picks up pile when cards match declared rank', () => {
    let state = makeStateWithHands([
      [ACE_SPADES, { rank: '7', suit: '♠', id: '7♠' }],
      [{ rank: '3', suit: '♥', id: '3♥' }, { rank: '5', suit: '♦', id: '5♦' }],
      [{ rank: '2', suit: '♦', id: '2♦' }],
    ], { phase: 'playing', currentRank: '7' });
    state = playCards(state, 'p1', [1], '7');
    state = callBluff(state, 'p2');
    expect(state.lastReveal.matched).toBe(true);
    expect(state.lastReveal.pickupPlayerId).toBe('p2');
  });

  it('closest clockwise challenger wins with multiple calls', () => {
    let state = makeStateWithHands([
      [KING_SPADES, { rank: '4', suit: '♣', id: '4♣' }],
      [{ rank: '3', suit: '♥', id: '3♥' }],
      [{ rank: '2', suit: '♦', id: '2♦' }],
    ], { phase: 'playing', currentRank: '7' });
    state = playCards(state, 'p1', [0], '7');
    state = registerBluffCall(state, 'p3');
    state = registerBluffCall(state, 'p2');
    state = resolveBluffCalls(state);
    expect(state.lastReveal.challengerId).toBe('p2');
  });

  it('does not duplicate cards when the pile is picked up', () => {
    let state = makeStateWithHands([
      [
        { rank: '4', suit: '♦', id: 'c1' },
        { rank: 'K', suit: '♠', id: 'c2' },
        { rank: '3', suit: '♥', id: 'c3' },
      ],
      [{ rank: '5', suit: '♣', id: 'c4' }],
      [{ rank: '2', suit: '♦', id: 'c5' }],
    ], { phase: 'playing', currentRank: '4', centralPile: [{ rank: '9', suit: '♥', id: 'c9' }] });
    const before = state.players[0].hand.length + state.centralPile.length;
    state = playCards(state, 'p1', [0, 1], '4');
    state = callBluff(state, 'p2');
    const after = state.players[0].hand.length + state.centralPile.length;
    expect(after).toBe(before);
  });
});

describe('checkWinner', () => {
  it('does not win immediately on final play', () => {
    let state = makeStateWithHands(
      [[{ rank: '7', suit: '♠', id: '7♠' }], [{ rank: '3', suit: '♥', id: '3♥' }], [{ rank: '2', suit: '♦', id: '2♦' }]],
      { phase: 'playing', currentRank: '7' }
    );
    state = playCards(state, 'p1', [0], '7');
    expect(state.winner).toBeNull();
    expect(state.phase).toBe('bluff_window');
  });

  it('confirms winner after challenge window passes', () => {
    let state = makeStateWithHands(
      [[{ rank: '7', suit: '♠', id: '7♠' }], [{ rank: '3', suit: '♥', id: '3♥' }], [{ rank: '2', suit: '♦', id: '2♦' }]],
      { phase: 'playing', currentRank: '7' }
    );
    state = playCards(state, 'p1', [0], '7');
    state = passBluffWindow(state);
    expect(state.winner).toBe('p1');
  });
});
