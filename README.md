# Bluff (Cheat)

An online multiplayer card game where players take turns playing cards face-down and declaring a rank — truthfully or not. Other players can call **Bluff** to challenge a play. First to empty their hand wins.

## Stack

- **Server:** Node.js, Express, Socket.io (port 4000)
- **Client:** React + Vite (port 5173)

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm

## Local development

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Start the server

```bash
cd server
npm run dev
```

### 3. Start the client (separate terminal)

```bash
cd client
npm run dev
```

Open http://localhost:5173 — the status bar should show **Connected**.

### 4. Run server tests

```bash
cd server
npm test
```

## How to play

1. **Create Room** or **Join Room** with a 4-character code.
2. Host starts when 2–8 players are in the lobby.
3. On your turn, select cards and pick the required rank (follows A→2→3→…→K→A).
4. Other players can **Call Bluff!** after a play.
5. First player with no cards left wins.

## Environment variables

| Variable | Where | Description |
|----------|-------|-------------|
| `PORT` | Server | HTTP port (default `4000`) |
| `CLIENT_URL` | Server | Deployed frontend URL for CORS |
| `VITE_SERVER_URL` | Client | Socket.io server URL |

## Deployment

### Server (Render)

1. Create a **Web Service** pointing at this repo; set **Root Directory** to `server`.
2. Build: `npm install` · Start: `npm start`
3. Set `CLIENT_URL` to your Vercel URL (e.g. `https://your-app.vercel.app`).

Or use the included `render.yaml` at the repo root.

### Client (Vercel)

1. Import the repo; set **Root Directory** to `client`.
2. Add env var `VITE_SERVER_URL` = your Render server URL (e.g. `https://bluff-server.onrender.com`).
3. Deploy.

## Project structure

```
/server          Express + Socket.io backend
  /game          Pure game logic + tests
/client          React frontend
render.yaml      Render deployment config
```
