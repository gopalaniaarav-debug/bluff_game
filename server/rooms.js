import { randomUUID } from 'crypto';
import {
  createGameState,
  getSharedState,
  getPlayerHand,
  playCards,
  registerBluffCall,
  resolveBluffCalls,
  passBluffWindow,
  skipTurn,
  removePlayerFromGame,
  forfeitWin,
} from './game/gameState.js';
import { saveGameResult } from './db/scores.js';
import { isSavedRoomCode, saveSavedRoom, getSavedRoomOwner } from './db/rooms.js';
import { recordRoomMembership } from './db/memberships.js';
import { verifySocketUser } from './auth.js';
import {
  decideOpening,
  decideStartRank,
  decidePlaying,
  decideChallenge,
  createRankMemory,
} from './game/aiBot.js';

const RECONNECT_TIMEOUT_MS = 15 * 60 * 1000;

const AI_NAMES = ['Botello', 'Sir Bluff', 'Ada Lie', 'Nova', 'Rex'];
const AI_MIN_DELAY_MS = 800;
const AI_MAX_DELAY_MS = 1700;

const rooms = new Map();

function incrementMove(room) {
  room.moveCount = (room.moveCount ?? 0) + 1;
}

function emitGameWon(io, room) {
  if (!room.gameState?.winner) return;

  const winner = room.players.find((p) => p.id === room.gameState.winner);
  if (!winner) return;

  const moveCount = room.moveCount ?? 0;
  const playerNames = room.players.map((p) => p.name);

  // AI practice games are ephemeral — don't clutter the persisted score history.
  if (!room.isAIGame) {
    saveGameResult({
      roomCode: room.code,
      winnerName: winner.name,
      moveCount,
      players: playerNames,
    });
  }

  io.to(room.code).emit('gameWon', {
    winnerId: winner.id,
    winnerName: winner.name,
    moveCount,
  });
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code) || isSavedRoomCode(code));
  return code;
}

function bootstrapRoomFromSaved(code) {
  const saved = getSavedRoomOwner(code);
  return {
    code,
    ownerUserId: saved?.owner_user_id ?? null,
    hostId: null,
    players: [],
    gameStarted: false,
    gameState: null,
    bluffPasses: null,
    chatHistory: [],
    moveCount: 0,
  };
}

function resetRoomToLobby(room) {
  room.gameStarted = false;
  room.gameState = null;
  room.bluffPasses = null;
  room.moveCount = 0;
  room.players = [];
  room.hostId = null;
  room.chatHistory = [];
}

function resetRoomIfEmpty(io, room) {
  if (room.players.length > 0) return;
  const bootstrapped = bootstrapRoomFromSaved(room.code);
  rooms.set(room.code, bootstrapped);
}

/**
 * Creator/owner is always host when present. Never promote a random joiner.
 * If the owner is offline, hostId stays null (nobody else can start/rematch).
 */
function syncRoomHost(room) {
  if (room.isAIGame) return;

  for (const p of room.players) p.isHost = false;

  if (room.ownerUserId != null) {
    const owner = room.players.find((p) => p.userId === room.ownerUserId);
    if (owner) {
      room.hostId = owner.id;
      owner.isHost = true;
    } else {
      room.hostId = null;
    }
    return;
  }

  // Legacy rooms without an owner: keep current host if still seated, else none.
  const current = room.players.find((p) => p.id === room.hostId);
  if (current) {
    current.isHost = true;
  } else {
    room.hostId = null;
  }
}

function removePlayerFromRoom(room, player) {
  if (player.reconnectTimer) {
    clearTimeout(player.reconnectTimer);
    player.reconnectTimer = null;
  }
  room.players = room.players.filter((p) => p.id !== player.id);
  syncRoomHost(room);
}

function findReconnectSlot(room, user, playerId) {
  if (playerId) {
    const byId = room.players.find((p) => p.id === playerId && p.userId === user.id);
    if (byId) return byId;
  }
  return room.players.find((p) => p.userId === user.id) ?? null;
}

