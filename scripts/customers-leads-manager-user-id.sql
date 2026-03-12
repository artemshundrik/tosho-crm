-- Link customers/leads manager to canonical workspace member ids and labels.
-- Safe to run multiple times.

begin;

alter table tosho.customers
  add column if not exists manager_user_id uuid;

alter table tosho.leads
  add column if not exists manager_user_id uuid;

create index if not exists customers_team_manager_user_idx
  on tosho.customers (team_id, manager_user_id);

create index if not exists leads_team_manager_user_idx
  on tosho.leads (team_id, manager_user_id);

with member_directory as (
  select
    md.workspace_id,
    md.user_id,
    nullif(trim(md.email), '') as email,
    nullif(trim(md.first_name), '') as first_name,
    nullif(trim(md.last_name), '') as last_name,
    nullif(trim(md.full_name), '') as full_name,
    coalesce(
      nullif(trim(concat_ws(' ', md.first_name, case when nullif(trim(md.last_name), '') is not null then left(trim(md.last_name), 1) || '.' end)), ''),
      nullif(trim(md.full_name), ''),
      nullif(trim(split_part(md.email, '@', 1)), ''),
      'Користувач'
    ) as canonical_label
  from tosho.workspace_member_directory md
  where md.workspace_id is not null
    and md.user_id is not null
),
member_aliases as (
  select
    md.workspace_id,
    md.user_id,
    md.canonical_label,
    lower(regexp_replace(trim(alias.label), '\s+', ' ', 'g')) as manager_key
  from member_directory md
  cross join lateral (
    values
      (md.canonical_label),
      (md.full_name),
      (concat_ws(' ', md.first_name, md.last_name)),
      (concat_ws(' ', md.last_name, md.first_name)),
      (case when md.first_name is not null and md.last_name is not null then md.first_name || ' ' || left(md.last_name, 1) || '.' end),
      (case when md.first_name is not null and md.last_name is not null then md.last_name || ' ' || left(md.first_name, 1) || '.' end),
      (md.first_name),
      (split_part(md.email, '@', 1))
  ) as alias(label)
  where nullif(trim(alias.label), '') is not null
),
unique_member_aliases as (
  select
    workspace_id,
    manager_key,
    min(user_id::text)::uuid as user_id,
    min(canonical_label) as canonical_label
  from member_aliases
  group by workspace_id, manager_key
  having count(distinct user_id) = 1
)
update tosho.customers c
set
  manager_user_id = uma.user_id,
  manager = uma.canonical_label
from unique_member_aliases uma
where c.team_id = uma.workspace_id
  and nullif(trim(c.manager), '') is not null
  and lower(regexp_replace(trim(c.manager), '\s+', ' ', 'g')) = uma.manager_key
  and (
    c.manager_user_id is distinct from uma.user_id
    or coalesce(nullif(trim(c.manager), ''), '') is distinct from uma.canonical_label
  );

with member_directory as (
  select
    md.workspace_id,
    md.user_id,
    nullif(trim(md.email), '') as email,
    nullif(trim(md.first_name), '') as first_name,
    nullif(trim(md.last_name), '') as last_name,
    nullif(trim(md.full_name), '') as full_name,
    coalesce(
      nullif(trim(concat_ws(' ', md.first_name, case when nullif(trim(md.last_name), '') is not null then left(trim(md.last_name), 1) || '.' end)), ''),
      nullif(trim(md.full_name), ''),
      nullif(trim(split_part(md.email, '@', 1)), ''),
      'Користувач'
    ) as canonical_label
  from tosho.workspace_member_directory md
  where md.workspace_id is not null
    and md.user_id is not null
),
member_aliases as (
  select
    md.workspace_id,
    md.user_id,
    md.canonical_label,
    lower(regexp_replace(trim(alias.label), '\s+', ' ', 'g')) as manager_key
  from member_directory md
  cross join lateral (
    values
      (md.canonical_label),
      (md.full_name),
      (concat_ws(' ', md.first_name, md.last_name)),
      (concat_ws(' ', md.last_name, md.first_name)),
      (case when md.first_name is not null and md.last_name is not null then md.first_name || ' ' || left(md.last_name, 1) || '.' end),
      (case when md.first_name is not null and md.last_name is not null then md.last_name || ' ' || left(md.first_name, 1) || '.' end),
      (md.first_name),
      (split_part(md.email, '@', 1))
  ) as alias(label)
  where nullif(trim(alias.label), '') is not null
),
unique_member_aliases as (
  select
    workspace_id,
    manager_key,
    min(user_id::text)::uuid as user_id,
    min(canonical_label) as canonical_label
  from member_aliases
  group by workspace_id, manager_key
  having count(distinct user_id) = 1
)
update tosho.leads l
set
  manager_user_id = uma.user_id,
  manager = uma.canonical_label
from unique_member_aliases uma
where l.team_id = uma.workspace_id
  and nullif(trim(l.manager), '') is not null
  and lower(regexp_replace(trim(l.manager), '\s+', ' ', 'g')) = uma.manager_key
  and (
    l.manager_user_id is distinct from uma.user_id
    or coalesce(nullif(trim(l.manager), ''), '') is distinct from uma.canonical_label
  );

commit;

notify pgrst, 'reload schema';
