import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env.local file.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10, // Rate limiting for cost control
    },
  },
});

/**
 * Generate or retrieve anonymous player ID from localStorage
 */
export function getPlayerId(): string {
  if (typeof window === 'undefined') return '';

  let playerId = localStorage.getItem('player_id');
  if (!playerId) {
    playerId = `player_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('player_id', playerId);
  }
  return playerId;
}

/**
 * Get player name from localStorage or generate default
 */
export function getPlayerName(): string {
  if (typeof window === 'undefined') return 'Guest';

  let playerName = localStorage.getItem('player_name');
  if (!playerName) {
    playerName = `Guest${Math.floor(Math.random() * 1000)}`;
    localStorage.setItem('player_name', playerName);
  }
  return playerName;
}

/**
 * Set player name in localStorage
 */
export function setPlayerName(name: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('player_name', name);
  }
}
