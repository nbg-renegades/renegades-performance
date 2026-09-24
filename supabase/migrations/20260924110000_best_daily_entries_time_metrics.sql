-- get_best_daily_entries() picked the day's *slowest* 30-Yard Dash and 3-Cone Drill.
--
-- The ordering CASE listed '40yd_dash' as the time-based metric. 20251120143437 added
-- '30yd_dash' and '3_cone_drill' to the enum and 20251120143449 moved the rows over, but
-- this function was never updated. '40yd_dash' survives in the enum with no rows, so the
-- comparison stayed valid and nothing errored - the two real time metrics just fell
-- through to the ELSE branch, which negates the value to rank descending. Lower is better
-- for a stopwatch, so "best of day" returned the worst attempt.
--
-- At the time of writing that was 23 of 39 player-days for the 3-Cone Drill, off by up to
-- 0.36s. 30-Yard Dash had no multi-attempt days yet, so it was wrong only in waiting.
--
-- Everything else here is carried over unchanged from 20251115202334.
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
            -- Time-based metrics: lower is better. '40yd_dash' is retired but still a
            -- valid enum member, so it stays listed in case an old row ever resurfaces.
            WHEN pe.metric_type IN ('30yd_dash', '3_cone_drill', 'shuttle_5_10_5', '40yd_dash')
              THEN pe.value
            ELSE -pe.value  -- Distance and reps: higher is better (negate to sort ascending)
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
