-- Update get_best_daily_entries function to respect RLS and role-based access
CREATE OR REPLACE FUNCTION public.get_best_daily_entries()
RETURNS TABLE(
  id uuid, 
  player_id uuid, 
  metric_type metric_type, 
  value numeric, 
  unit text, 
  entry_date date, 
  created_at timestamp with time zone, 
  created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH ranked_entries AS (
    SELECT 
      pe.*,
      ROW_NUMBER() OVER (
        PARTITION BY pe.player_id, pe.metric_type, pe.entry_date
        ORDER BY 
          CASE 
            -- For time-based metrics, lower is better
            WHEN pe.metric_type IN ('40yd_dash', 'shuttle_5_10_5') THEN pe.value
            ELSE -pe.value  -- For other metrics, higher is better (negate for ascending order)
          END ASC
      ) as rn
    FROM performance_entries pe
    -- Respect RLS: Players only see their own data, coaches/admins see all
    WHERE (
      pe.player_id = auth.uid() 
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'coach'::app_role)
    )
  )
  SELECT 
    re.id,
    re.player_id,
    re.metric_type,
    re.value,
    re.unit,
    re.entry_date,
    re.created_at,
    re.created_by
  FROM ranked_entries re
  WHERE re.rn = 1
  ORDER BY re.entry_date DESC, re.player_id;
END;
$$;