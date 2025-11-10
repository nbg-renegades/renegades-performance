-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view performance entries" ON public.performance_entries;

-- Create restricted policy for performance_entries SELECT
CREATE POLICY "Users can view authorized performance entries"
  ON public.performance_entries
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = player_id) 
    OR public.has_role(auth.uid(), 'coach'::app_role) 
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );