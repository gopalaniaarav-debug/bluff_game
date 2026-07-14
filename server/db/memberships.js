import { db } from './scores.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS room_memberships (
    user_id INTEGER NOT NULL,
    room_code TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, room_code)
  );

  CREATE INDEX IF NOT EXISTS idx_room_memberships_code ON room_memberships(room_code);
`);

export function recordRoomMembership(userId, roomCode) {
  if (!userId || !roomCode) return;
  db.prepare(`
    INSERT OR IGNORE INTO room_memberships (user_id, room_code, joined_at)
    VALUES (?, ?, ?)
  `).run(userId, roomCode.toUpperCase(), Date.now());
}
