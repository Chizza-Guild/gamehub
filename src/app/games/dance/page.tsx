'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase, getPlayerId, getPlayerName, type Inserts, type Updates } from '@/lib/supabase/client';
import { useGameSession } from '@/hooks/useGameSession';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { SyncManager } from '@/lib/multiplayer/SyncManager';
import { RealtimeManager } from '@/lib/supabase/realtime';
import { RhythmLane } from './components/RhythmLane';
import { ScoreDisplay } from './components/ScoreDisplay';
import { Countdown } from './components/Countdown';
import { generateTestChart } from './lib/notePatterns';
import {
  calculateJudgement,
  calculateHitScore,
  calculateAccuracy,
} from './lib/scoring';
import { GAME_CONFIG } from './lib/constants';
import type { NoteChart, PlayerScore, NoteType } from './types';

function DodoReMiGameContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lobbyCode = searchParams.get('code');

  const [gamePhase, setGamePhase] = useState<
    'lobby' | 'countdown' | 'playing' | 'results'
  >('lobby');
  const [chart, setChart] = useState<NoteChart | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [scores, setScores] = useState<Map<string, PlayerScore>>(new Map());
  const [countdownStartTime, setCountdownStartTime] = useState(0);

  const {
    session,
    players,
    loading,
    joinSession,
    setReady,
    updateScore,
  } = useGameSession(lobbyCode);
  const { initialized, initialize, stop, getCurrentTime } = useAudioEngine();

  const syncManagerRef = useRef(new SyncManager());
  const realtimeRef = useRef<RealtimeManager | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const scoreUpdateTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const gameStartTimeRef = useRef<number>(0);

  const localPlayerId = getPlayerId();
  const localPlayerName = getPlayerName();

  // Initialize game
  useEffect(() => {
    // Create or join lobby
    if (!lobbyCode) {
      createNewLobby();
    } else {
      joinSession();
    }

    // Load chart
    const testChart = generateTestChart();
    setChart(testChart);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (scoreUpdateTimeoutRef.current) {
        clearTimeout(scoreUpdateTimeoutRef.current);
      }
      stop();
    };
  }, []);

  // Initialize/update scores from players list
  useEffect(() => {
    if (players.length === 0) return;

    console.log('Players data updated:', players);

    setScores((prevScores) => {
      const newScores = new Map(prevScores);

      // Add/update all players
      players.forEach((player) => {
        console.log('Processing player:', player.player_name, 'Score:', player.score);

        // If player doesn't exist in scores, create initial score
        if (!newScores.has(player.player_id)) {
          newScores.set(player.player_id, {
            playerId: player.player_id,
            playerName: player.player_name,
            score: player.score || 0,
            accuracy: player.accuracy || 0,
            combo: player.combo || 0,
            maxCombo: player.max_combo || 0,
            judgements: {
              perfect: player.perfect_count || 0,
              great: player.great_count || 0,
              good: player.good_count || 0,
              miss: player.miss_count || 0,
            },
          });
        } else {
          // Update existing player's synced data from database
          const existing = newScores.get(player.player_id)!;

          // Only update if this is not the local player (local player updates immediately)
          if (player.player_id !== localPlayerId) {
            newScores.set(player.player_id, {
              ...existing,
              score: player.score || existing.score,
              accuracy: player.accuracy || existing.accuracy,
              combo: player.combo || existing.combo,
              maxCombo: player.max_combo || existing.maxCombo,
              judgements: {
                perfect: player.perfect_count || existing.judgements.perfect,
                great: player.great_count || existing.judgements.great,
                good: player.good_count || existing.judgements.good,
                miss: player.miss_count || existing.judgements.miss,
              },
            });
          }
        }
      });

      return newScores;
    });
  }, [players]);

  // Watch for lobby status changes (for non-host players)
  useEffect(() => {
    if (!session) return;

    const lobbyInfo = session.lobby_info as any;
    console.log('Lobby status changed:', lobbyInfo?.status);

    if (lobbyInfo?.status === 'countdown' && gamePhase === 'lobby') {
      // Calculate when the game should start
      const startTime = lobbyInfo.started_at
        ? new Date(lobbyInfo.started_at).getTime() + GAME_CONFIG.COUNTDOWN_DURATION
        : Date.now() + GAME_CONFIG.COUNTDOWN_DURATION;

      setGamePhase('countdown');
      setCountdownStartTime(startTime);

      // Initialize audio
      if (!initialized) {
        initialize();
      }
    }
  }, [session]);

  // Setup realtime when lobby exists
  useEffect(() => {
    if (!lobbyCode) return;

    realtimeRef.current = new RealtimeManager();

    realtimeRef.current.connect({
      sessionId: lobbyCode,
      onBroadcast: (payload) => {
        const { event, data } = payload;
        console.log('Received broadcast:', event, data);

        switch (event) {
          case 'game-start':
            setGamePhase('countdown');
            setCountdownStartTime(data.startTime);
            if (!initialized) {
              initialize();
            }
            break;
          case 'score-update':
            setScores((prev) => {
              const newScores = new Map(prev);
              newScores.set(data.playerId, data.score);
              return newScores;
            });
            break;
        }
      },
    });

    return () => {
      realtimeRef.current?.disconnect();
    };
  }, [lobbyCode, initialized, initialize]);

  // Game loop
  useEffect(() => {
    if (gamePhase !== 'playing') return;

    function gameLoop() {
      // Calculate elapsed time since game start
      const time = Date.now() - gameStartTimeRef.current;
      setCurrentTime(time);

      // Check for auto-miss notes
      checkMissedNotes(time);

      // Check if game is over
      if (chart && time > chart.duration) {
        setGamePhase('results');
        return;
      }

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    }

    gameLoop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gamePhase, chart]);

  // Keyboard input
  useEffect(() => {
    if (gamePhase !== 'playing') return;

    function handleKeyPress(e: KeyboardEvent) {
      const lane = (Object.entries(GAME_CONFIG.KEY_BINDINGS) as [string, readonly string[]][]).find(([_, keys]) =>
        (keys as readonly string[]).includes(e.key)
      )?.[0] as NoteType | undefined;

      if (lane) {
        e.preventDefault();
        handleNoteHit(lane);
      }
    }

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gamePhase, currentTime, chart]);

  async function createNewLobby() {
    // Generate a random 6-character lobby code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const insertData = {
      game_type: 'dance',
      code,
      lobby_info: {
        status: 'lobby',
        host_id: localPlayerId,
        max_players: GAME_CONFIG.MAX_PLAYERS,
        players: [],
      },
    };

    const { data, error } = await supabase
      .from('lobbies')
      // @ts-expect-error - Supabase type inference issue with Database generic
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Failed to create lobby:', error);
      return;
    }

    router.push(`/games/dance?code=${code}`);
  }

  function handleCountdownComplete() {
    console.log('Countdown complete! Starting game...');
    gameStartTimeRef.current = Date.now();
    setGamePhase('playing');
  }

  function handleNoteHit(lane: NoteType) {
    if (!chart) return;

    const now = currentTime;
    const laneNotes = chart.notes.filter((n) => n.lane === lane);

    // Find closest note within timing window
    let closestNote = null;
    let closestError = Infinity;

    for (const note of laneNotes) {
      const error = now - note.hitTime;
      if (
        Math.abs(error) < Math.abs(closestError) &&
        Math.abs(error) <= GAME_CONFIG.TIMING_WINDOWS.GOOD
      ) {
        closestNote = note;
        closestError = error;
      }
    }

    if (closestNote) {
      const judgement = calculateJudgement(closestError);
      processHit(closestNote.id, judgement, closestError);

      // Remove note from chart
      setChart((prev) =>
        prev
          ? {
              ...prev,
              notes: prev.notes.filter((n) => n.id !== closestNote!.id),
            }
          : null
      );
    }
  }

  function processHit(
    noteId: string,
    judgement: string,
    timingError: number
  ) {
    setScores((prev) => {
      const newScores = new Map(prev);
      const playerScore = newScores.get(localPlayerId)!;

      // Update combo
      const newCombo = judgement === 'miss' ? 0 : playerScore.combo + 1;
      const maxCombo = Math.max(playerScore.maxCombo, newCombo);

      // Update judgements
      const judgements = { ...playerScore.judgements };
      judgements[judgement as keyof typeof judgements]++;

      // Calculate score
      const hitScore = calculateHitScore(judgement as any, playerScore.combo);
      const newScore = playerScore.score + hitScore;

      // Calculate accuracy
      const accuracy = calculateAccuracy(
        judgements.perfect,
        judgements.great,
        judgements.good,
        judgements.miss
      );

      const updated = {
        ...playerScore,
        score: newScore,
        accuracy,
        combo: newCombo,
        maxCombo,
        judgements,
      };

      newScores.set(localPlayerId, updated);

      // Debounced score sync to database
      if (scoreUpdateTimeoutRef.current) {
        clearTimeout(scoreUpdateTimeoutRef.current);
      }
      scoreUpdateTimeoutRef.current = setTimeout(() => {
        updateScore(newScore, accuracy, newCombo, maxCombo, judgements);
      }, 50); // Very fast updates for near real-time sync

      return newScores;
    });
  }

  function checkMissedNotes(time: number) {
    if (!chart) return;

    const missThreshold = GAME_CONFIG.TIMING_WINDOWS.GOOD;
    const missedNotes = chart.notes.filter(
      (note) => time - note.hitTime > missThreshold
    );

    if (missedNotes.length > 0) {
      missedNotes.forEach((note) => {
        processHit(note.id, 'miss', 999);
      });

      // Remove missed notes
      setChart((prev) =>
        prev
          ? {
              ...prev,
              notes: prev.notes.filter((n) => !missedNotes.includes(n)),
            }
          : null
      );
    }
  }

  async function handleStartGame() {
    if (!lobbyCode || !session) return;

    console.log('Host starting game...');

    // Synchronize clocks
    await syncManagerRef.current.synchronize(async () => {
      return Date.now(); // In production, get from server
    });

    // Calculate start time (3 seconds from now in synced time)
    const syncedStartTime =
      syncManagerRef.current.now() + GAME_CONFIG.COUNTDOWN_DURATION;

    console.log('Broadcasting game start with time:', syncedStartTime);

    // Broadcast start event
    realtimeRef.current?.broadcast('game-start', {
      startTime: syncedStartTime,
    });

    // Update lobby status (this triggers other players via database subscription)
    const currentInfo = session.lobby_info as any;
    const updatedInfo = {
      ...currentInfo,
      status: 'countdown',
      started_at: new Date().toISOString(),
    };

    await supabase
      .from('lobbies')
      // @ts-expect-error - Supabase type inference issue with Database generic
      .update({ lobby_info: updatedInfo })
      .eq('id', session.id);

    console.log('Lobby status updated to countdown');

    // Start locally for the host
    setGamePhase('countdown');
    setCountdownStartTime(syncedStartTime);

    if (!initialized) {
      await initialize();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-2xl">Loading...</div>
      </div>
    );
  }

  if (gamePhase === 'lobby') {
    return (
      <div className="container mx-auto p-8 min-h-screen bg-gray-900 text-white">
        <h1 className="text-4xl font-bold mb-8">Dodo Re Mi - Lobby</h1>

        <div className="grid grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl mb-4">
              Players ({players.length}/{GAME_CONFIG.MAX_PLAYERS})
            </h2>
            <div className="space-y-2">
              {players.map((player) => (
                <div
                  key={player.player_id}
                  className="p-3 bg-gray-800 rounded flex justify-between items-center"
                >
                  <span>{player.player_name}</span>
                  <span
                    className={
                      player.is_ready ? 'text-green-400' : 'text-gray-400'
                    }
                  >
                    {player.is_ready ? '✓ Ready' : 'Not Ready'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-2xl mb-4">Song: {chart?.name}</h2>
            <div className="space-y-4">
              <div className="p-4 bg-gray-800 rounded">
                <p className="text-gray-400 mb-2">Controls:</p>
                <p>Arrow Keys or WASD to hit notes</p>
                <p>Hit notes when they reach the target zone!</p>
              </div>

              <button
                onClick={() => setReady(true)}
                className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold transition"
              >
                Ready
              </button>

              {(session?.lobby_info as any)?.host_id === localPlayerId && (
                <button
                  onClick={handleStartGame}
                  disabled={
                    players.filter((p) => p.is_ready).length <
                    GAME_CONFIG.MIN_PLAYERS
                  }
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Start Game
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gamePhase === 'countdown') {
    return (
      <Countdown
        startTime={countdownStartTime}
        duration={GAME_CONFIG.COUNTDOWN_DURATION}
        onComplete={handleCountdownComplete}
      />
    );
  }

  if (gamePhase === 'playing' && chart) {
    const lanes: NoteType[] = ['left', 'down', 'up', 'right'];

    return (
      <div className="h-screen flex bg-gray-900">
        {/* Game area */}
        <div className="flex-1 relative">
          <div className="flex h-full">
            {lanes.map((lane) => (
              <RhythmLane
                key={lane}
                lane={lane}
                notes={chart.notes}
                currentTime={currentTime}
              />
            ))}
          </div>
        </div>

        {/* Sidebar with scores */}
        <div className="w-80 bg-gray-950 p-4 overflow-y-auto">
          <h2 className="text-xl font-bold mb-4 text-white">Scores</h2>
          <div className="space-y-2">
            {Array.from(scores.values())
              .sort((a, b) => b.score - a.score)
              .map((score) => (
                <ScoreDisplay
                  key={score.playerId}
                  score={score}
                  isLocalPlayer={score.playerId === localPlayerId}
                />
              ))}
          </div>

          {/* Current combo display */}
          <div className="mt-4 p-4 bg-gray-900 rounded-lg">
            <div className="text-center">
              <div className="text-gray-400 text-sm">Current Combo</div>
              <div className="text-4xl font-bold text-yellow-400">
                {scores.get(localPlayerId)?.combo || 0}x
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gamePhase === 'results') {
    return (
      <div className="container mx-auto p-8 min-h-screen bg-gray-900 text-white">
        <h1 className="text-4xl font-bold mb-8 text-center">Results</h1>

        <div className="max-w-2xl mx-auto space-y-4">
          {Array.from(scores.values())
            .sort((a, b) => b.score - a.score)
            .map((score, index) => (
              <div
                key={score.playerId}
                className={`p-6 rounded-lg ${
                  index === 0
                    ? 'bg-yellow-600 border-4 border-yellow-400'
                    : 'bg-gray-800'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl font-bold">#{index + 1}</span>
                    <span className="text-2xl">{score.playerName}</span>
                    {index === 0 && <span className="text-2xl">🏆</span>}
                  </div>
                  <span className="text-3xl font-mono">
                    {score.score.toLocaleString()}
                  </span>
                </div>
                <ScoreDisplay
                  score={score}
                  isLocalPlayer={score.playerId === localPlayerId}
                />
              </div>
            ))}
        </div>

        <div className="text-center mt-8">
          <button
            onClick={() => {
              // Full page reload to create new session
              window.location.href = '/games/dance';
            }}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-xl transition"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default function DodoReMiGame() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-2xl">Loading game...</div>
      </div>
    }>
      <DodoReMiGameContent />
    </Suspense>
  );
}
