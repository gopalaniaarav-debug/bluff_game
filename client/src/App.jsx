import { useEffect, useState, useCallback, useRef } from 'react';
import { getSocket } from './socket';
import {
  loadSession,
  saveSession,
  clearSession,
  clearRoomSession,
  apiLogin,
  apiRegister,
  apiLogout,
  apiMe,
} from './auth';
import Landing from './components/Landing';
import Lobby from './components/Lobby';
import GameScreen from './components/GameScreen';
import BluffRevealModal from './components/BluffRevealModal';
import WinScreen from './components/WinScreen';
import { bindUIButtonSounds, playSound } from './sounds';

const SCREENS = {
  LANDING: 'landing',
  LOBBY: 'lobby',
  GAME: 'game',
  WIN: 'win',
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [screen, setScreen] = useState(SCREENS.LANDING);
  const [error, setError] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [players, setPlayers] = useState([]);
  const [hostId, setHostId] = useState('');
  const [gameState, setGameState] = useState(null);
  const [selectedCards, setSelectedCards] = useState([]);
  const [declaredRank, setDeclaredRank] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [winner, setWinner] = useState(null);
  const [winMoveCount, setWinMoveCount] = useState(null);
  const [scoresRefresh, setScoresRefresh] = useState(0);
  const [roomsListRefresh, setRoomsListRefresh] = useState(0);
  const [playerName, setPlayerName] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [toast, setToast] = useState('');
  const [playerColors, setPlayerColors] = useState({});

  const screenRef = useRef(screen);
  screenRef.current = screen;

  const playersRef = useRef(players);
  playersRef.current = players;

  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;

  const rejoinAttempted = useRef(false);
  const inRoomRef = useRef(false);
  const appRef = useRef(null);
  const selfActionRef = useRef(false);
  const prevGameStateRef = useRef(null);
  const chatOpenRef = useRef(false);

  const socket = getSocket();

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }, []);

  const getAuthToken = useCallback(() => loadSession()?.authToken ?? null, []);

  useEffect(() => {
    (async () => {
      const session = loadSession();
      if (session?.authToken) {
        const me = await apiMe();
        if (me) {
          setUser(me);
          setPlayerName(me.displayName);
        } else {
          clearSession();
        }
      }
      setAuthReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!authReady) return undefined;
    return bindUIButtonSounds(appRef.current);
  }, [authReady]);

  const emitWithCallback = useCallback(
    (event, data) =>
      new Promise((resolve) => {
        if (!socket.connected) {
          resolve({ error: 'Not connected to server' });
          return;
        }
        const timer = setTimeout(() => resolve({ error: 'Request timed out — try again' }), 12000);
        const onAck = (response) => {
          clearTimeout(timer);
          resolve(response ?? { error: 'No response from server' });
        };
        // Socket.io treats the last function as the ack. Passing `undefined` as
        // payload would steal the ack slot on the server — never send it.
        if (data === undefined) socket.emit(event, onAck);
        else socket.emit(event, data, onAck);
      }),
    [socket]
  );

  const attemptAutoRejoin = useCallback(async () => {
    if (rejoinAttempted.current || inRoomRef.current) return;
    const session = loadSession();
    if (!session?.authToken || !session?.roomCode) return;

    rejoinAttempted.current = true;
    const res = await emitWithCallback('joinRoom', {
      roomCode: session.roomCode,
      authToken: session.authToken,
      playerId: session.playerId,
    });

    if (res?.error) {
      clearRoomSession();
      rejoinAttempted.current = false;
      return;
    }

    setRoomCode(res.roomCode);
    setPlayerId(res.playerId);
    saveSession({ roomCode: res.roomCode, playerId: res.playerId });
    inRoomRef.current = true;
    setScreen(res.reconnected ? SCREENS.GAME : SCREENS.LOBBY);
  }, [emitWithCallback]);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onRoomUpdate = (data) => {
      if (!inRoomRef.current) return;
      const prevCount = playersRef.current.length;
      setRoomCode(data.roomCode);
      setPlayers(data.players);
      setHostId(data.hostId);
      if (data.players.length > prevCount && prevCount > 0) {
        playSound('join');
      }
      if (!data.gameStarted && screenRef.current !== SCREENS.WIN) {
        setScreen(SCREENS.LOBBY);
      }
    };

    const onGameState = (state) => {
      // Ignore late game packets after Quit / Leave — don't yank the user back in.
      if (!inRoomRef.current) return;

      const prev = prevGameStateRef.current;
      const myId = state.yourId;
      const currentId = state.playerOrder?.[state.turnIndex];
      const isMyTurnNow =
        currentId === myId && ['opening', 'playing', 'start_rank'].includes(state.phase);
      const wasMyTurn = prev?.turnPlayerId === myId && prev?.yourTurnPhase;

      if (!prev && state.phase === 'opening' && (state.moveCount ?? 0) === 0) {
        playSound('deal');
      } else if (prev && !selfActionRef.current && state.centralPileCount > prev.centralPileCount) {
        playSound('cardOpponent');
      } else if (isMyTurnNow && !wasMyTurn) {
        playSound('yourTurn');
      }

      if (selfActionRef.current) selfActionRef.current = false;

      prevGameStateRef.current = {
        centralPileCount: state.centralPileCount,
        phase: state.phase,
        pendingPlayPlayerId: state.pendingPlayPlayerId,
        pendingPlayCount: state.pendingPlayCount,
        turnPlayerId: currentId,
        yourTurnPhase: isMyTurnNow,
        moveCount: state.moveCount ?? 0,
      };

      setGameState(state);
      setPlayerId(state.yourId);
      saveSession({ playerId: state.yourId });
      setScreen(SCREENS.GAME);
      setSelectedCards([]);
      if (state.phase === 'start_rank') {
        setDeclaredRank(null);
      } else if (state.phase === 'opening' || state.currentRank) {
        setDeclaredRank(state.currentRank);
      } else {
        setDeclaredRank(null);
      }
    };

    const onBluffResolved = (revealData) => {
      if (!inRoomRef.current) return;
      playSound(revealData.matched ? 'revealTruth' : 'revealLie');
      setReveal(revealData);
    };

    const onGameWon = ({ winnerName, moveCount }) => {
      if (!inRoomRef.current) return;
      playSound(winnerName === playerNameRef.current ? 'win' : 'lose');
      setWinner(winnerName);
      setWinMoveCount(moveCount ?? null);
      setScoresRefresh((k) => k + 1);
      setScreen(SCREENS.WIN);
    };

    const onGameReset = () => {
      if (!inRoomRef.current) return;
      setWinner(null);
      setWinMoveCount(null);
      setGameState(null);
      setReveal(null);
      setChatMessages([]);
      prevGameStateRef.current = null;
      setScreen(SCREENS.LOBBY);
    };

    const onChatMessage = (msg) => {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        if (!chatOpenRef.current && Date.now() - msg.timestamp < 5000) {
          playSound('chat');
        }
        return [...prev, msg];
      });
    };

    const onBluffTooLate = ({ message }) => showToast(message);

    const onRankEnded = ({ reason, nextStarterId }) => {
      const starter =
        playersRef.current.find((p) => p.id === nextStarterId)?.name ?? 'Next player';
      if (reason === 'all_skip') {
        showToast(`Everyone skipped — ${starter} chooses the next rank`);
      } else if (reason === 'bluff') {
        showToast(`Rank ended — ${starter} picks the next rank`);
      }
    };

    const onRoomDeleted = () => {
      inRoomRef.current = false;
      rejoinAttempted.current = false;
      clearRoomSession();
      setRoomCode('');
      setPlayers([]);
      setGameState(null);
      setChatMessages([]);
      setScreen(SCREENS.LANDING);
      setRoomsListRefresh((k) => k + 1);
      showToast('This room was deleted');
    };

    const onPlayerQuit = ({ name }) => {
      if (!inRoomRef.current) return;
      showToast(`${name} left the game`);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('roomUpdate', onRoomUpdate);
    socket.on('gameState', onGameState);
    socket.on('bluffResolved', onBluffResolved);
    socket.on('gameWon', onGameWon);
    socket.on('gameReset', onGameReset);
    socket.on('chatMessage', onChatMessage);
    socket.on('bluffTooLate', onBluffTooLate);
    socket.on('rankEnded', onRankEnded);
    socket.on('roomDeleted', onRoomDeleted);
    socket.on('playerQuit', onPlayerQuit);
    setConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('roomUpdate', onRoomUpdate);
      socket.off('gameState', onGameState);
      socket.off('bluffResolved', onBluffResolved);
      socket.off('gameWon', onGameWon);
      socket.off('gameReset', onGameReset);
      socket.off('chatMessage', onChatMessage);
      socket.off('bluffTooLate', onBluffTooLate);
      socket.off('rankEnded', onRankEnded);
      socket.off('roomDeleted', onRoomDeleted);
      socket.off('playerQuit', onPlayerQuit);
    };
  }, [socket, showToast]);

  useEffect(() => {
    if (authReady && user && connected && !inRoomRef.current) {
      attemptAutoRejoin();
    }
  }, [authReady, user, connected, attemptAutoRejoin]);

  const handleLogin = async (displayName, password) => {
    const data = await apiLogin(displayName, password);
    setUser(data.user);
    setPlayerName(data.user.displayName);
    rejoinAttempted.current = false;
  };

  const handleRegister = async (displayName, password) => {
    const data = await apiRegister(displayName, password);
    setUser(data.user);
    setPlayerName(data.user.displayName);
  };

  const handleLogout = async () => {
    inRoomRef.current = false;
    rejoinAttempted.current = false;
    await apiLogout();
    setUser(null);
    setPlayerName('');
    setRoomCode('');
    setPlayers([]);
    setGameState(null);
    setScreen(SCREENS.LANDING);
    rejoinAttempted.current = false;
  };

  const handleCreate = async (color) => {
    setError('');
    inRoomRef.current = true;
    rejoinAttempted.current = true;
    const res = await emitWithCallback('createRoom', { authToken: getAuthToken() });
    if (res?.error) {
      inRoomRef.current = false;
      rejoinAttempted.current = false;
      setError(res.error);
    } else {
      setPlayerId(res.playerId);
      setPlayerColors({ [res.playerId]: color });
      setRoomCode(res.roomCode);
      setHostId(res.playerId);
      setPlayers([{ id: res.playerId, name: playerName, isHost: true }]);
      saveSession({ roomCode: res.roomCode, playerId: res.playerId });
      setRoomsListRefresh((k) => k + 1);
      setChatMessages([]);
      setScreen(SCREENS.LOBBY);
    }
  };

  const handleStartAI = async (color) => {
    setError('');
    inRoomRef.current = true;
    rejoinAttempted.current = true;
    // AI games are ephemeral — don't persist them for auto-rejoin.
    clearRoomSession();
    const res = await emitWithCallback('startAIGame', { authToken: getAuthToken(), aiCount: 1 });
    if (res?.error) {
      inRoomRef.current = false;
      rejoinAttempted.current = false;
      setError(res.error);
    } else {
      setPlayerId(res.playerId);
      setPlayerColors({ [res.playerId]: color });
      setRoomCode(res.roomCode);
      setHostId(res.playerId);
      setChatMessages([]);
      setScreen(SCREENS.GAME);
    }
  };

  const handleJoin = async (code, color) => {
    setError('');
    inRoomRef.current = true;
    rejoinAttempted.current = true;
    const session = loadSession();
    const res = await emitWithCallback('joinRoom', {
      roomCode: code,
      authToken: getAuthToken(),
      playerId: session?.roomCode === code ? session.playerId : undefined,
    });
    if (res?.error) {
      inRoomRef.current = false;
      rejoinAttempted.current = false;
      setError(res.error);
    } else {
      setPlayerColors((prev) => ({ ...prev, [res.playerId]: color }));
      setRoomCode(res.roomCode);
      setPlayerId(res.playerId);
      saveSession({ roomCode: res.roomCode, playerId: res.playerId });
      if (!res.reconnected) setChatMessages([]);
      setScreen(res.reconnected ? SCREENS.GAME : SCREENS.LOBBY);
    }
  };

  const handleQuit = async () => {
    // Leave the UI immediately — don't wait on the server ack (which used to hang).
    inRoomRef.current = false;
    rejoinAttempted.current = false;
    clearRoomSession();
    setWinner(null);
    setWinMoveCount(null);
    setReveal(null);
    setRoomCode('');
    setPlayers([]);
    setHostId('');
    setPlayerId('');
    setGameState(null);
    setChatMessages([]);
    prevGameStateRef.current = null;
    setScreen(SCREENS.LANDING);
    setRoomsListRefresh((k) => k + 1);
    showToast('You left the room');

    const res = await emitWithCallback('quitGame');
    if (res?.error && res.error !== 'Not in a room') {
      showToast(res.error);
    }
  };

  const handleStart = async () => {
    const res = await emitWithCallback('startGame');
    if (res?.error) showToast(res.error);
    else playSound('deal');
  };

  const handleToggleCard = (index) => {
    playSound('cardSelect');
    setSelectedCards((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handlePlay = async () => {
    const rank = gameState?.phase === 'start_rank'
      ? declaredRank
      : gameState?.currentRank || declaredRank;
    const res = await emitWithCallback('playCards', {
      cardIndexes: selectedCards,
      declaredRank: rank,
    });
    if (res?.error) showToast(res.error);
    else {
      selfActionRef.current = true;
      playSound('cardSelf');
      setSelectedCards([]);
    }
  };

  const handleSkip = async () => {
    const res = await emitWithCallback('skipTurn');
    if (res?.error) showToast(res.error);
    else playSound('skip');
  };

  const handleCallBluff = async () => {
    playSound('bluff');
    const res = await emitWithCallback('callBluff');
    if (res?.error) showToast(res.error);
  };

  const handlePassBluff = async () => {
    const res = await emitWithCallback('passBluff');
    if (res?.error) showToast(res.error);
    else playSound('pass');
  };

  const handlePlayAgain = async () => {
    const res = await emitWithCallback('playAgain');
    if (res?.error) showToast(res.error);
  };

  const handleSendChat = (message) => {
    socket.emit('chatMessage', { message });
  };

  const winPlayers = gameState?.players?.length ? gameState.players : players;

  if (!authReady) {
    return (
      <div className="app">
        <main className="app-main screen screen--landing">
          <p className="landing-tagline">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div ref={appRef} className={`app ${screen === SCREENS.GAME ? 'app--in-game' : ''}`}>
      <header className="app-chrome">
        <div className="app-chrome__brand">
          <span className="app-chrome__logo">Bluff</span>
          <span className="app-chrome__badge">BRSP EDITION</span>
        </div>
        <div className="app-chrome__meta">
          <span className={`app-chrome__live ${connected ? 'app-chrome__live--on' : ''}`}>
            {connected ? 'Live' : 'Offline'}
          </span>
          {user && <span className="app-chrome__user">{user.displayName}</span>}
          {roomCode && <span className="app-chrome__room">{roomCode}</span>}
        </div>
      </header>

      <main className="app-main">
        {screen === SCREENS.LANDING && (
          <Landing
            user={user}
            onLogin={handleLogin}
            onRegister={handleRegister}
            onLogout={handleLogout}
            onCreate={handleCreate}
            onJoin={handleJoin}
            onStartAI={handleStartAI}
            error={error}
            connected={connected}
            roomsRefresh={roomsListRefresh}
          />
        )}

        {screen === SCREENS.LOBBY && (
          <Lobby
            roomCode={roomCode}
            players={players}
            hostId={hostId}
            playerId={playerId}
            playerName={playerName}
            playerColors={playerColors}
            scoresRefresh={scoresRefresh}
            onStart={handleStart}
            onQuit={handleQuit}
          />
        )}

        {screen === SCREENS.GAME && gameState && (
          <GameScreen
            gameState={gameState}
            selectedCards={selectedCards}
            onToggleCard={handleToggleCard}
            declaredRank={declaredRank}
            onSelectRank={setDeclaredRank}
            onPlay={handlePlay}
            onSkip={handleSkip}
            onCallBluff={handleCallBluff}
            onPassBluff={handlePassBluff}
            onQuit={handleQuit}
            chatMessages={chatMessages}
            onSendChat={handleSendChat}
            playerColors={playerColors}
            chatOpenRef={chatOpenRef}
          />
        )}

        {screen === SCREENS.WIN && (
          <WinScreen
            winnerName={winner}
            moveCount={winMoveCount}
            players={winPlayers}
            playerColors={playerColors}
            isHost={hostId === playerId}
            onPlayAgain={handlePlayAgain}
            onQuit={handleQuit}
          />
        )}
      </main>

      <BluffRevealModal
        reveal={reveal}
        players={players.length ? players : gameState?.players ?? []}
        onClose={() => setReveal(null)}
      />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