function isGameInProgress(room) {
  return Boolean(room.gameStarted && room.gameState && !room.gameState.winner);
}

function finishJoin(io, socket, room, player, code, reconnected, callback) {
  attachPlayerSocket(socket, room, player, code);
  syncRoomHost(room);
  recordRoomMembership(player.userId, code);
  callback?.({ roomCode: code, playerId: player.id, reconnected });
  emitRoomUpdate(io, room);
  if (reconnected) {
    emitGameState(io, room, socket.id);
    emitChatHistory(socket, room);
    io.to(code).emit('playerReconnected', { playerId: player.id, name: player.name });
  }
}

function attachPlayerSocket(socket, room, player, code) {
  player.connected = true;
  player.socketId = socket.id;
  player.disconnectedAt = null;
  if (player.reconnectTimer) {
    clearTimeout(player.reconnectTimer);
    player.reconnectTimer = null;
  }
  socket.join(code);
  socket.data.roomCode = code;
  socket.data.playerId = player.id;
  socket.data.userId = player.userId;
}

function emitChatHistory(socket, room) {
  for (const msg of room.chatHistory) {
    socket.emit('chatMessage', msg);
  }
}

export function renameActiveRoom(io, oldCode, newCode) {
  const room = rooms.get(oldCode);
  if (!room) return;

  rooms.delete(oldCode);
  room.code = newCode;
  rooms.set(newCode, room);

  for (const player of room.players) {
    if (!player.socketId) continue;
    const socket = io.sockets.sockets.get(player.socketId);
    if (!socket) continue;
    socket.leave(oldCode);
    socket.join(newCode);
    socket.data.roomCode = newCode;
  }

  emitRoomUpdate(io, room);
}

export function deleteActiveRoom(io, code) {
  const room = rooms.get(code);
  if (!room) return;

  clearAITimer(room);
  io.to(code).emit('roomDeleted', { roomCode: code });

  for (const player of room.players) {
    if (!player.socketId) continue;
    const socket = io.sockets.sockets.get(player.socketId);
    if (!socket) continue;
    socket.leave(code);
    socket.data.roomCode = null;
    socket.data.playerId = null;
  }

  rooms.delete(code);
}

function getPublicPlayers(room) {
  return room.players
    .filter((p) => p.connected)
    .map(({ id, name, isHost }) => ({ id, name, isHost }));
}

function emitRoomUpdate(io, room) {
  io.to(room.code).emit('roomUpdate', {
    roomCode: room.code,
    players: getPublicPlayers(room),
    hostId: room.hostId,
    gameStarted: room.gameStarted,
  });
}

function emitGameState(io, room, targetSocketId = null) {
  if (!room.gameState) return;

  const shared = getSharedState(room.gameState);

  for (const player of room.players) {
    if (!player.connected && !player.disconnectedAt) continue;

    const payload = {
      ...shared,
      yourHand: getPlayerHand(room.gameState, player.id),
      yourId: player.id,
      bluffPasses: room.bluffPasses ? [...room.bluffPasses] : [],
      moveCount: room.moveCount ?? 0,
    };

    if (targetSocketId && player.socketId === targetSocketId) {
      io.to(targetSocketId).emit('gameState', payload);
    } else if (player.connected && player.socketId) {
      io.to(player.socketId).emit('gameState', payload);
    }
  }
}

function findPlayerBySocket(room, socketId) {
  return room.players.find((p) => p.socketId === socketId);
}

function findPlayerForSocket(room, socket) {
  return (
    findPlayerBySocket(room, socket.id) ??
    room.players.find((p) => p.id === socket.data.playerId) ??
    null
  );
}

function findPlayerByName(room, name) {
  return room.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
}

