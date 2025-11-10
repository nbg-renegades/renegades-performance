-- Drop the overly permissive policy that allows anyone to view performance entries
DROP POLICY IF EXISTS "Everyone can view performance entries" ON public.performance_entries;

-- Create a new policy that only allows authenticated users to view performance data
CREATE POLICY "Authenticated users can view performance entries" 
ON public.performance_entries 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Keep all other existing policies (insert, update, delete) unchanged