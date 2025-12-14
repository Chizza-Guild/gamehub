'use client';

import { useState, useEffect } from 'react';
import { supabase, getPlayerId, getPlayerName, type Tables, type Inserts, type Updates } from '@/lib/supabase/client';

type Lobby = Tables<'lobbies'>;

// Define the structure of lobby_info JSONB
interface LobbyInfo {
  players: {
    id: string;
    name: string;
    joinedAt: number;
    lastSeen: number;
  }[];
  adminId: string;
  settings: {
    maxPlayers: number;
    isPrivate: boolean;
    mutedPlayers: string[];
  };
  game_state?: {
    dance?: {
      status: 'lobby' | 'countdown' | 'playing' | 'finished';
      started_at?: string | null;
      finished_at?: string | null;
      player_scores: {
        player_id: string;
        is_ready: boolean;
        score: number;
        accuracy: number;
        combo: number;
        max_combo: number;
        perfect_count: number;
        great_count: number;
        good_count: number;
        miss_count: number;
      }[];
    };
  };
}

export type GamePlayer = {
  player_id: string;
  is_ready: boolean;
  score: number;
  accuracy: number;
  combo: number;
  max_combo: number;
  perfect_count: number;
  great_count: number;
  good_count: number;
  miss_count: number;
};

export function useGameSession(lobbyCode: string | null) {
  const [session, setSession] = useState<(Lobby & { lobby_info: LobbyInfo }) | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lobbyCode) {
      setLoading(false);
      return;
    }

    let mounted = true;

    // Fetch initial data
    async function fetchSession() {
      if (!lobbyCode) return;

      try {
        const { data: lobbyData, error: lobbyError } = await supabase
          .from('lobbies')
          .select('*')
          .eq('code', lobbyCode)
          .single();

        if (lobbyError) throw lobbyError;

        if (mounted) {
          const typedLobby = lobbyData as Lobby & { lobby_info: LobbyInfo };
          setSession(typedLobby);
          // Extract players from game_state instead of lobby_info.players
          const gameState = typedLobby.lobby_info?.game_state?.dance;
          setPlayers(gameState?.player_scores || []);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to load lobby'
          );
          setLoading(false);
        }
      }
    }

    fetchSession();

    // Subscribe to lobby changes
    const lobbyChannel = supabase
      .channel(`lobby:${lobbyCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lobbies',
          filter: `code=eq.${lobbyCode}`,
        },
        (payload) => {
          console.log('Lobby data changed:', payload);
          if (payload.new) {
            const typedLobby = payload.new as Lobby & { lobby_info: LobbyInfo };
            setSession(typedLobby);
            // Extract players from game_state
            const gameState = typedLobby.lobby_info?.game_state?.dance;
            setPlayers(gameState?.player_scores || []);
          }
        }
      )
      .subscribe((status) => {
        console.log('Lobby subscription status:', status);
      });

    return () => {
      mounted = false;
      lobbyChannel.unsubscribe();
    };
  }, [lobbyCode]);

  const joinSession = async () => {
    if (!lobbyCode || !session) return;

    const playerId = getPlayerId();

    try {
      const currentInfo = session.lobby_info as LobbyInfo;
      const gameState = currentInfo.game_state?.dance || {
        status: 'lobby' as const,
        player_scores: [],
      };

      const existingPlayer = gameState.player_scores.find(p => p.player_id === playerId);

      if (existingPlayer) {
        console.log('Player already in game');
        return;
      }

      const newPlayer: GamePlayer = {
        player_id: playerId,
        is_ready: false,
        score: 0,
        accuracy: 0,
        combo: 0,
        max_combo: 0,
        perfect_count: 0,
        great_count: 0,
        good_count: 0,
        miss_count: 0,
      };

      const updatedInfo: LobbyInfo = {
        ...currentInfo,
        game_state: {
          ...currentInfo.game_state,
          dance: {
            ...gameState,
            player_scores: [...gameState.player_scores, newPlayer],
          },
        },
      };

      const { error } = await supabase
        .from('lobbies')
        // @ts-expect-error - Supabase type inference issue with Database generic
        .update({ lobby_info: updatedInfo })
        .eq('id', session.id);

      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game');
    }
  };

  const setReady = async (ready: boolean) => {
    if (!lobbyCode || !session) return;

    const playerId = getPlayerId();

    try {
      const currentInfo = session.lobby_info as LobbyInfo;
      const gameState = currentInfo.game_state?.dance;

      if (!gameState) {
        throw new Error('Game state not initialized');
      }

      const updatedPlayers = gameState.player_scores.map(p =>
        p.player_id === playerId ? { ...p, is_ready: ready } : p
      );

      const updatedInfo: LobbyInfo = {
        ...currentInfo,
        game_state: {
          ...currentInfo.game_state,
          dance: {
            ...gameState,
            player_scores: updatedPlayers,
          },
        },
      };

      const { error } = await supabase
        .from('lobbies')
        // @ts-expect-error - Supabase type inference issue with Database generic
        .update({ lobby_info: updatedInfo })
        .eq('id', session.id);

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
    if (!lobbyCode || !session) return;

    const playerId = getPlayerId();

    console.log('Updating score to database:', { playerId, score, accuracy, combo, maxCombo, judgements });

    try {
      const currentInfo = session.lobby_info as LobbyInfo;
      const gameState = currentInfo.game_state?.dance;

      if (!gameState) {
        throw new Error('Game state not initialized');
      }

      const updatedPlayers = gameState.player_scores.map(p =>
        p.player_id === playerId
          ? {
              ...p,
              score,
              accuracy,
              combo,
              max_combo: maxCombo,
              perfect_count: judgements.perfect,
              great_count: judgements.great,
              good_count: judgements.good,
              miss_count: judgements.miss,
            }
          : p
      );

      const updatedInfo: LobbyInfo = {
        ...currentInfo,
        game_state: {
          ...currentInfo.game_state,
          dance: {
            ...gameState,
            player_scores: updatedPlayers,
          },
        },
      };

      const { error, data } = await supabase
        .from('lobbies')
        // @ts-expect-error - Supabase type inference issue with Database generic
        .update({ lobby_info: updatedInfo })
        .eq('id', session.id);

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