function scheduleReconnectExpiry(io, room, player) {
  if (player.reconnectTimer) clearTimeout(player.reconnectTimer);
  player.reconnectTimer = setTimeout(() => {
    const currentRoom = rooms.get(room.code);
    if (!currentRoom) return;
    const idx = currentRoom.players.findIndex((p) => p.id === player.id);
    if (idx === -1 || currentRoom.players[idx].connected) return;

    currentRoom.players.splice(idx, 1);

    if (currentRoom.gameStarted && currentRoom.gameState) {
      const remaining = currentRoom.players.filter((p) => p.connected);
      if (remaining.length === 1) {
        currentRoom.gameState = forfeitWin(currentRoom.gameState, remaining[0].id);
        emitGameWon(io, currentRoom);
      } else if (remaining.length > 1) {
        currentRoom.gameState = removePlayerFromGame(currentRoom.gameState, player.id);
        emitGameState(io, currentRoom);
        if (currentRoom.gameState.winner) emitGameWon(io, currentRoom);
      }
    }

    io.to(currentRoom.code).emit('playerRemoved', {
      playerId: player.id,
      name: player.name,
      reason: 'reconnect_timeout',
    });
    emitRoomUpdate(io, currentRoom);
    if (currentRoom.gameStarted) emitGameState(io, currentRoom);
    resetRoomIfEmpty(io, currentRoom);
  }, RECONNECT_TIMEOUT_MS);
}

function resetBluffWindow(room) {
  room.bluffPasses = new Set();
}

function getEligiblePassers(room) {
  const pendingId = room.gameState?.pendingPlay?.playerId;
  if (!pendingId) return [];
  const connectedIds = new Set(
    room.players.filter((p) => p.connected).map((p) => p.id)
  );
  return room.gameState.playerOrder.filter(
    (id) => id !== pendingId && connectedIds.has(id)
  );
}

function finishBluffReveal(io, room) {
  if (room.gameState.lastReveal?.lateChallengers?.length) {
    for (const lateId of room.gameState.lastReveal.lateChallengers) {
      const latePlayer = room.players.find((p) => p.id === lateId);
      if (latePlayer?.socketId) {
        io.to(latePlayer.socketId).emit('bluffTooLate', {
          message: 'Another player\'s challenge was resolved first.',
        });
      }
    }
  }

  io.to(room.code).emit('bluffResolved', room.gameState.lastReveal);

  if (room.gameState.phase === 'start_rank') {
    io.to(room.code).emit('rankEnded', {
      reason: 'bluff',
      nextStarterId: room.gameState.lastReveal?.nextRankStarterId,
    });
  }

  if (room.gameState.winner) {
    emitGameWon(io, room);
  }
}

function resolveBluffChallenge(io, room) {
  incrementMove(room);
  room.gameState = resolveBluffCalls(room.gameState);
  room.bluffPasses = null;
  emitGameState(io, room);
  finishBluffReveal(io, room);
}

function tryCloseBluffWindow(io, room) {
  const eligible = getEligiblePassers(room);
  if (!room.bluffPasses || room.bluffPasses.size < eligible.length) return false;

  room.gameState = passBluffWindow(room.gameState);
  room.bluffPasses = null;
  emitGameState(io, room);

  if (room.gameState.winner) {
    emitGameWon(io, room);
  }
  return true;
}

// ── AI opponent driver ──

function clearAITimer(room) {
  if (room.aiTimer) {
    clearTimeout(room.aiTimer);
    room.aiTimer = null;
  }
}

function getDeckCount(room) {
  return room.players.length > 6 ? 2 : 1;
}

/** Which AI (if any) should act right now, or null if we're waiting on a human. */
function pickAIActor(room) {
  const state = room.gameState;
  if (!state || state.winner) return null;

  if (state.phase === 'bluff_window' && state.pendingPlay) {
    const pendingId = state.pendingPlay.playerId;
    const passed = room.bluffPasses ?? new Set();
    return (
      room.players.find(
        (p) =>
          p.isAI &&
          p.id !== pendingId &&
          state.playerOrder.includes(p.id) &&
          !passed.has(p.id)
      ) ?? null
    );
  }

  if (['opening', 'playing', 'start_rank'].includes(state.phase)) {
    const currentId = state.playerOrder[state.turnIndex];
    const player = room.players.find((p) => p.id === currentId);
    return player?.isAI ? player : null;
  }

  return null;
}

