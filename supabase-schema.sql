-- Supabase Database Schema for Multiplayer Games
-- Execute this in your Supabase SQL Editor

-- Lobbies table (simplified single-table design)
CREATE TABLE IF NOT EXISTS lobbies (
  id BIGSERIAL PRIMARY KEY,
  game_type TEXT,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  lobby_info JSONB DEFAULT '{}'::JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lobbies_code ON lobbies(code);
CREATE INDEX IF NOT EXISTS idx_lobbies_game_type ON lobbies(game_type);

-- Enable Row Level Security
ALTER TABLE lobbies ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Anyone can view lobbies" ON lobbies;
CREATE POLICY "Anyone can view lobbies"
  ON lobbies FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Anyone can create lobbies" ON lobbies;
CREATE POLICY "Anyone can create lobbies"
  ON lobbies FOR INSERT
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Anyone can update lobbies" ON lobbies;
CREATE POLICY "Anyone can update lobbies"
  ON lobbies FOR UPDATE
  USING (TRUE);

DROP POLICY IF EXISTS "Anyone can delete lobbies" ON lobbies;
CREATE POLICY "Anyone can delete lobbies"
  ON lobbies FOR DELETE
  USING (TRUE);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE lobbies;
