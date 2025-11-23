-- Add terms acceptance tracking to profiles table
ALTER TABLE public.profiles 
ADD COLUMN terms_accepted_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.profiles.terms_accepted_at IS 'Timestamp when user accepted the general terms and data policy';