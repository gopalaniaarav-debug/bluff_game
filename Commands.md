0.1 — Scaffold

Create a new project for an online multiplayer card game called "Bluff" (a.k.a. Cheat). 
Set up two folders: /server (Node.js + Express + Socket.io backend) and /client (React app using Vite).
Initialize package.json in both with appropriate dependencies (express, socket.io, cors for /server; react, socket.io-client for /client).
Add a root README.md describing the project and how to run both apps locally.

0.2 — Server skeleton

In /server, create an Express server (index.js) that:
- Starts an HTTP server on port 4000
- Attaches Socket.io with CORS enabled for http://localhost:5173
- Logs "Server running on port 4000" on start
- Has a basic socket connection handler that logs when a client connects/disconnects

0.3 — Client skeleton

In /client, scaffold a React app (Vite) with a single page that connects to the Socket.io server at http://localhost:4000 on load, and displays "Connected" or "Disconnected" based on connection status.

0.4 — Verify connection

Run the /server and /client dev servers and confirm in the browser that the client shows "Connected". Fix any CORS or connection errors until this works.


1.1–1.6 — Core game logic

In /server, create a folder /server/game with pure, framework-free JS modules implementing the rules of Bluff:

Rules:
- 2-8 players. Standard 52-card deck; use two shuffled decks combined if there are more than 6 players.
- Deal all cards out evenly (some players may get one extra card).
- Players take turns clockwise. On your turn, play 1+ cards face-down to a central pile and declare a rank for them (the rank must follow the previous declared rank in sequence: A,2,3,4,5,6,7,8,9,10,J,Q,K,A,...). You may lie about the rank.
- After a play, any other player may call "Bluff" before the next player acts. The played cards are revealed:
  - If they don't match the declared rank, the player who played them picks up the entire central pile.
  - If they do match, the challenger picks up the entire pile.
- If multiple players call Bluff, the player closest (clockwise) to the one who played resolves first.
- First player to empty their hand wins.

Implement as pure functions/classes with no I/O:
- createShuffledDeck(numPlayers)
- dealCards(deck, numPlayers)
- createGameState(players)
- playCards(gameState, playerId, cardIndexes, declaredRank)
- callBluff(gameState, challengerId)
- checkWinner(gameState)

Write unit tests (using vitest or jest) covering: dealing, valid/invalid sequential rank, correct bluff resolution (both outcomes), multiple simultaneous challenges, and win detection. Run the tests and make sure they all pass.


2.1–2.3 — Rooms & lobby

In /server, add Socket.io event handlers for a lobby system:
- "createRoom" (playerName) -> generates a short room code (4 uppercase letters/numbers), creates a room, makes this player the host, returns the room code.
- "joinRoom" (roomCode, playerName) -> adds player to the room if it exists and game hasn't started; broadcasts updated player list to everyone in the room.
- Track per-room: list of players (id, name), host id, game-started flag.
- Handle player disconnects by removing them from the room and broadcasting the updated list.

2.4–2.5 — Wire game logic into rooms

In /server, add a "startGame" socket event (host only, requires 2-8 players) that:
- Uses the /server/game logic from Sprint 1 to create and deal a shuffled game state for the room
- Sends each player their own hand privately (don't leak other players' cards), plus shared state (whose turn, central pile count, last declared rank)
Add "playCards" and "callBluff" socket events that call the corresponding game logic functions, validate the action is legal (correct player's turn, etc.), update room state, and broadcast the new shared state to all players in the room (still hiding hands from others).

2.6 — Reconnect handling

Add reconnect support: if a player disconnects mid-game, keep their hand/state in the room for 2 minutes in case they reconnect with the same room code and name, instead of removing them immediately. If they don't return in time, remove them and notify the room.


3.1–3.3 — Lobby UI

In /client, build:
- A landing page with two options: "Create Room" (enter your name) and "Join Room" (enter your name + room code)
- A lobby page showing the room code prominently, the list of connected players, and a "Start Game" button visible only to the host (disabled below 2 players)
Wire these screens to the createRoom/joinRoom/startGame socket events from the server. Use React Router or simple state-based screen switching.


4.1–4.2 — Gameplay UI core

In /client, build the main game screen:
- Your hand of cards at the bottom (selectable, click to select/deselect)
- Other players shown around the "table" with their name and card count (not their actual cards)
- The central pile shown as a face-down stack with a count
- A turn indicator showing whose turn it is and the current expected/last declared rank
- A rank picker (dropdown or row of buttons A-K) and a "Play" button that's enabled only when it's your turn and you've selected at least one card
Wire the Play button to emit the "playCards" socket event with selected card indexes and declared rank.

4.3–4.4 — Bluff calling & reveal

In /client, add a "Call Bluff!" button visible to all non-active players after a play is made. On click, emit "callBluff". When the server resolves it, show a brief reveal animation/modal of the actual cards played and who picked up the pile (and how many cards), then update the table state.

4.5 — Win screen

In /client, add a win screen that appears when the server signals a winner: show the winning player's name and a "Play Again" button that returns everyone to the lobby (keep the same room code and player list, just reset the game state).


5.1 — Simultaneous challenges

Verify and, if needed, fix the server-side logic so that when multiple players call Bluff within the same short window, only the clockwise-closest player's challenge is resolved (per the rules), and the others are notified their challenge was too late/unnecessary.

5.2 — Reconnect resumes correctly

Test disconnecting a client mid-game (close the tab) and reconnecting with the same name/room code. Fix any issues so the player's hand and the table state are restored correctly on reconnect.

5.3 — Optional chat/reactions

Add a simple text chat panel scoped to the room, using a new "chatMessage" socket event, shown alongside the game board.

5.4 — Mobile pass

Review the game screen and lobby on a mobile-width viewport (375px) and adjust CSS (flex-wrap, font sizes, button sizes) so it's playable on a phone.


6.1–6.3 — Playtest & fixes

I'm going to playtest this with friends now. Walk through a full game in two browser windows side by side (simulate 2 players) and tell me any bugs, desyncs, or confusing UI you notice in the code before I test with real people.

(After your real playtest, come back to Cursor with specific bugs you saw, e.g.: "When player A calls Bluff right after player B, the pile count shown to player C is wrong — fix this.")


7.1–7.2 — Deployment

Prepare /server for deployment to Render (or Railway): add a start script, ensure the port is read from process.env.PORT, and add a render.yaml (or equivalent) if needed. Then prepare /client for deployment to Vercel: ensure the Socket.io client URL is read from an environment variable (VITE_SERVER_URL) instead of hardcoded localhost.

7.3–7.4 — Final check

Double check there are no hardcoded localhost URLs left anywhere in /client or /server, and that CORS on the server allows the deployed frontend's domain. Summarize the exact steps I need to take in the Render/Railway and Vercel dashboards to deploy both, including which environment variables to set.