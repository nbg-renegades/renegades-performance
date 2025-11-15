-- Update metric_type enum to new metrics
ALTER TYPE metric_type RENAME TO metric_type_old;

CREATE TYPE metric_type AS ENUM (
  'vertical_jump',
  'jump_gather',
  '40yd_dash',
  'shuttle_5_10_5',
  'pushups_1min'
);

-- Update the performance_entries table to use new enum with all mappings
ALTER TABLE performance_entries 
  ALTER COLUMN metric_type TYPE metric_type 
  USING CASE 
    WHEN metric_type::text = 'broad_jump' THEN 'jump_gather'::metric_type
    WHEN metric_type::text = 'shuffle_run' THEN 'shuttle_5_10_5'::metric_type
    WHEN metric_type::text = '3cone_drill' THEN 'shuttle_5_10_5'::metric_type
    WHEN metric_type::text = 'vertical_jump' THEN 'vertical_jump'::metric_type
    WHEN metric_type::text = '40yd_dash' THEN '40yd_dash'::metric_type
    WHEN metric_type::text = 'pushups_1min' THEN 'pushups_1min'::metric_type
    ELSE 'pushups_1min'::metric_type
  END;

DROP TYPE metric_type_old;