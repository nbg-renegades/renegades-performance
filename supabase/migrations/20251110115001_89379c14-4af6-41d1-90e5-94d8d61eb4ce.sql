-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Everyone can view all roles" ON public.user_roles;

-- Create restricted policies for user_roles SELECT
CREATE POLICY "Users can view own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));