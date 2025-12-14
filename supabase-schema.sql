-- Supabase Database Schema for Multiplayer Games
-- Execute this in your Supabase SQL Editor

-- Game sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('lobby', 'countdown', 'playing', 'finished')),
  host_id TEXT NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 8,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  settings JSONB DEFAULT '{}'::JSONB
);

-- Game players table
CREATE TABLE IF NOT EXISTS game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  is_ready BOOLEAN DEFAULT FALSE,
  score INTEGER DEFAULT 0,
  accuracy FLOAT DEFAULT 0,
  combo INTEGER DEFAULT 0,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id, player_id)
);

-- Game state table (for real-time game events)
CREATE TABLE IF NOT EXISTS game_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_players_session ON game_players(session_id);
CREATE INDEX IF NOT EXISTS idx_game_state_session ON game_state(session_id);

-- Enable Row Level Security
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Game sessions policies
DROP POLICY IF EXISTS "Anyone can view game sessions" ON game_sessions;
CREATE POLICY "Anyone can view game sessions"
  ON game_sessions FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Anyone can create game sessions" ON game_sessions;
CREATE POLICY "Anyone can create game sessions"
  ON game_sessions FOR INSERT
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Anyone can update game sessions" ON game_sessions;
CREATE POLICY "Anyone can update game sessions"
  ON game_sessions FOR UPDATE
  USING (TRUE);

-- Game players policies
DROP POLICY IF EXISTS "Anyone can view players" ON game_players;
CREATE POLICY "Anyone can view players"
  ON game_players FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Anyone can join as player" ON game_players;
CREATE POLICY "Anyone can join as player"
  ON game_players FOR INSERT
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Anyone can update players" ON game_players;
CREATE POLICY "Anyone can update players"
  ON game_players FOR UPDATE
  USING (TRUE);

-- Game state policies
DROP POLICY IF EXISTS "Anyone can view game state" ON game_state;
CREATE POLICY "Anyone can view game state"
  ON game_state FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Anyone can create game state" ON game_state;
CREATE POLICY "Anyone can create game state"
  ON game_state FOR INSERT
  WITH CHECK (TRUE);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
