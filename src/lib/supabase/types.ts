/**
 * Database type definitions generated from Supabase schema
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      game_sessions: {
        Row: {
          id: string;
          game_type: string;
          status: 'lobby' | 'countdown' | 'playing' | 'finished';
          host_id: string;
          max_players: number;
          created_at: string;
          started_at: string | null;
          finished_at: string | null;
          settings: Json;
        };
        Insert: {
          id?: string;
          game_type: string;
          status: 'lobby' | 'countdown' | 'playing' | 'finished';
          host_id: string;
          max_players?: number;
          created_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
          settings?: Json;
        };
        Update: {
          id?: string;
          game_type?: string;
          status?: 'lobby' | 'countdown' | 'playing' | 'finished';
          host_id?: string;
          max_players?: number;
          created_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
          settings?: Json;
        };
      };
      game_players: {
        Row: {
          id: string;
          session_id: string;
          player_id: string;
          player_name: string;
          is_ready: boolean;
          score: number;
          accuracy: number;
          combo: number;
          joined_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          player_id: string;
          player_name: string;
          is_ready?: boolean;
          score?: number;
          accuracy?: number;
          combo?: number;
          joined_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          player_id?: string;
          player_name?: string;
          is_ready?: boolean;
          score?: number;
          accuracy?: number;
          combo?: number;
          joined_at?: string;
        };
      };
      game_state: {
        Row: {
          id: string;
          session_id: string;
          event_type: string;
          event_data: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          event_type: string;
          event_data: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          event_type?: string;
          event_data?: Json;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
};
