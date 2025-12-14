'use client';

import { useState, useEffect } from 'react';
import { supabase, getPlayerId, getPlayerName } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';

type GameSession = Database['public']['Tables']['game_sessions']['Row'];
type GamePlayer = Database['public']['Tables']['game_players']['Row'];

export function useGameSession(sessionId: string | null) {
  const [session, setSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    let mounted = true;

    // Fetch initial data
    async function fetchSession() {
      try {
        const { data: sessionData, error: sessionError } = await supabase
          .from('game_sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (sessionError) throw sessionError;

        const { data: playersData, error: playersError } = await supabase
          .from('game_players')
          .select('*')
          .eq('session_id', sessionId)
          .order('joined_at', { ascending: true });

        if (playersError) throw playersError;

        if (mounted) {
          setSession(sessionData);
          setPlayers(playersData || []);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to load session'
          );
          setLoading(false);
        }
      }
    }

    fetchSession();

    // Subscribe to session changes
    const sessionChannel = supabase
      .channel(`session:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.new) {
            setSession(payload.new as GameSession);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_players',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          console.log('Player data changed:', payload);
          // Refetch players on any change
          fetchPlayers();
        }
      )
      .subscribe((status) => {
        console.log('Game session subscription status:', status);
      });

    async function fetchPlayers() {
      const { data } = await supabase
        .from('game_players')
        .select('*')
        .eq('session_id', sessionId)
        .order('joined_at', { ascending: true });

      if (mounted && data) {
        setPlayers(data);
      }
    }

    return () => {
      mounted = false;
      sessionChannel.unsubscribe();
    };
  }, [sessionId]);

  const joinSession = async () => {
    if (!sessionId) return;

    const playerId = getPlayerId();
    const playerName = getPlayerName();

    try {
      const { error } = await supabase.from('game_players').insert({
        session_id: sessionId,
        player_id: playerId,
        player_name: playerName,
      });

      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session');
    }
  };

  const setReady = async (ready: boolean) => {
    if (!sessionId) return;

    const playerId = getPlayerId();

    try {
      const { error } = await supabase
        .from('game_players')
        .update({ is_ready: ready })
        .eq('session_id', sessionId)
        .eq('player_id', playerId);

      if (error) throw error;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update ready status'
      );
    }
  };

  const updateScore = async (
    score: number,
    accuracy: number,
    combo: number,
    maxCombo: number,
    judgements: { perfect: number; great: number; good: number; miss: number }
  ) => {
    if (!sessionId) return;

    const playerId = getPlayerId();

    console.log('Updating score to database:', { playerId, score, accuracy, combo, maxCombo, judgements });

    try {
      const { error, data } = await supabase
        .from('game_players')
        .update({
          score,
          accuracy,
          combo,
          max_combo: maxCombo,
          perfect_count: judgements.perfect,
          great_count: judgements.great,
          good_count: judgements.good,
          miss_count: judgements.miss,
        })
        .eq('session_id', sessionId)
        .eq('player_id', playerId);

      if (error) throw error;
      console.log('Score update successful:', data);
    } catch (err) {
      console.error('Failed to update score:', err);
    }
  };

  return {
    session,
    players,
    loading,
    error,
    joinSession,
    setReady,
    updateScore,
  };
}
