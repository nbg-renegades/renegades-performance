-- Phase 1: Remove secondary positions concept
-- Remove is_primary column and enforce single position per player

-- First, delete any non-primary positions (keep primary only)
DELETE FROM public.player_positions
WHERE is_primary = false;

-- Drop the is_primary column
ALTER TABLE public.player_positions
DROP COLUMN IF EXISTS is_primary;

-- Add unique constraint to enforce one position per player
ALTER TABLE public.player_positions
ADD CONSTRAINT player_positions_player_id_unique UNIQUE (player_id);