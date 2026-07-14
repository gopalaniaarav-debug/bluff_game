import { useState, useEffect } from 'react';
import { RANKS, RANK_NAMES, getPlayerColor, getSeatStyle, getTurnHaloStyle } from '../gameUtils';
import { useIsMobile } from '../useMediaQuery';
import CardHand from './CardHand';
import PlayerSeat from './PlayerSeat';
import PlayingCard from './PlayingCard';
import ChatPanel from './ChatPanel';
import HandOverviewOverlay from './HandOverviewOverlay';

export default function GameScreen({
  gameState,
  selectedCards,
  onToggleCard,
  declaredRank,
  onSelectRank,
  onPlay,
  onSkip,
  onCallBluff,
  onPassBluff,
  onQuit,
  chatMessages,
  onSendChat,
  playerColors,
  chatOpenRef,
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const [handOverviewOpen, setHandOverviewOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (chatOpenRef) chatOpenRef.current = chatOpen;
  }, [chatOpen, chatOpenRef]);

  const {
    players,
    playerOrder,
    turnIndex,
    centralPileCount,
    currentRank,
    phase,
    pendingPlayPlayerId,
    pendingPlayCount = 0,
    yourHand,
    yourId,
    bluffPasses = [],
    consecutiveSkips = 0,
    challengeAllowed = true,
  } = gameState;

  const cardWord = (n) => `${n} card${n === 1 ? '' : 's'}`;

  const currentPlayerId = playerOrder[turnIndex];
  const isMyTurn = currentPlayerId === yourId;
  const isOpening = phase === 'opening';
  const isStartRank = phase === 'start_rank';
  const isBluffWindow = phase === 'bluff_window';
  const isPlaying = phase === 'playing';
  const iJustPlayed = isBluffWindow && pendingPlayPlayerId === yourId;
  const inChallengeWindow =
    isBluffWindow && pendingPlayPlayerId !== yourId && pendingPlayPlayerId !== null;
  const canCallBluff = inChallengeWindow && challengeAllowed;
  const hasPassed = bluffPasses.includes(yourId);
  const canPassBluff = inChallengeWindow && !hasPassed;
  const canActOnTurn = isMyTurn && (isOpening || isPlaying || isStartRank);
  const canSkip = isMyTurn && isPlaying && currentRank;

  const aceSpadesIdx = yourHand.findIndex((c) => c.rank === 'A' && c.suit === '♠');
  const mustIncludeAce = isOpening && aceSpadesIdx !== -1;
  const aceSelected = mustIncludeAce && selectedCards.includes(aceSpadesIdx);

  const rankLocked = isOpening || isPlaying;
  const rankChoices = isStartRank ? RANKS : rankLocked && currentRank ? [currentRank] : RANKS;

  const opponents = players.filter((p) => p.id !== yourId);
  const currentPlayer = players.find((p) => p.id === currentPlayerId);
  const pendingPlayer = players.find((p) => p.id === pendingPlayPlayerId);
  const rankName = currentRank ? RANK_NAMES[currentRank] : null;
  const declaredName = declaredRank ? RANK_NAMES[declaredRank] : null;

  const turnSeatIndex = opponents.findIndex((p) => p.id === currentPlayerId);
  const haloVisible = turnSeatIndex >= 0 && (isPlaying || isOpening || isStartRank);

  const selCount = selectedCards.length;
  const needsRank = isStartRank ? declaredRank : rankLocked ? currentRank : declaredRank;
  const playEnabled = selCount > 0 && canActOnTurn && needsRank && (!mustIncludeAce || aceSelected);
  const playLabel = !canActOnTurn
    ? 'Not your turn'
    : isStartRank && !declaredRank
      ? 'Choose a rank'
      : mustIncludeAce && !aceSelected
        ? 'Include Ace of Spades'
        : selCount
          ? `Play ${selCount} as ${RANK_NAMES[needsRank] || needsRank}`
          : 'Select cards';

  let bannerPill = `${currentPlayer?.name ?? 'Someone'} is playing…`;
  let bannerSub = `Waiting on ${currentPlayer?.name ?? 'next player'}`;
  let bannerPillClass = '';

  if (canCallBluff) {
    bannerPill = 'Smell a lie?';
    bannerSub = hasPassed
      ? 'You passed — waiting on others to call or pass'
      : `${pendingPlayer?.name} put down ${cardWord(pendingPlayCount)} claiming ${RANK_NAMES[currentRank] || currentRank} — call bluff or pass`;
    bannerPillClass = 'game-banner__pill--challenge';
  } else if (canPassBluff) {
    bannerPill = 'Accept the play?';
    bannerSub = `${pendingPlayer?.name} played ${cardWord(pendingPlayCount)} — pass to continue`;
    bannerPillClass = 'game-banner__pill--challenge';
  } else if (iJustPlayed) {
    bannerPill = 'Cards played';
    bannerSub = `You put down ${cardWord(pendingPlayCount)} — others may call your bluff…`;
  } else if (isMyTurn && isOpening) {
    bannerPill = 'OPEN THE GAME';
    bannerSub = 'Play Ace of Spades to start — extra cards may bluff';
    bannerPillClass = 'game-banner__pill--yours';
  } else if (isMyTurn && isStartRank) {
    bannerPill = 'NEW RANK';
    bannerSub = 'Choose any rank and play — cards may bluff';
    bannerPillClass = 'game-banner__pill--yours';
  } else if (isMyTurn && isPlaying) {
    bannerPill = 'YOUR TURN';
    bannerSub = `Play ${rankName ?? 'cards'} or skip`;
    bannerPillClass = 'game-banner__pill--yours';
  } else if (isBluffWindow && pendingPlayer) {
    bannerPill = `${pendingPlayer.name} just played`;
    bannerSub = `Put down ${cardWord(pendingPlayCount)} — waiting for challenges…`;
  } else if (currentRank) {
    bannerSub = `${rankName} rank · ${consecutiveSkips} skip${consecutiveSkips === 1 ? '' : 's'} this round`;
  }

  return (
    <div className={`game-screen ${isMobile ? 'game-screen--mobile' : ''} ${chatOpen ? 'game-screen--chat-open' : ''}`}>
      <div className="game-banner">
        <div className={`game-banner__pill ${bannerPillClass}`}>{bannerPill}</div>
        <div className="game-banner__sub">{bannerSub}</div>
      </div>

      <div className="game-body">
        <div className="game-felt">
          {haloVisible && (
            <div className="turn-halo" style={getTurnHaloStyle(turnSeatIndex, isMobile)} />
          )}

          <div className="game-oval">
            <div className="game-oval__ring" />

            {opponents.map((p, i) => {
              const isActive = p.id === currentPlayerId && !isBluffWindow;
              const isPending = p.id === pendingPlayPlayerId && isBluffWindow;
              let tag = null;
              if (isPending && currentRank) {
                tag = `played ${cardWord(pendingPlayCount)} · claims ${rankName}`;
              }
              return (
                <PlayerSeat
                  key={p.id}
                  player={p}
                  color={playerColors[p.id] || getPlayerColor(p.id, i)}
                  isActive={isActive}
                  isPending={isPending}
                  tag={tag}
                  position={getSeatStyle(i, opponents.length, isMobile)}
                />
              );
            })}

            <div className="center-cluster">
              {!isBluffWindow && currentPlayer && (
                <div className={`center-cluster__turn ${isMyTurn ? 'center-cluster__turn--yours' : ''}`}>
                  {isMyTurn ? 'Your turn' : `${currentPlayer.name}'s turn`}
                </div>
              )}

              {pendingPlayer && isBluffWindow && currentRank && (
                <div className="center-cluster__claim">
                  {pendingPlayer.name} played <strong>{cardWord(pendingPlayCount)}</strong> · claims <strong>{rankName}</strong>
                </div>
              )}

              <div className="center-cluster__row">
                <div className="pile-stack">
                  {centralPileCount > 0 ? (
                    <>
                      <div className="pile-stack__card" style={{ transform: 'rotate(-7deg)' }}>
                        <PlayingCard faceDown size="md" />
                      </div>
                      <div className="pile-stack__card" style={{ transform: 'rotate(3deg) translate(3px,-3px)' }}>
                        <PlayingCard faceDown size="md" />
                      </div>
                      <div className="pile-stack__card" style={{ transform: 'rotate(-1deg) translate(-2px,-6px)' }}>
                        <PlayingCard faceDown size="md" />
                      </div>
                      <span className="pile-stack__badge">{centralPileCount}</span>
                    </>
                  ) : (
                    <div className="pile-stack__empty">Empty</div>
                  )}
                </div>

                {currentRank && (
                  <div className="legal-rank-token">
                    <span className="legal-rank-token__label">Current rank</span>
                    <span className="legal-rank-token__rank">{currentRank}</span>
                    <span className="legal-rank-token__hint">
                      {isStartRank ? 'pick any rank' : 'match it — or lie'}
                    </span>
                  </div>
                )}
              </div>

              {canCallBluff && !isMobile && (
                <button type="button" className="btn-bluff btn-bluff--center" onClick={onCallBluff}>
                  Call Bluff!
                </button>
              )}
              {canPassBluff && !isMobile && (
                <button type="button" className="btn-pass btn-pass--center" onClick={onPassBluff}>
                  Pass
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {chatOpen && (
        <button
          type="button"
          className="chat-backdrop"
          onClick={() => setChatOpen(false)}
          aria-label="Close chat"
        />
      )}

      <aside className={`chat-drawer ${chatOpen ? 'chat-drawer--open' : ''}`} aria-hidden={!chatOpen}>
        <ChatPanel messages={chatMessages} onSend={onSendChat} onClose={() => setChatOpen(false)} />
      </aside>

      <div className="control-deck">
        <div className="control-deck__top">
          <button
            type="button"
            className={`chat-toggle ${chatOpen ? 'chat-toggle--active' : ''}`}
            onClick={() => setChatOpen((o) => !o)}
            aria-expanded={chatOpen}
            aria-label={chatOpen ? 'Hide chat' : 'Show chat'}
          >
            <span className="chat-toggle__icon" aria-hidden>💬</span>
            <span className="chat-toggle__label">{chatOpen ? 'Hide chat' : 'Chat'}</span>
            {!chatOpen && chatMessages.length > 0 && (
              <span className="chat-toggle__badge">{chatMessages.length}</span>
            )}
          </button>
          <div className="hand-count" title="Cards in your hand">
            <span className="hand-count__icon" aria-hidden>🃏</span>
            <span className="hand-count__num">{yourHand.length}</span>
            <span className="hand-count__label">in hand</span>
          </div>
          <button type="button" className="btn btn-outline btn-sm game-quit-btn" onClick={onQuit}>
            Quit
          </button>
        </div>

        <CardHand
          cards={yourHand}
          selectedCards={selectedCards}
          onToggleCard={onToggleCard}
          disabled={!canActOnTurn}
          compact={isMobile}
        />

        <div className="control-deck__hand-tools">
          <button
            type="button"
            className="btn-show-cards"
            onClick={() => setHandOverviewOpen(true)}
          >
            Show all cards
          </button>
        </div>

        <div className="control-deck__actions">
          {inChallengeWindow ? (
            <>
              {canCallBluff && (
                <button type="button" className="btn-bluff btn-bluff--deck" onClick={onCallBluff}>
                  Call Bluff!
                </button>
              )}
              {canPassBluff && (
                <button type="button" className="btn-pass" onClick={onPassBluff}>
                  Pass
                </button>
              )}
              <span className="control-deck__hint">
                {hasPassed
                  ? `Waiting on others (${bluffPasses.length} passed)`
                  : canCallBluff
                    ? `Challenge ${pendingPlayer?.name}'s claim`
                    : `Pass to let ${pendingPlayer?.name}'s play stand`}
              </span>
            </>
          ) : (
            <>
              <span className="control-deck__label">
                {isStartRank ? 'Choose rank' : isOpening ? 'Rank (Ace)' : 'Claim rank'}
              </span>
              <div className="rank-chips">
                {rankChoices.map((rank) => {
                  const active = (declaredRank || currentRank) === rank;
                  const selectable = isStartRank && isMyTurn;
                  return (
                    <button
                      key={rank}
                      type="button"
                      className={`rank-chip ${active ? 'rank-chip--active' : ''} ${selectable && !active ? 'rank-chip--legal' : ''}`}
                      onClick={() => onSelectRank(rank)}
                      disabled={!selectable}
                    >
                      {rank}
                    </button>
                  );
                })}
              </div>
              <div className="control-deck__row">
                <button
                  type="button"
                  className={`btn-play ${playEnabled ? 'btn-play--on' : 'btn-play--off'}`}
                  disabled={!playEnabled}
                  onClick={onPlay}
                >
                  {playLabel}
                </button>
                {canSkip && (
                  <button type="button" className="btn-skip" onClick={onSkip}>
                    Skip
                  </button>
                )}
              </div>
              {isOpening && isMyTurn && (
                <span className="control-deck__hint">Must include Ace of Spades — honest</span>
              )}
              {isStartRank && isMyTurn && declaredName && (
                <span className="control-deck__hint">Starting {declaredName} rank — cards may bluff</span>
              )}
            </>
          )}
        </div>
      </div>

      <HandOverviewOverlay
        open={handOverviewOpen}
        cards={yourHand}
        selectedCards={selectedCards}
        onToggleCard={onToggleCard}
        disabled={!canActOnTurn}
        onClose={() => setHandOverviewOpen(false)}
      />
    </div>
  );
}
