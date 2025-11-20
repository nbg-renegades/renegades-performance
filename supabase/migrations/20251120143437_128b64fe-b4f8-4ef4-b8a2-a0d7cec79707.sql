-- Step 1: Add new enum values (this will auto-commit)
ALTER TYPE metric_type ADD VALUE IF NOT EXISTS '30yd_dash';
ALTER TYPE metric_type ADD VALUE IF NOT EXISTS '3_cone_drill';