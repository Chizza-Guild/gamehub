'use client';

import { useState, useEffect } from 'react';
import { supabase, getPlayerId, getPlayerName, type Tables, type Inserts, type Updates } from '@/lib/supabase/client';

type Lobby = Tables<'lobbies'>;

// Define the structure of lobby_info JSONB
interface LobbyInfo {
  status: 'lobby' | 'countdown' | 'playing' | 'finished';
  host_id: string;
  max_players: number;
  started_at?: string | null;
  finished_at?: string | null;
  players: {
    player_id: string;
    player_name: string;
    is_ready: boolean;
    score: number;
    accuracy: number;
    combo: number;
    max_combo: number;
    perfect_count: number;
    great_count: number;
    good_count: number;
    miss_count: number;
    joined_at: string;
  }[];
}

export type GamePlayer = LobbyInfo['players'][0];

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
          setPlayers(typedLobby.lobby_info?.players || []);
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
            setPlayers(typedLobby.lobby_info?.players || []);
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
    const playerName = getPlayerName();

    try {
      const currentInfo = session.lobby_info as LobbyInfo;
      const existingPlayer = currentInfo.players.find(p => p.player_id === playerId);

      if (existingPlayer) {
        console.log('Player already in lobby');
        return;
      }

      const newPlayer: GamePlayer = {
        player_id: playerId,
        player_name: playerName,
        is_ready: false,
        score: 0,
        accuracy: 0,
        combo: 0,
        max_combo: 0,
        perfect_count: 0,
        great_count: 0,
        good_count: 0,
        miss_count: 0,
        joined_at: new Date().toISOString(),
      };

      const updatedInfo: LobbyInfo = {
        ...currentInfo,
        players: [...currentInfo.players, newPlayer],
      };

      const { error } = await supabase
        .from('lobbies')
        // @ts-expect-error - Supabase type inference issue with Database generic
        .update({ lobby_info: updatedInfo })
        .eq('id', session.id);

      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join lobby');
    }
  };

  const setReady = async (ready: boolean) => {
    if (!lobbyCode || !session) return;

    const playerId = getPlayerId();

    try {
      const currentInfo = session.lobby_info as LobbyInfo;
      const updatedPlayers = currentInfo.players.map(p =>
        p.player_id === playerId ? { ...p, is_ready: ready } : p
      );

      const updatedInfo: LobbyInfo = {
        ...currentInfo,
        players: updatedPlayers,
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
      const updatedPlayers = currentInfo.players.map(p =>
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
        players: updatedPlayers,
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
