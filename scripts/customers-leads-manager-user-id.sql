-- Link customers/leads manager to concrete team member id.
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

with normalized_members as (
  select
    mv.workspace_id,
    mv.user_id,
    nullif(trim(coalesce(mv.full_name, mv.email, '')), '') as manager_label
  from tosho.memberships_view mv
  where mv.workspace_id is not null
),
unique_member_labels as (
  select
    workspace_id,
    lower(manager_label) as manager_key,
    min(user_id::text)::uuid as user_id
  from normalized_members
  where manager_label is not null
  group by workspace_id, lower(manager_label)
  having count(*) = 1
)
update tosho.customers c
set manager_user_id = uml.user_id
from unique_member_labels uml
where c.team_id = uml.workspace_id
  and c.manager_user_id is null
  and nullif(trim(c.manager), '') is not null
  and lower(trim(c.manager)) = uml.manager_key;

with normalized_members as (
  select
    mv.workspace_id,
    mv.user_id,
    nullif(trim(coalesce(mv.full_name, mv.email, '')), '') as manager_label
  from tosho.memberships_view mv
  where mv.workspace_id is not null
),
unique_first_tokens as (
  select
    workspace_id,
    split_part(lower(manager_label), ' ', 1) as manager_token,
    min(user_id::text)::uuid as user_id
  from normalized_members
  where manager_label is not null
  group by workspace_id, split_part(lower(manager_label), ' ', 1)
  having count(*) = 1
)
update tosho.customers c
set manager_user_id = uft.user_id
from unique_first_tokens uft
where c.team_id = uft.workspace_id
  and c.manager_user_id is null
  and nullif(trim(c.manager), '') is not null
  and split_part(lower(trim(c.manager)), ' ', 1) = uft.manager_token;

with normalized_members as (
  select
    mv.workspace_id,
    mv.user_id,
    nullif(trim(coalesce(mv.full_name, mv.email, '')), '') as manager_label
  from tosho.memberships_view mv
  where mv.workspace_id is not null
),
unique_member_labels as (
  select
    workspace_id,
    lower(manager_label) as manager_key,
    min(user_id::text)::uuid as user_id
  from normalized_members
  where manager_label is not null
  group by workspace_id, lower(manager_label)
  having count(*) = 1
)
update tosho.leads l
set manager_user_id = uml.user_id
from unique_member_labels uml
where l.team_id = uml.workspace_id
  and l.manager_user_id is null
  and nullif(trim(l.manager), '') is not null
  and lower(trim(l.manager)) = uml.manager_key;

with normalized_members as (
  select
    mv.workspace_id,
    mv.user_id,
    nullif(trim(coalesce(mv.full_name, mv.email, '')), '') as manager_label
  from tosho.memberships_view mv
  where mv.workspace_id is not null
),
unique_first_tokens as (
  select
    workspace_id,
    split_part(lower(manager_label), ' ', 1) as manager_token,
    min(user_id::text)::uuid as user_id
  from normalized_members
  where manager_label is not null
  group by workspace_id, split_part(lower(manager_label), ' ', 1)
  having count(*) = 1
)
update tosho.leads l
set manager_user_id = uft.user_id
from unique_first_tokens uft
where l.team_id = uft.workspace_id
  and l.manager_user_id is null
  and nullif(trim(l.manager), '') is not null
  and split_part(lower(trim(l.manager)), ' ', 1) = uft.manager_token;

commit;

notify pgrst, 'reload schema';
