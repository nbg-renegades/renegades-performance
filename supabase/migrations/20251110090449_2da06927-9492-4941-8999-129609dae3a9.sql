-- Delete all existing data
DELETE FROM performance_entries;
DELETE FROM player_positions;
DELETE FROM user_roles;
DELETE FROM profiles;

-- Update the metric_type enum to match new requirements
ALTER TYPE metric_type RENAME TO metric_type_old;

CREATE TYPE metric_type AS ENUM (
  'vertical_jump',
  'broad_jump',
  '40yd_dash',
  '3cone_drill',
  'shuffle_run',
  'pushups_1min'
);

-- Update the performance_entries table to use new enum
ALTER TABLE performance_entries 
  ALTER COLUMN metric_type TYPE metric_type 
  USING metric_type::text::metric_type;

-- Drop the old enum
DROP TYPE metric_type_old;