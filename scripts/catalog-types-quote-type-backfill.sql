-- Backfill quote_type for catalog groups:
-- root level is fixed as merch / print / other.

begin;

update tosho.catalog_types
set quote_type = 'other'
where quote_type is null;

commit;

-- Optional verification:
-- select quote_type, count(*) from tosho.catalog_types group by quote_type order by quote_type;
