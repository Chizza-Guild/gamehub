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
  >('countdown');
  const [chart, setChart] = useState<NoteChart | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [scores, setScores] = useState<Map<string, PlayerScore>>(new Map());
  const [countdownStartTime, setCountdownStartTime] = useState(0);

  const { initialized, initialize, stop, getCurrentTime } = useAudioEngine();

  const syncManagerRef = useRef(new SyncManager());
  const realtimeRef = useRef<RealtimeManager | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const scoreUpdateTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const gameStartTimeRef = useRef<number>(0);
  const gameChannelRef = useRef<any>(null);

  const localPlayerId = getPlayerId();
  const localPlayerName = getPlayerName();

  // Initialize game
  useEffect(() => {
    if (!lobbyCode) {
      console.error('No lobby code provided');
      return;
    }

    // Load chart
    const testChart = generateTestChart();
    setChart(testChart);

    // Start countdown immediately
    const startTime = Date.now() + GAME_CONFIG.COUNTDOWN_DURATION;
    setCountdownStartTime(startTime);

    // Initialize audio
    initialize();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (scoreUpdateTimeoutRef.current) {
        clearTimeout(scoreUpdateTimeoutRef.current);
      }
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize local player score
  useEffect(() => {
    if (!localPlayerId || !localPlayerName) return;

    setScores((prevScores) => {
      if (prevScores.has(localPlayerId)) return prevScores;

      const newScores = new Map(prevScores);
      newScores.set(localPlayerId, {
        playerId: localPlayerId,
        playerName: localPlayerName,
        score: 0,
        accuracy: 0,
        combo: 0,
        maxCombo: 0,
        judgements: {
          perfect: 0,
          great: 0,
          good: 0,
          miss: 0,
        },
      });
      return newScores;
    });
  }, [localPlayerId, localPlayerName]);

  // Setup realtime for multiplayer score syncing
  useEffect(() => {
    if (!lobbyCode) return;

    const gameChannel = supabase
      .channel(`game:${lobbyCode}`)
      .on('broadcast', { event: 'score-update' }, (payload) => {
        const { playerId, playerName, scoreData } = payload.payload;

        // Don't update our own score from broadcasts (we update it locally)
        if (playerId === localPlayerId) return;

        setScores((prev) => {
          const newScores = new Map(prev);
          newScores.set(playerId, {
            playerId,
            playerName,
            ...scoreData,
          });
          return newScores;
        });
      })
      .on('broadcast', { event: 'player-joined' }, (payload) => {
        const { playerId, playerName } = payload.payload;

        setScores((prev) => {
          if (prev.has(playerId)) return prev;

          const newScores = new Map(prev);
          newScores.set(playerId, {
            playerId,
            playerName,
            score: 0,
            accuracy: 0,
            combo: 0,
            maxCombo: 0,
            judgements: {
              perfect: 0,
              great: 0,
              good: 0,
              miss: 0,
            },
          });
          return newScores;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Store channel ref for broadcasting
          gameChannelRef.current = gameChannel;

          // Announce our presence to other players
          await gameChannel.send({
            type: 'broadcast',
            event: 'player-joined',
            payload: {
              playerId: localPlayerId,
              playerName: localPlayerName,
            },
          });
        }
      });

    return () => {
      gameChannel.unsubscribe();
      gameChannelRef.current = null;
    };
  }, [lobbyCode, localPlayerId, localPlayerName]);



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

      // Broadcast score update to other players
      if (gameChannelRef.current) {
        gameChannelRef.current.send({
          type: 'broadcast',
          event: 'score-update',
          payload: {
            playerId: localPlayerId,
            playerName: localPlayerName,
            scoreData: {
              score: newScore,
              accuracy,
              combo: newCombo,
              maxCombo,
              judgements,
            },
          },
        });
      }

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
            onClick={() => router.push(`/lobby/${lobbyCode}`)}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-xl transition"
          >
            Return to Lobby
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
