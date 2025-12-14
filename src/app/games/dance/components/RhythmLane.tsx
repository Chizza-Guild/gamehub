'use client';

import { useMemo } from 'react';
import { GAME_CONFIG, LANE_POSITIONS } from '../lib/constants';
import type { Note, NoteType } from '../types';

interface RhythmLaneProps {
  lane: NoteType;
  notes: Note[];
  currentTime: number;
}

export function RhythmLane({ lane, notes, currentTime }: RhythmLaneProps) {
  // Filter notes for this lane and calculate positions
  const visibleNotes = useMemo(() => {
    const laneNotes = notes.filter((n) => n.lane === lane);
    const lookAhead = 3000; // Show notes 3 seconds ahead (increased for better visibility)

    return laneNotes
      .filter((note) => {
        const timeUntilHit = note.hitTime - currentTime;
        return timeUntilHit > -500 && timeUntilHit < lookAhead; // Notes stay visible longer after passing
      })
      .map((note) => {
        const timeUntilHit = note.hitTime - currentTime;
        const y =
          GAME_CONFIG.HIT_ZONE_Y -
          (timeUntilHit / 1000) * GAME_CONFIG.NOTE_SPEED;
        return { ...note, y };
      });
  }, [notes, lane, currentTime]);

  const laneIndex = LANE_POSITIONS[lane];

  // Arrow symbols
  const arrowSymbols = {
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
  };

  return (
    <div
      className="relative border-r border-gray-700 overflow-hidden"
      style={{ width: GAME_CONFIG.LANE_WIDTH, height: '100vh' }}
    >
      {/* Hit zone indicator */}
      <div
        className="absolute w-full border-2 border-yellow-400 bg-yellow-400/20 z-10"
        style={{
          top: GAME_CONFIG.HIT_ZONE_Y - 40,
          height: 80,
        }}
      />

      {/* Lane guide arrow */}
      <div
        className="absolute w-full text-center text-4xl text-gray-600 z-10"
        style={{ top: GAME_CONFIG.HIT_ZONE_Y - 10 }}
      >
        {arrowSymbols[lane]}
      </div>

      {/* Notes */}
      {visibleNotes.map((note) => (
        <div
          key={note.id}
          className="absolute flex items-center justify-center text-4xl font-bold bg-blue-500 text-white rounded-lg shadow-lg transition-all"
          style={{
            top: note.y - GAME_CONFIG.NOTE_SIZE / 2,
            left: (GAME_CONFIG.LANE_WIDTH - GAME_CONFIG.NOTE_SIZE) / 2,
            width: GAME_CONFIG.NOTE_SIZE,
            height: GAME_CONFIG.NOTE_SIZE,
          }}
        >
          {arrowSymbols[lane]}
        </div>
      ))}
    </div>
  );
}
