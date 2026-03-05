alter table tosho.quote_items
  add column if not exists metadata jsonb;

update tosho.quote_items
set metadata = '{}'::jsonb
where metadata is null;

notify pgrst, 'reload schema';
