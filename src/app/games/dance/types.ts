export type NoteType = 'up' | 'down' | 'left' | 'right';

export type JudgementType = 'perfect' | 'great' | 'good' | 'miss';

export interface Note {
  id: string;
  lane: NoteType;
  hitTime: number; // Milliseconds from start
}

export interface NoteChart {
  id: string;
  name: string;
  bpm: number;
  duration: number;
  difficulty: 'easy' | 'medium' | 'hard';
  notes: Note[];
  musicUrl: string;
}

export interface HitResult {
  noteId: string;
  judgement: JudgementType;
  timingError: number; // Milliseconds off from perfect
  timestamp: number;
}

export interface PlayerScore {
  playerId: string;
  playerName: string;
  score: number;
  accuracy: number;
  combo: number;
  maxCombo: number;
  judgements: {
    perfect: number;
    great: number;
    good: number;
    miss: number;
  };
}

export interface GamePhase {
  phase: 'lobby' | 'countdown' | 'playing' | 'results';
  startTime?: number; // Synced start time for gameplay
}