function applyAIPlay(io, room, actor, cardIndexes, declaredRank) {
  incrementMove(room);
  room.gameState = playCards(room.gameState, actor.id, cardIndexes, declaredRank);
  emitGameState(io, room);
  if (room.gameState.phase === 'bluff_window') resetBluffWindow(room);
  if (room.gameState.winner) emitGameWon(io, room);
}

function applyAISkip(io, room, actor) {
  incrementMove(room);
  const prevReason = room.gameState.lastRankEndReason;
  room.gameState = skipTurn(room.gameState, actor.id);
  emitGameState(io, room);

  if (room.gameState.lastRankEndReason === 'all_skip' && prevReason !== 'all_skip') {
    const starterId = room.gameState.playerOrder[room.gameState.turnIndex];
    io.to(room.code).emit('rankEnded', { reason: 'all_skip', nextStarterId: starterId });
  }
  if (room.gameState.winner) emitGameWon(io, room);
}

function runAIAction(io, room, actor) {
  const state = room.gameState;
  const hand = getPlayerHand(state, actor.id);

  if (state.phase === 'bluff_window' && state.pendingPlay) {
    const pending = state.pendingPlay;
    const challengeAllowed = !(pending.isOpeningPlay && pending.cards.length === 1);
    const opponent = state.players.find((p) => p.id === pending.playerId);
    const opponentHandSizeBeforePlay =
      (opponent?.hand?.length ?? 0) + pending.cards.length;
    const call = decideChallenge({
      declaredRank: pending.declaredRank,
      claimedCount: pending.cards.length,
      aiHand: hand,
      opponentHandSizeBeforePlay,
      challengeAllowed,
      deckCount: getDeckCount(room),
    });

    if (call) {
      room.gameState = registerBluffCall(state, actor.id);
      resolveBluffChallenge(io, room);
    } else {
      if (!room.bluffPasses) room.bluffPasses = new Set();
      room.bluffPasses.add(actor.id);
      emitGameState(io, room);
      tryCloseBluffWindow(io, room);
    }
    return;
  }

  if (state.phase === 'opening') {
    const { cardIndexes, declaredRank } = decideOpening(hand);
    applyAIPlay(io, room, actor, cardIndexes, declaredRank);
    return;
  }

  if (state.phase === 'start_rank') {
    if (!room.aiRankMemory) room.aiRankMemory = {};
    if (!room.aiRankMemory[actor.id]) {
      room.aiRankMemory[actor.id] = createRankMemory();
    }
    const { cardIndexes, declaredRank, rankMemory } = decideStartRank(
      hand,
      room.aiRankMemory[actor.id]
    );
    room.aiRankMemory[actor.id] = rankMemory;
    applyAIPlay(io, room, actor, cardIndexes, declaredRank);
    return;
  }

  if (state.phase === 'playing') {
    const decision = decidePlaying(hand, state.currentRank);
    if (decision.action === 'skip') {
      applyAISkip(io, room, actor);
    } else {
      applyAIPlay(io, room, actor, decision.cardIndexes, decision.declaredRank);
    }
  }
}

