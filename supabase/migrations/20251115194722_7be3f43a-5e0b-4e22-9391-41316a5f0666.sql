-- Create a function to get the best entry per metric per day per player
-- For time-based metrics (lower is better), we select the minimum value
-- For other metrics (higher is better), we select the maximum value

CREATE OR REPLACE FUNCTION get_best_daily_entries()
RETURNS TABLE (
  id uuid,
  player_id uuid,
  metric_type metric_type,
  value numeric,
  unit text,
  entry_date date,
  created_at timestamptz,
  created_by uuid
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_best_daily_entries() TO authenticated;