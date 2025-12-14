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
      lobbies: {
        Row: {
          id: number;
          game_type: string | null;
          code: string;
          created_at: string;
          lobby_info: Json;
        };
        Insert: {
          id?: number;
          game_type?: string | null;
          code: string;
          created_at?: string;
          lobby_info?: Json;
        };
        Update: {
          id?: number;
          game_type?: string | null;
          code?: string;
          created_at?: string;
          lobby_info?: Json;
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
