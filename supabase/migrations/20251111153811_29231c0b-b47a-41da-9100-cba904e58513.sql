-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view positions" ON public.player_positions;

-- Create restrictive policies for player_positions
-- Players can view only their own position
CREATE POLICY "Players can view own position"
  ON public.player_positions
  FOR SELECT
  USING (auth.uid() = player_id);

-- Coaches and admins can view all positions
CREATE POLICY "Coaches and admins can view all positions"
  ON public.player_positions
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'coach'::app_role) OR 
    public.has_role(auth.uid(), 'admin'::app_role)
  );