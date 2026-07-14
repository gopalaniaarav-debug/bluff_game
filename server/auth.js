import { getUserByToken } from './db/users.js';

export function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return req.body?.authToken || req.query?.authToken || null;
}

export function requireAuth(req, res, next) {
  const user = getUserByToken(extractToken(req));
  if (!user) return res.status(401).json({ error: 'Login required' });
  req.user = user;
  next();
}

export function verifySocketUser(authToken) {
  return getUserByToken(authToken);
}
