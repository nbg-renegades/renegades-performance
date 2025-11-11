-- Enable full row data capture for realtime updates
ALTER TABLE performance_entries REPLICA IDENTITY FULL;

-- Add the table to realtime publication (if not already added)
ALTER PUBLICATION supabase_realtime ADD TABLE performance_entries;