/** Advance the game by having AI players act (with human-like delays) until it's a human's turn. */
function scheduleAI(io, room) {
  if (!room?.isAIGame || room.aiTimer) return;
  if (!pickAIActor(room)) return;

  const delay = AI_MIN_DELAY_MS + Math.floor(Math.random() * (AI_MAX_DELAY_MS - AI_MIN_DELAY_MS));
  room.aiTimer = setTimeout(() => {
    room.aiTimer = null;
    const current = rooms.get(room.code);
    if (!current || !current.isAIGame) return;
    if (!current.gameState || current.gameState.winner) return;

    const actor = pickAIActor(current);
    if (!actor) return;

    try {
      runAIAction(io, current, actor);
    } catch (err) {
      console.error(`AI action error in room ${current.code}:`, err.message);
      // If the AI produced an illegal move, fall back to a skip so the game never stalls.
      try {
        if (current.gameState?.phase === 'playing') {
          applyAISkip(io, current, actor);
        }
      } catch {
        /* give up on this tick; next human action can nudge the game */
      }
    }

    scheduleAI(io, current);
  }, delay);
}

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('createRoom', ({ authToken }, callback) => {
      const user = verifySocketUser(authToken);
      if (!user) return callback?.({ error: 'Login required' });

      const code = generateRoomCode();
      const player = {
        id: randomUUID(),
        userId: user.id,
        name: user.displayName,
        socketId: socket.id,
        isHost: true,
        connected: true,
      };

      const room = {
        code,
        ownerUserId: user.id,
        hostId: player.id,
        players: [player],
        gameStarted: false,
        gameState: null,
        bluffPasses: null,
        chatHistory: [],
        moveCount: 0,
      };

      rooms.set(code, room);
      saveSavedRoom(code, user.displayName, user.id);
      recordRoomMembership(user.id, code);
      attachPlayerSocket(socket, room, player, code);

      callback?.({ roomCode: code, playerId: player.id });
      emitRoomUpdate(io, room);
    });

    socket.on('startAIGame', ({ authToken, aiCount } = {}, callback) => {
      const user = verifySocketUser(authToken);
      if (!user) return callback?.({ error: 'Login required' });

      const count = Math.min(Math.max(Number(aiCount) || 1, 1), 5);
      const code = generateRoomCode();

      const human = {
        id: randomUUID(),
        userId: user.id,
        name: user.displayName,
        socketId: socket.id,
        isHost: true,
        connected: true,
      };

      const aiPlayers = Array.from({ length: count }, (_, i) => ({
        id: randomUUID(),
        userId: null,
        name: AI_NAMES[i % AI_NAMES.length],
        socketId: null,
        isHost: false,
        isAI: true,
        connected: true,
      }));

      const players = [human, ...aiPlayers];
      const room = {
        code,
        hostId: human.id,
        players,
        gameStarted: false,
        gameState: null,
        bluffPasses: null,
        chatHistory: [],
        moveCount: 0,
        isAIGame: true,
        aiRankMemory: {},
      };

      rooms.set(code, room);
      attachPlayerSocket(socket, room, human, code);

      try {
        room.gameState = createGameState(players.map((p) => ({ id: p.id, name: p.name })));
        room.gameStarted = true;
        room.bluffPasses = null;
        room.moveCount = 0;
        callback?.({ roomCode: code, playerId: human.id });
        emitRoomUpdate(io, room);
        emitGameState(io, room);
        scheduleAI(io, room);
      } catch (err) {
        rooms.delete(code);
        callback?.({ error: err.message });
      }
    });

    socket.on('joinRoom', ({ roomCode, authToken, playerId }, callback) => {
      const user = verifySocketUser(authToken);
      if (!user) return callback?.({ error: 'Login required' });

      const code = roomCode?.trim().toUpperCase();
      if (!code) return callback?.({ error: 'Room code is required' });

      if (!rooms.get(code)) {
        if (!isSavedRoomCode(code)) {
          return callback?.({ error: 'Room not found' });
        }
        rooms.set(code, bootstrapRoomFromSaved(code));
      }

      const activeRoom = rooms.get(code);

      // Repair rooms that were live before owner tracking existed.
      if (activeRoom.ownerUserId == null) {
        const saved = getSavedRoomOwner(code);
        if (saved?.owner_user_id != null) activeRoom.ownerUserId = saved.owner_user_id;
      }

      const onThisSocket = activeRoom.players.find((p) => p.socketId === socket.id);
      if (onThisSocket) {
        return finishJoin(
          io,
          socket,
          activeRoom,
          onThisSocket,
          code,
          isGameInProgress(activeRoom),
          callback
        );
      }

      const existingSlot = findReconnectSlot(activeRoom, user, playerId);
      if (existingSlot) {
        return finishJoin(
          io,
          socket,
          activeRoom,
          existingSlot,
          code,
          isGameInProgress(activeRoom),
          callback
        );
      }

      if (isGameInProgress(activeRoom)) {
        return callback?.({
          error: 'Game in progress — only players already in this game can rejoin until the round ends',
        });
      }

      if (activeRoom.players.length >= 8) {
        return callback?.({ error: 'Room is full' });
      }

      const player = {
        id: randomUUID(),
        userId: user.id,
        name: user.displayName,
        socketId: socket.id,
        isHost: false,
        connected: true,
      };

      activeRoom.players.push(player);
      finishJoin(io, socket, activeRoom, player, code, false, callback);
    });

    socket.on('quitGame', (callback) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room) return callback?.({ error: 'Not in a room' });

      const player = findPlayerForSocket(room, socket);
      if (!player) return callback?.({ error: 'Player not found' });

      const code = room.code;

      // AI practice rooms are single-player + ephemeral: tear the whole room down.
      if (room.isAIGame) {
        clearAITimer(room);
        socket.leave(code);
        socket.data.roomCode = null;
        socket.data.playerId = null;
        socket.data.userId = null;
        rooms.delete(code);
        callback?.({ success: true, left: true });
        return;
      }

      if (room.gameStarted && room.gameState && !room.gameState.winner) {
        const others = room.players.filter((p) => p.id !== player.id);

        if (others.length === 1) {
          const winner = others[0];
          room.gameState = forfeitWin(room.gameState, winner.id);
          removePlayerFromRoom(room, player);
          socket.leave(code);
          socket.data.roomCode = null;
          socket.data.playerId = null;
          emitGameWon(io, room);
          resetRoomIfEmpty(io, room);
          callback?.({ success: true, left: true });
          return;
        }

        if (others.length >= 1) {
          room.gameState = removePlayerFromGame(room.gameState, player.id);
          removePlayerFromRoom(room, player);
          socket.leave(code);
          socket.data.roomCode = null;
          socket.data.playerId = null;
          io.to(code).emit('playerQuit', { playerId: player.id, name: player.name });

          if (room.gameState.winner) {
            emitGameWon(io, room);
          } else {
            emitGameState(io, room);
            emitRoomUpdate(io, room);
            if (room.gameState.phase === 'bluff_window') {
              tryCloseBluffWindow(io, room);
            }
          }

          resetRoomIfEmpty(io, room);
          callback?.({ success: true, left: true });
          return;
        }
      }

      removePlayerFromRoom(room, player);
      socket.leave(code);
      socket.data.roomCode = null;
      socket.data.playerId = null;
      socket.data.userId = null;

      if (!room.gameStarted || room.gameState?.winner) {
        room.gameStarted = false;
        room.gameState = null;
        room.bluffPasses = null;
      }

      io.to(code).emit('playerQuit', { playerId: player.id, name: player.name });
      resetRoomIfEmpty(io, room);
      if (room.players.length > 0) emitRoomUpdate(io, room);
      callback?.({ success: true, left: true });
    });

    socket.on('startGame', (callback) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room) return callback?.({ error: 'Not in a room' });
      if (room.hostId !== socket.data.playerId) return callback?.({ error: 'Only host can start' });

      const activePlayers = room.players.filter((p) => p.connected);
      if (activePlayers.length < 2 || activePlayers.length > 8) {
        return callback?.({ error: 'Need 2-8 players to start' });
      }

      try {
        room.gameState = createGameState(
          activePlayers.map((p) => ({ id: p.id, name: p.name }))
        );
        room.gameStarted = true;
        room.bluffPasses = null;
        room.moveCount = 0;
        callback?.({ success: true });
        emitRoomUpdate(io, room);
        emitGameState(io, room);
        scheduleAI(io, room);
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    socket.on('playAgain', (callback) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room) return callback?.({ error: 'Not in a room' });
      if (room.hostId !== socket.data.playerId) return callback?.({ error: 'Only host can reset' });

      room.gameState = null;
      room.gameStarted = false;
      room.bluffPasses = null;
      callback?.({ success: true });
      emitRoomUpdate(io, room);
      io.to(room.code).emit('gameReset');
    });

    socket.on('playCards', ({ cardIndexes, declaredRank }, callback) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room?.gameState) return callback?.({ error: 'No active game' });

      try {
        incrementMove(room);
        room.gameState = playCards(room.gameState, socket.data.playerId, cardIndexes, declaredRank);
        callback?.({ success: true });
        emitGameState(io, room);

        if (room.gameState.phase === 'bluff_window') {
          resetBluffWindow(room);
        }

        if (room.gameState.winner) {
          emitGameWon(io, room);
        }
        scheduleAI(io, room);
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    socket.on('callBluff', (callback) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room?.gameState) return callback?.({ error: 'No active game' });

      try {
        room.gameState = registerBluffCall(room.gameState, socket.data.playerId);
        resolveBluffChallenge(io, room);
        callback?.({ success: true });
        scheduleAI(io, room);
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    socket.on('passBluff', (callback) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room?.gameState) return callback?.({ error: 'No active game' });

      try {
        if (room.gameState.phase !== 'bluff_window' || !room.gameState.pendingPlay) {
          throw new Error('No play to pass on');
        }
        if (socket.data.playerId === room.gameState.pendingPlay.playerId) {
          throw new Error('You cannot pass on your own play');
        }
        if (!room.bluffPasses) room.bluffPasses = new Set();
        if (room.bluffPasses.has(socket.data.playerId)) {
          throw new Error('Already passed');
        }

        room.bluffPasses.add(socket.data.playerId);
        callback?.({ success: true });
        emitGameState(io, room);
        tryCloseBluffWindow(io, room);
        scheduleAI(io, room);
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    socket.on('skipTurn', (callback) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room?.gameState) return callback?.({ error: 'No active game' });

      try {
        incrementMove(room);
        const prevReason = room.gameState.lastRankEndReason;
        room.gameState = skipTurn(room.gameState, socket.data.playerId);
        callback?.({ success: true });
        emitGameState(io, room);

        if (room.gameState.lastRankEndReason === 'all_skip' && prevReason !== 'all_skip') {
          const starterId = room.gameState.playerOrder[room.gameState.turnIndex];
          io.to(room.code).emit('rankEnded', {
            reason: 'all_skip',
            nextStarterId: starterId,
          });
        }

        if (room.gameState.winner) {
          emitGameWon(io, room);
        }
        scheduleAI(io, room);
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    socket.on('chatMessage', ({ message }) => {
      const room = rooms.get(socket.data.roomCode);
      if (!room) return;

      const text = message?.trim();
      if (!text) return;

      const player = findPlayerBySocket(room, socket.id);
      if (!player) return;

      const chatEntry = {
        id: `${Date.now()}-${socket.id}`,
        playerId: player.id,
        playerName: player.name,
        message: text.slice(0, 200),
        timestamp: Date.now(),
      };

      room.chatHistory.push(chatEntry);
      if (room.chatHistory.length > 100) room.chatHistory.shift();

      io.to(room.code).emit('chatMessage', chatEntry);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;

      const room = rooms.get(roomCode);
      if (!room) return;

      const player = findPlayerBySocket(room, socket.id);
      if (!player) return;

      // AI practice room: the only human left, so drop the whole room.
      if (room.isAIGame) {
        clearAITimer(room);
        rooms.delete(roomCode);
        return;
      }

      player.connected = false;
      player.socketId = null;
      player.disconnectedAt = Date.now();

      if (room.gameStarted && room.gameState) {
        scheduleReconnectExpiry(io, room, player);
        io.to(roomCode).emit('playerDisconnected', { playerId: player.id, name: player.name });
        emitRoomUpdate(io, room);
        // If we were waiting on this player to call/pass, re-check so the
        // challenge window can still close instead of deadlocking.
        if (room.gameState.phase === 'bluff_window') {
          tryCloseBluffWindow(io, room);
        }
      } else {
        removePlayerFromRoom(room, player);
        resetRoomIfEmpty(io, room);
        if (room.players.length > 0) emitRoomUpdate(io, room);
      }
    });
  });
}

export { rooms };
