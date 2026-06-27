import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocketHandlers, renameActiveRoom, deleteActiveRoom } from './rooms.js';
import { getScoresForPlayer, getScoresForRoomPlayer, getAllScores } from './db/scores.js';
import {
  listSavedRooms,
  renameSavedRoom,
  deleteSavedRoom,
  isValidRoomCode,
} from './db/rooms.js';

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
    /\.ngrok\.app$/.test(origin)
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

app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: listSavedRooms() });
});

app.patch('/api/rooms/:code', (req, res) => {
  try {
    const oldCode = req.params.code?.trim().toUpperCase();
    const newCode = req.body.newCode?.trim().toUpperCase();
    if (!isValidRoomCode(newCode)) {
      return res.status(400).json({ error: 'Code must be 4 letters or numbers' });
    }
    renameSavedRoom(oldCode, newCode);
    renameActiveRoom(app.locals.io, oldCode, newCode);
    res.json({ code: newCode });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/rooms/:code', (req, res) => {
  try {
    const code = req.params.code?.trim().toUpperCase();
    deleteSavedRoom(code);
    deleteActiveRoom(app.locals.io, code);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
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
