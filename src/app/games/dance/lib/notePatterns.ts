import type { NoteChart, Note, NoteType } from '../types';

/**
 * Generate a simple test chart for testing
 * In production, load charts from JSON files or server
 */
export function generateTestChart(): NoteChart {
  const notes: Note[] = [];
  const bpm = 120;
  const beatDuration = 60000 / bpm; // Milliseconds per beat (500ms)

  // Simple pattern: alternating arrows every beat
  const pattern: NoteType[] = ['left', 'down', 'up', 'right'];

  // Generate notes for ~30 seconds of gameplay
  // Starting at beat 4 (2000ms) to allow for countdown
  // Ending at beat 64 (32000ms) for a 30 second song
  for (let beat = 4; beat < 64; beat++) {
    const lane = pattern[beat % pattern.length];
    notes.push({
      id: `note_${beat}`,
      lane,
      hitTime: beat * beatDuration,
    });
  }

  return {
    id: 'test_chart_1',
    name: 'Test Pattern',
    bpm,
    duration: 34000, // 34 seconds total (notes end at 32s, give 2s buffer)
    difficulty: 'easy',
    notes,
    musicUrl: '/music/test-track.mp3', // Placeholder
  };
}

/**
 * Create a more complex chart with different patterns
 */
export function generateMediumChart(): NoteChart {
  const notes: Note[] = [];
  const bpm = 140;
  const beatDuration = 60000 / bpm;

  // More complex pattern with eighth notes
  for (let i = 0; i < 64; i++) {
    const beat = i * 0.5 + 4; // Start at beat 4, half-beat intervals
    const lanes: NoteType[] = ['left', 'down', 'up', 'right'];

    notes.push({
      id: `note_${i}`,
      lane: lanes[i % 4],
      hitTime: beat * beatDuration,
    });
  }

  return {
    id: 'medium_chart_1',
    name: 'Medium Challenge',
    bpm,
    duration: 35000,
    difficulty: 'medium',
    notes,
    musicUrl: '/music/medium-track.mp3',
  };
}

/**
 * Create a hard chart with complex patterns
 */
export function generateHardChart(): NoteChart {
  const notes: Note[] = [];
  const bpm = 160;
  const beatDuration = 60000 / bpm;

  // Complex pattern with sixteenth notes and varying lanes
  const lanes: NoteType[] = ['left', 'down', 'up', 'right'];

  for (let i = 0; i < 128; i++) {
    const beat = i * 0.25 + 4; // Sixteenth notes
    const laneIndex = Math.floor(Math.random() * 4);

    notes.push({
      id: `note_${i}`,
      lane: lanes[laneIndex],
      hitTime: beat * beatDuration,
    });
  }

  // Sort by hit time
  notes.sort((a, b) => a.hitTime - b.hitTime);

  return {
    id: 'hard_chart_1',
    name: 'Hard Challenge',
    bpm,
    duration: 30000,
    difficulty: 'hard',
    notes,
    musicUrl: '/music/hard-track.mp3',
  };
}
