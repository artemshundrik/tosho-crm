-- Adds denormalized customer meta fields to quotes for stable rendering
-- when quote is created from either customers or leads.
-- Safe to run multiple times.

alter table if exists tosho.quotes
  add column if not exists customer_name text,
  add column if not exists customer_logo_url text;

-- Backfill from customers for quotes linked by customer_id.
update tosho.quotes q
set
  customer_name = coalesce(nullif(btrim(c.name), ''), nullif(btrim(c.legal_name), ''), q.customer_name),
  customer_logo_url = coalesce(nullif(btrim(c.logo_url), ''), q.customer_logo_url)
from tosho.customers c
where q.customer_id = c.id
  and (
    q.customer_name is null
    or btrim(q.customer_name) = ''
    or q.customer_logo_url is null
    or btrim(q.customer_logo_url) = ''
  );

-- Backfill from leads for quotes without customer_id.
-- Applies only for exact + unique match by title in same team.
with lead_matches as (
  select
    q.id as quote_id,
    coalesce(nullif(btrim(l.company_name), ''), nullif(btrim(l.legal_name), '')) as lead_name,
    nullif(btrim(l.logo_url), '') as lead_logo_url,
    count(*) over (partition by q.id) as match_count
  from tosho.quotes q
  join tosho.leads l
    on l.team_id = q.team_id
   and (
     lower(btrim(coalesce(q.title, ''))) = lower(btrim(coalesce(l.company_name, '')))
     or lower(btrim(coalesce(q.title, ''))) = lower(btrim(coalesce(l.legal_name, '')))
   )
  where (q.customer_id is null)
    and (
      q.customer_name is null
      or btrim(q.customer_name) = ''
      or q.customer_logo_url is null
      or btrim(q.customer_logo_url) = ''
    )
)
update tosho.quotes q
set
  customer_name = coalesce(q.customer_name, lm.lead_name),
  customer_logo_url = coalesce(q.customer_logo_url, lm.lead_logo_url)
from lead_matches lm
where q.id = lm.quote_id
  and lm.match_count = 1
  and lm.lead_name is not null;

-- Refresh PostgREST schema cache for Supabase API.
notify pgrst, 'reload schema';
