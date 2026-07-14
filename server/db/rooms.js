import { db } from './scores.js';
import './memberships.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

db.exec(`
  CREATE TABLE IF NOT EXISTS saved_rooms (
    code TEXT PRIMARY KEY,
    host_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

try {
  db.exec(`ALTER TABLE saved_rooms ADD COLUMN owner_user_id INTEGER`);
} catch {
  // column exists
}

export function isValidRoomCode(code) {
  if (!code || code.length !== 4) return false;
  return [...code.toUpperCase()].every((c) => CODE_CHARS.includes(c));
}

export function isSavedRoomCode(code) {
  const row = db.prepare('SELECT code FROM saved_rooms WHERE code = ?').get(code.toUpperCase());
  return Boolean(row);
}

export function getSavedRoomOwner(code) {
  const row = db
    .prepare('SELECT owner_user_id, host_name FROM saved_rooms WHERE code = ?')
    .get(code.toUpperCase());
  return row ?? null;
}

export function isRoomOwner(userId, code) {
  if (!userId) return false;
  const row = getSavedRoomOwner(code);
  return row?.owner_user_id === userId;
}

export function saveSavedRoom(code, hostName, ownerUserId) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO saved_rooms (code, host_name, owner_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(code.toUpperCase(), hostName, ownerUserId ?? null, now, now);
}

export function listSavedRoomsForUser(userId) {
  if (!userId) return [];

  const rows = db.prepare(`
    SELECT DISTINCT sr.code, sr.host_name, sr.created_at, sr.updated_at, sr.owner_user_id,
           (SELECT COUNT(*) FROM game_results gr WHERE gr.room_code = sr.code) AS game_count
    FROM saved_rooms sr
    LEFT JOIN room_memberships rm ON rm.room_code = sr.code
    WHERE sr.owner_user_id = ? OR rm.user_id = ?
    ORDER BY sr.updated_at DESC
  `).all(userId, userId);

  return rows.map((r) => ({
    code: r.code,
    hostName: r.host_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    gameCount: r.game_count,
    isOwner: r.owner_user_id === userId,
  }));
}

export function renameSavedRoom(oldCode, newCode, userId) {
  const old = oldCode.toUpperCase();
  const next = newCode.toUpperCase();
  if (!isValidRoomCode(next)) throw new Error('Room code must be 4 letters or numbers');
  if (!isRoomOwner(userId, old)) throw new Error('Only the room owner can rename this room');
  if (isSavedRoomCode(next) && next !== old) throw new Error('Room code already taken');

  const rename = db.transaction(() => {
    const existing = db.prepare('SELECT code FROM saved_rooms WHERE code = ?').get(old);
    if (!existing) throw new Error('Room not found');

    db.prepare('UPDATE game_results SET room_code = ? WHERE room_code = ?').run(next, old);
    db.prepare('UPDATE room_memberships SET room_code = ? WHERE room_code = ?').run(next, old);
    db.prepare(`
      INSERT INTO saved_rooms (code, host_name, owner_user_id, created_at, updated_at)
      SELECT ?, host_name, owner_user_id, created_at, ?
      FROM saved_rooms WHERE code = ?
    `).run(next, Date.now(), old);
    db.prepare('DELETE FROM saved_rooms WHERE code = ?').run(old);
  });

  rename();
  return next;
}

export function deleteSavedRoom(code, userId) {
  const upper = code.toUpperCase();
  if (!isRoomOwner(userId, upper)) throw new Error('Only the room owner can delete this room');

  const del = db.transaction(() => {
    db.prepare('DELETE FROM game_results WHERE room_code = ?').run(upper);
    db.prepare('DELETE FROM room_memberships WHERE room_code = ?').run(upper);
    const result = db.prepare('DELETE FROM saved_rooms WHERE code = ?').run(upper);
    if (result.changes === 0) throw new Error('Room not found');
  });
  del();
}
