import crypto from 'crypto';
import { db } from './scores.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch {
    return false;
  }
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function registerUser(displayName, password) {
  const name = displayName?.trim();
  if (!name || name.length < 2 || name.length > 14) {
    throw new Error('Display name must be 2–14 characters');
  }
  if (!password || password.length < 4) {
    throw new Error('Password must be at least 4 characters');
  }

  const existing = db.prepare('SELECT id FROM users WHERE display_name = ? COLLATE NOCASE').get(name);
  if (existing) throw new Error('Display name already taken');

  const now = Date.now();
  const result = db
    .prepare('INSERT INTO users (display_name, password_hash, created_at) VALUES (?, ?, ?)')
    .run(name, hashPassword(password), now);

  return createSession(result.lastInsertRowid);
}

export function loginUser(displayName, password) {
  const name = displayName?.trim();
  if (!name || !password) throw new Error('Display name and password are required');

  const user = db
    .prepare('SELECT id, display_name, password_hash FROM users WHERE display_name = ? COLLATE NOCASE')
    .get(name);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error('Invalid display name or password');
  }

  return createSession(user.id);
}

function createSession(userId) {
  const token = createToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt
  );

  const user = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(userId);
  return { token, expiresAt, user: { id: user.id, displayName: user.display_name } };
}

export function getUserByToken(token) {
  if (!token) return null;
  const row = db
    .prepare(`
      SELECT u.id, u.display_name, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
    `)
    .get(token);
  if (!row || row.expires_at < Date.now()) {
    if (row) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { id: row.id, displayName: row.display_name };
}

export function revokeSession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
