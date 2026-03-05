alter table tosho.catalog_models
  add column if not exists metadata jsonb;

update tosho.catalog_models
set metadata = '{}'::jsonb
where metadata is null;

notify pgrst, 'reload schema';
