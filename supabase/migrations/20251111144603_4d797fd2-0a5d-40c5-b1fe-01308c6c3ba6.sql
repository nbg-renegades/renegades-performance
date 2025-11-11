-- Remove is_primary column since players now have only one position
-- The unique constraint on player_id already exists to ensure one position per player
ALTER TABLE public.player_positions DROP COLUMN IF EXISTS is_primary;

-- Add comment explaining the single position rule
COMMENT ON TABLE public.player_positions IS 'Each player can have exactly one position. No secondary positions allowed.';