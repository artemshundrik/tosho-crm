-- Adds dedicated field for designer brief in quote records.
-- Safe to run multiple times.

alter table if exists tosho.quotes
  add column if not exists design_brief text;

-- Backfill existing briefs from legacy comment field when empty.
update tosho.quotes
set design_brief = comment
where (design_brief is null or btrim(design_brief) = '')
  and comment is not null
  and btrim(comment) <> '';

-- Refresh PostgREST schema cache for Supabase API.
notify pgrst, 'reload schema';
