-- Adds JSON field for structured delivery/logistics details in quote records.
-- Safe to run multiple times.

alter table if exists tosho.quotes
  add column if not exists delivery_details jsonb;

-- Refresh PostgREST schema cache for Supabase API.
notify pgrst, 'reload schema';
