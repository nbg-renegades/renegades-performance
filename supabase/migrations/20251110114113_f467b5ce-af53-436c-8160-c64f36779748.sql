-- Fix player_positions table to require authentication
DROP POLICY IF EXISTS "Everyone can view positions" ON public.player_positions;

-- Require authentication to view player positions
CREATE POLICY "Authenticated users can view positions" 
ON public.player_positions 
FOR SELECT 
USING (auth.uid() IS NOT NULL);
