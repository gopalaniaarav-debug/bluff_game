import { createGameState, getSharedState, getPlayerHand, playCards, registerBluffCall, resolveBluffCalls, passBluffWindow, skipTurn } from './game/gameState.js';
import { saveGameResult } from './db/scores.js';
import { isSavedRoomCode, saveSavedRoom } from './db/rooms.js';

const RECONNECT_TIMEOUT_MS = 2 * 60 * 1000;

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

  saveGameResult({
    roomCode: room.code,
    winnerName: winner.name,
    moveCount,
    players: playerNames,
  });

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
  return {
    code,
    hostId: null,
    players: [],
    gameStarted: false,
    gameState: null,
    bluffPasses: null,
    chatHistory: [],
    moveCount: 0,
  };
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
    io.to(currentRoom.code).emit('playerRemoved', {
      playerId: player.id,
      name: player.name,
      reason: 'reconnect_timeout',
    });
    emitRoomUpdate(io, currentRoom);
    if (currentRoom.gameStarted) emitGameState(io, currentRoom);
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

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('createRoom', ({ playerName }, callback) => {
      const name = playerName?.trim();
      if (!name) return callback?.({ error: 'Name is required' });

      const code = generateRoomCode();
      const player = {
        id: socket.id,
        name,
        socketId: socket.id,
        isHost: true,
        connected: true,
      };

      const room = {
        code,
        hostId: socket.id,
        players: [player],
        gameStarted: false,
        gameState: null,
        bluffPasses: null,
        chatHistory: [],
        moveCount: 0,
      };

      rooms.set(code, room);
      saveSavedRoom(code, name);
      socket.join(code);
      socket.data.roomCode = code;
      socket.data.playerId = player.id;

      callback?.({ roomCode: code });
      emitRoomUpdate(io, room);
    });

    socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
      const code = roomCode?.trim().toUpperCase();
      const name = playerName?.trim();
      if (!code || !name) return callback?.({ error: 'Room code and name are required' });

      const room = rooms.get(code);
      if (!room) {
        if (!isSavedRoomCode(code)) {
          return callback?.({ error: 'Room not found' });
        }
        const bootstrapped = bootstrapRoomFromSaved(code);
        rooms.set(code, bootstrapped);
      }

      const activeRoom = rooms.get(code);
      if (activeRoom.gameStarted) {
        const existing = findPlayerByName(activeRoom, name);
        if (existing && !existing.connected) {
          existing.connected = true;
          existing.socketId = socket.id;
          if (existing.reconnectTimer) {
            clearTimeout(existing.reconnectTimer);
            existing.reconnectTimer = null;
          }
          socket.join(code);
          socket.data.roomCode = code;
          socket.data.playerId = existing.id;
          callback?.({ roomCode: code, reconnected: true });
          emitRoomUpdate(io, activeRoom);
          emitGameState(io, activeRoom, socket.id);
          io.to(code).emit('playerReconnected', { playerId: existing.id, name: existing.name });
          return;
        }
        return callback?.({ error: 'Game already in progress' });
      }

      if (activeRoom.players.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.connected)) {
        return callback?.({ error: 'Name already taken in this room' });
      }

      if (activeRoom.players.length >= 8) {
        return callback?.({ error: 'Room is full' });
      }

      const player = {
        id: socket.id,
        name,
        socketId: socket.id,
        isHost: activeRoom.players.length === 0,
        connected: true,
      };

      if (activeRoom.players.length === 0) {
        activeRoom.hostId = player.id;
      }

      activeRoom.players.push(player);
      socket.join(code);
      socket.data.roomCode = code;
      socket.data.playerId = player.id;

      callback?.({ roomCode: code });
      emitRoomUpdate(io, activeRoom);
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
        room.players = room.players.filter((p) => p.id !== player.id);
        if (room.players.length === 0) {
          room.bluffPasses = null;
          rooms.delete(roomCode);
          return;
        }
        if (room.hostId === player.id) {
          room.hostId = room.players[0].id;
          room.players[0].isHost = true;
        }
        emitRoomUpdate(io, room);
      }
    });
  });
}

export { rooms };
