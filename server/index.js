import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocketHandlers, renameActiveRoom, deleteActiveRoom } from './rooms.js';
import { getScoresForPlayer, getScoresForRoomPlayer, getAllScores } from './db/scores.js';
import {
  listSavedRoomsForUser,
  renameSavedRoom,
  deleteSavedRoom,
  isValidRoomCode,
} from './db/rooms.js';
import { registerUser, loginUser, getUserByToken, revokeSession } from './db/users.js';
import './db/memberships.js';
import { requireAuth, extractToken } from './auth.js';

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_URL,
].filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return (
    /\.ngrok-free\.(dev|app)$/.test(origin) ||
    /\.ngrok\.io$/.test(origin) ||
    /\.ngrok\.app$/.test(origin) ||
    // Capacitor native app WebViews: Android defaults to https://localhost,
    // iOS defaults to capacitor://localhost.
    origin === 'capacitor://localhost' ||
    origin === 'https://localhost' ||
    origin === 'http://localhost'
  );
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) callback(null, true);
    else callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ status: 'ok', game: 'Bluff' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy' });
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { displayName, password } = req.body;
    const session = registerUser(displayName, password);
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { displayName, password } = req.body;
    const session = loginUser(displayName, password);
    res.json(session);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  revokeSession(extractToken(req));
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = getUserByToken(extractToken(req));
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ user: { id: user.id, displayName: user.displayName } });
});

app.get('/api/rooms', requireAuth, (req, res) => {
  res.json({ rooms: listSavedRoomsForUser(req.user.id) });
});

app.patch('/api/rooms/:code', requireAuth, (req, res) => {
  try {
    const oldCode = req.params.code?.trim().toUpperCase();
    const newCode = req.body.newCode?.trim().toUpperCase();
    if (!isValidRoomCode(newCode)) {
      return res.status(400).json({ error: 'Code must be 4 letters or numbers' });
    }
    renameSavedRoom(oldCode, newCode, req.user.id);
    renameActiveRoom(app.locals.io, oldCode, newCode);
    res.json({ code: newCode });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.delete('/api/rooms/:code', requireAuth, (req, res) => {
  try {
    const code = req.params.code?.trim().toUpperCase();
    deleteSavedRoom(code, req.user.id);
    deleteActiveRoom(app.locals.io, code);
    res.json({ success: true });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

app.get('/api/scores', (req, res) => {
  const player = req.query.player?.trim();
  const room = req.query.room?.trim().toUpperCase();
  if (room && player) {
    return res.json(getScoresForRoomPlayer(room, player));
  }
  if (player) {
    return res.json(getScoresForPlayer(player));
  }
  return res.json({ recent: getAllScores() });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    ...corsOptions,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  },
});

app.locals.io = io;
setupSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
