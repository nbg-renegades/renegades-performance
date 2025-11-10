-- Drop the overly permissive policy that allows anyone to view profiles
DROP POLICY IF EXISTS "Everyone can view all profiles" ON public.profiles;

-- Create a new policy that only allows authenticated users to view profiles
CREATE POLICY "Authenticated users can view profiles" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Keep existing policies for updates and inserts unchanged