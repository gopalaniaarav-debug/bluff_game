import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SCORES_DB_PATH || join(__dirname, '../data/scores.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS game_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    winner_name TEXT NOT NULL,
    move_count INTEGER NOT NULL,
    players_json TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_game_results_winner ON game_results(winner_name);
  CREATE INDEX IF NOT EXISTS idx_game_results_created ON game_results(created_at DESC);
`);

export function saveGameResult({ roomCode, winnerName, moveCount, players }) {
  const stmt = db.prepare(`
    INSERT INTO game_results (room_code, winner_name, move_count, players_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const id = stmt.run(
    roomCode,
    winnerName,
    moveCount,
    JSON.stringify(players),
    Date.now()
  ).lastInsertRowid;
  return id;
}

export function getScoresForPlayer(playerName) {
  const name = playerName?.trim();
  if (!name) return { myWins: [], opponentWins: [], recent: [] };
  return scoreForPlayer(name, null);
}

export function getScoresForRoomPlayer(roomCode, playerName) {
  const name = playerName?.trim();
  const room = roomCode?.trim().toUpperCase();
  if (!room || !name) return { myWins: [], opponentWins: [], recent: [] };
  return scoreForPlayer(name, room);
}

export function getScoresForRoom(roomCode, limit = 50) {
  const room = roomCode?.trim().toUpperCase();
  if (!room) return [];
  const rows = db
    .prepare('SELECT * FROM game_results WHERE room_code = ? ORDER BY created_at DESC LIMIT ?')
    .all(room, limit);
  return rows.map(formatRow);
}

function scoreForPlayer(name, roomCode) {
  const key = name.toLowerCase();
  const rows = roomCode
    ? db.prepare('SELECT * FROM game_results WHERE room_code = ? ORDER BY created_at DESC LIMIT 200').all(roomCode)
    : db.prepare('SELECT * FROM game_results ORDER BY created_at DESC LIMIT 200').all();

  const myWins = [];
  const opponentWins = [];

  for (const row of rows) {
    const players = JSON.parse(row.players_json);
    const participated = players.some((p) => p.toLowerCase() === key);
    if (!participated) continue;

    const entry = {
      id: row.id,
      winnerName: row.winner_name,
      moveCount: row.move_count,
      players,
      roomCode: row.room_code,
      createdAt: row.created_at,
    };

    if (row.winner_name.toLowerCase() === key) {
      myWins.push(entry);
    } else {
      opponentWins.push(entry);
    }
  }

  return { myWins, opponentWins, recent: rows.slice(0, 20).map(formatRow) };
}

export function getAllScores(limit = 50) {
  const rows = db
    .prepare('SELECT * FROM game_results ORDER BY created_at DESC LIMIT ?')
    .all(limit);
  return rows.map(formatRow);
}

function formatRow(row) {
  return {
    id: row.id,
    winnerName: row.winner_name,
    moveCount: row.move_count,
    players: JSON.parse(row.players_json),
    roomCode: row.room_code,
    createdAt: row.created_at,
  };
}

export { db };
