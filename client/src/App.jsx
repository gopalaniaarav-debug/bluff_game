import { useEffect, useState, useCallback, useRef } from 'react';
import { getSocket } from './socket';
import Landing from './components/Landing';
import Lobby from './components/Lobby';
import GameScreen from './components/GameScreen';
import BluffRevealModal from './components/BluffRevealModal';
import WinScreen from './components/WinScreen';

const SCREENS = {
  LANDING: 'landing',
  LOBBY: 'lobby',
  GAME: 'game',
  WIN: 'win',
};

export default function App() {
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

  const socket = getSocket();

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }, []);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onRoomUpdate = (data) => {
      setRoomCode(data.roomCode);
      setPlayers(data.players);
      setHostId(data.hostId);
      setPlayerId((prev) => prev || socket.id);
      if (!data.gameStarted && screenRef.current !== SCREENS.WIN) {
        setScreen(SCREENS.LOBBY);
      }
    };

    const onGameState = (state) => {
      setGameState(state);
      setPlayerId(state.yourId);
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

    const onBluffResolved = (revealData) => setReveal(revealData);

    const onGameWon = ({ winnerName, moveCount }) => {
      setWinner(winnerName);
      setWinMoveCount(moveCount ?? null);
      setScoresRefresh((k) => k + 1);
      setScreen(SCREENS.WIN);
    };

    const onGameReset = () => {
      setWinner(null);
      setWinMoveCount(null);
      setGameState(null);
      setReveal(null);
      setScreen(SCREENS.LOBBY);
    };

    const onChatMessage = (msg) => {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
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
      setRoomCode('');
      setPlayers([]);
      setGameState(null);
      setScreen(SCREENS.LANDING);
      setRoomsListRefresh((k) => k + 1);
      showToast('This room was deleted');
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
    };
  }, [socket, showToast]);

  const emitWithCallback = useCallback(
    (event, data) =>
      new Promise((resolve) => {
        socket.emit(event, data, (response) => resolve(response));
      }),
    [socket]
  );

  const handleCreate = async (name, color) => {
    setError('');
    setPlayerName(name);
    const res = await emitWithCallback('createRoom', { playerName: name });
    if (res?.error) setError(res.error);
    else {
      setPlayerId(socket.id);
      setPlayerColors({ [socket.id]: color });
      setRoomCode(res.roomCode);
      setRoomsListRefresh((k) => k + 1);
      setScreen(SCREENS.LOBBY);
    }
  };

  const handleJoin = async (name, code, color) => {
    setError('');
    setPlayerName(name);
    const res = await emitWithCallback('joinRoom', { roomCode: code, playerName: name });
    if (res?.error) setError(res.error);
    else {
      setPlayerColors((prev) => ({ ...prev, [socket.id]: color }));
      setRoomCode(res.roomCode);
      setScreen(res.reconnected ? SCREENS.GAME : SCREENS.LOBBY);
    }
  };

  const handleStart = async () => {
    const res = await emitWithCallback('startGame');
    if (res?.error) showToast(res.error);
  };

  const handleToggleCard = (index) => {
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
    else setSelectedCards([]);
  };

  const handleSkip = async () => {
    const res = await emitWithCallback('skipTurn');
    if (res?.error) showToast(res.error);
  };

  const handleCallBluff = async () => {
    const res = await emitWithCallback('callBluff');
    if (res?.error) showToast(res.error);
  };

  const handlePassBluff = async () => {
    const res = await emitWithCallback('passBluff');
    if (res?.error) showToast(res.error);
  };

  const handlePlayAgain = async () => {
    const res = await emitWithCallback('playAgain');
    if (res?.error) showToast(res.error);
  };

  const handleSendChat = (message) => {
    socket.emit('chatMessage', { message });
  };

  const winPlayers = gameState?.players?.length ? gameState.players : players;

  return (
    <div className="app">
      <header className="app-chrome">
        <div className="app-chrome__brand">
          <span className="app-chrome__logo">Bluff</span>
          <span className="app-chrome__badge">BRSP EDITION</span>
        </div>
        <div className="app-chrome__meta">
          <span className={`app-chrome__live ${connected ? 'app-chrome__live--on' : ''}`}>
            {connected ? 'Live' : 'Offline'}
          </span>
          {roomCode && <span className="app-chrome__room">{roomCode}</span>}
        </div>
      </header>

      <main className="app-main">
        {screen === SCREENS.LANDING && (
          <Landing
            onCreate={handleCreate}
            onJoin={handleJoin}
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
            chatMessages={chatMessages}
            onSendChat={handleSendChat}
            playerColors={playerColors}
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
