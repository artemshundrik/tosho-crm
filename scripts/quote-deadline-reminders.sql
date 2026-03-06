-- Adds configurable deadline reminder fields for quotes.
-- Safe to run multiple times.

alter table if exists tosho.quotes
  add column if not exists deadline_reminder_offset_minutes integer,
  add column if not exists deadline_reminder_comment text;

notify pgrst, 'reload schema';
