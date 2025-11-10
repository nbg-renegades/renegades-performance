-- Create or replace the position enum with all football positions
DO $$ BEGIN
  CREATE TYPE public.football_position AS ENUM ('QB', 'WR', 'C', 'DB', 'B', 'unassigned');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Drop the old position column if it exists and recreate with new enum
ALTER TABLE public.player_positions 
  DROP COLUMN IF EXISTS position CASCADE;

ALTER TABLE public.player_positions
  ADD COLUMN position public.football_position NOT NULL DEFAULT 'unassigned';

-- Create index for faster position lookups
CREATE INDEX IF NOT EXISTS idx_player_positions_player_id ON public.player_positions(player_id);
CREATE INDEX IF NOT EXISTS idx_player_positions_position ON public.player_positions(position);