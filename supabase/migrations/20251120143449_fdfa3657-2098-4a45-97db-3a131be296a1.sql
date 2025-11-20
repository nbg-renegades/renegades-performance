-- Step 2: Update existing 40yd_dash entries to 30yd_dash
UPDATE performance_entries 
SET metric_type = '30yd_dash'
WHERE metric_type = '40yd_dash';