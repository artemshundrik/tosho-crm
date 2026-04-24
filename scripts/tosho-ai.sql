-- ToSho AI support domain
-- Run in Supabase SQL editor.
-- Safe to run multiple times.

begin;

create extension if not exists vector with schema extensions;

create table if not exists tosho.support_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  team_id uuid not null,
  created_by uuid not null,
  created_by_label text,
  assignee_user_id uuid,
  assignee_label text,
  mode text not null default 'ask',
  status text not null default 'open',
  priority text not null default 'medium',
  domain text not null default 'general',
  title text not null,
  summary text,
  route_label text,
  route_href text,
  entity_type text,
  entity_id text,
  context jsonb not null default '{}'::jsonb,
  ai_confidence numeric(4,3),
  escalated_at timestamptz,
  resolved_at timestamptz,
  last_message_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table tosho.support_requests
  add column if not exists workspace_id uuid,
  add column if not exists team_id uuid,
  add column if not exists created_by uuid,
  add column if not exists created_by_label text,
  add column if not exists assignee_user_id uuid,
  add column if not exists assignee_label text,
  add column if not exists mode text,
  add column if not exists status text,
  add column if not exists priority text,
  add column if not exists domain text,
  add column if not exists title text,
  add column if not exists summary text,
  add column if not exists route_label text,
  add column if not exists route_href text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists context jsonb,
  add column if not exists ai_confidence numeric(4,3),
  add column if not exists escalated_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists last_message_at timestamptz,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update tosho.support_requests
set
  mode = coalesce(nullif(trim(mode), ''), 'ask'),
  status = coalesce(nullif(trim(status), ''), 'open'),
  priority = coalesce(nullif(trim(priority), ''), 'medium'),
  domain = coalesce(nullif(trim(domain), ''), 'general'),
  context = coalesce(context, '{}'::jsonb),
  last_message_at = coalesce(last_message_at, created_at, timezone('utc', now())),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, timezone('utc', now()));

alter table tosho.support_requests
  alter column mode set default 'ask',
  alter column mode set not null,
  alter column status set default 'open',
  alter column status set not null,
  alter column priority set default 'medium',
  alter column priority set not null,
  alter column domain set default 'general',
  alter column domain set not null,
  alter column context set default '{}'::jsonb,
  alter column context set not null,
  alter column last_message_at set default timezone('utc', now()),
  alter column last_message_at set not null,
  alter column created_at set default timezone('utc', now()),
  alter column created_at set not null,
  alter column updated_at set default timezone('utc', now()),
  alter column updated_at set not null;

alter table tosho.support_requests
  drop constraint if exists support_requests_mode_check,
  drop constraint if exists support_requests_status_check,
  drop constraint if exists support_requests_priority_check,
  drop constraint if exists support_requests_domain_check;

alter table tosho.support_requests
  add constraint support_requests_mode_check
    check (mode in ('ask', 'fix', 'route', 'resolve')),
  add constraint support_requests_status_check
    check (status in ('open', 'in_progress', 'waiting_user', 'resolved')),
  add constraint support_requests_priority_check
    check (priority in ('low', 'medium', 'high', 'urgent')),
  add constraint support_requests_domain_check
    check (domain in ('general', 'overview', 'orders', 'design', 'logistics', 'catalog', 'contractors', 'team', 'admin'));

create table if not exists tosho.support_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references tosho.support_requests(id) on delete cascade,
  workspace_id uuid not null,
  role text not null,
  user_id uuid,
  actor_label text,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table tosho.support_messages
  add column if not exists request_id uuid,
  add column if not exists workspace_id uuid,
  add column if not exists role text,
  add column if not exists user_id uuid,
  add column if not exists actor_label text,
  add column if not exists body text,
  add column if not exists metadata jsonb,
  add column if not exists created_at timestamptz;

update tosho.support_messages
set
  role = coalesce(nullif(trim(role), ''), 'user'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, timezone('utc', now()));

alter table tosho.support_messages
  alter column role set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default timezone('utc', now()),
  alter column created_at set not null;

alter table tosho.support_messages
  drop constraint if exists support_messages_role_check;

alter table tosho.support_messages
  add constraint support_messages_role_check
    check (role in ('user', 'assistant', 'human', 'system'));

create table if not exists tosho.support_feedback (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references tosho.support_requests(id) on delete cascade,
  message_id uuid references tosho.support_messages(id) on delete cascade,
  workspace_id uuid not null,
  user_id uuid not null,
  value text not null,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table tosho.support_feedback
  add column if not exists request_id uuid,
  add column if not exists message_id uuid,
  add column if not exists workspace_id uuid,
  add column if not exists user_id uuid,
  add column if not exists value text,
  add column if not exists note text,
  add column if not exists created_at timestamptz;

update tosho.support_feedback
set
  value = coalesce(nullif(trim(value), ''), 'helpful'),
  created_at = coalesce(created_at, timezone('utc', now()));

alter table tosho.support_feedback
  alter column value set not null,
  alter column created_at set default timezone('utc', now()),
  alter column created_at set not null;

alter table tosho.support_feedback
  drop constraint if exists support_feedback_value_check;

alter table tosho.support_feedback
  add constraint support_feedback_value_check
    check (value in ('helpful', 'not_helpful'));

create table if not exists tosho.support_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  created_by uuid,
  updated_by uuid,
  title text not null,
  slug text not null,
  summary text,
  body text not null,
  tags text[] not null default '{}'::text[],
  keywords text[] not null default '{}'::text[],
  status text not null default 'active',
  source_label text,
  source_href text,
  embedding vector(512),
  embedding_model text,
  embedding_updated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table tosho.support_knowledge_items
  add column if not exists workspace_id uuid,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists title text,
  add column if not exists slug text,
  add column if not exists summary text,
  add column if not exists body text,
  add column if not exists tags text[],
  add column if not exists keywords text[],
  add column if not exists status text,
  add column if not exists source_label text,
  add column if not exists source_href text,
  add column if not exists embedding vector(512),
  add column if not exists embedding_model text,
  add column if not exists embedding_updated_at timestamptz,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update tosho.support_knowledge_items
set
  tags = coalesce(tags, '{}'::text[]),
  keywords = coalesce(keywords, '{}'::text[]),
  status = coalesce(nullif(trim(status), ''), 'active'),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, timezone('utc', now()));

alter table tosho.support_knowledge_items
  alter column tags set default '{}'::text[],
  alter column tags set not null,
  alter column keywords set default '{}'::text[],
  alter column keywords set not null,
  alter column status set default 'active',
  alter column status set not null,
  alter column created_at set default timezone('utc', now()),
  alter column created_at set not null,
  alter column updated_at set default timezone('utc', now()),
  alter column updated_at set not null;

alter table tosho.support_knowledge_items
  drop constraint if exists support_knowledge_items_status_check;

alter table tosho.support_knowledge_items
  add constraint support_knowledge_items_status_check
    check (status in ('active', 'draft', 'archived'));

create index if not exists support_requests_workspace_idx
  on tosho.support_requests (workspace_id, updated_at desc);

create index if not exists support_requests_team_status_idx
  on tosho.support_requests (team_id, status, updated_at desc);

create index if not exists support_requests_created_by_idx
  on tosho.support_requests (created_by, updated_at desc);

create index if not exists support_requests_assignee_idx
  on tosho.support_requests (assignee_user_id, updated_at desc);

create index if not exists support_messages_request_idx
  on tosho.support_messages (request_id, created_at asc);

create index if not exists support_messages_workspace_idx
  on tosho.support_messages (workspace_id, created_at desc);

create unique index if not exists support_feedback_request_message_user_idx
  on tosho.support_feedback (request_id, coalesce(message_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id);

create index if not exists support_feedback_workspace_idx
  on tosho.support_feedback (workspace_id, created_at desc);

create unique index if not exists support_knowledge_items_workspace_slug_idx
  on tosho.support_knowledge_items (workspace_id, slug);

create index if not exists support_knowledge_items_workspace_status_idx
  on tosho.support_knowledge_items (workspace_id, status, updated_at desc);

create index if not exists support_knowledge_items_embedding_idx
  on tosho.support_knowledge_items
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 32)
  where embedding is not null;

create or replace function tosho.touch_support_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists support_requests_touch_updated_at on tosho.support_requests;
create trigger support_requests_touch_updated_at
before update on tosho.support_requests
for each row execute function tosho.touch_support_updated_at();

drop trigger if exists support_knowledge_items_touch_updated_at on tosho.support_knowledge_items;
create trigger support_knowledge_items_touch_updated_at
before update on tosho.support_knowledge_items
for each row execute function tosho.touch_support_updated_at();

create or replace function tosho.touch_support_request_from_message()
returns trigger
language plpgsql
as $$
begin
  update tosho.support_requests
  set
    last_message_at = coalesce(new.created_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  where id = new.request_id;

  return new;
end;
$$;

drop trigger if exists support_messages_touch_request on tosho.support_messages;
create trigger support_messages_touch_request
after insert on tosho.support_messages
for each row execute function tosho.touch_support_request_from_message();

alter table tosho.support_requests enable row level security;
alter table tosho.support_messages enable row level security;
alter table tosho.support_feedback enable row level security;
alter table tosho.support_knowledge_items enable row level security;

drop policy if exists "support_requests_select" on tosho.support_requests;
create policy "support_requests_select"
on tosho.support_requests
for select
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view self_mv
    where self_mv.workspace_id = support_requests.workspace_id
      and self_mv.user_id = auth.uid()
      and (
        support_requests.created_by = auth.uid()
        or support_requests.assignee_user_id = auth.uid()
        or self_mv.access_role in ('owner', 'admin')
        or lower(coalesce(self_mv.job_role::text, '')) in ('seo', 'manager', 'pm')
      )
  )
);

drop policy if exists "support_messages_select" on tosho.support_messages;
create policy "support_messages_select"
on tosho.support_messages
for select
to authenticated
using (
  exists (
    select 1
    from tosho.support_requests sr
    join tosho.memberships_view self_mv
      on self_mv.workspace_id = sr.workspace_id
     and self_mv.user_id = auth.uid()
    where sr.id = support_messages.request_id
      and (
        sr.created_by = auth.uid()
        or sr.assignee_user_id = auth.uid()
        or self_mv.access_role in ('owner', 'admin')
        or lower(coalesce(self_mv.job_role::text, '')) in ('seo', 'manager', 'pm')
      )
  )
);

drop policy if exists "support_feedback_select" on tosho.support_feedback;
create policy "support_feedback_select"
on tosho.support_feedback
for select
to authenticated
using (
  exists (
    select 1
    from tosho.support_requests sr
    join tosho.memberships_view self_mv
      on self_mv.workspace_id = sr.workspace_id
     and self_mv.user_id = auth.uid()
    where sr.id = support_feedback.request_id
      and (
        sr.created_by = auth.uid()
        or sr.assignee_user_id = auth.uid()
        or self_mv.access_role in ('owner', 'admin')
        or lower(coalesce(self_mv.job_role::text, '')) in ('seo', 'manager', 'pm')
      )
  )
);

drop policy if exists "support_knowledge_items_select" on tosho.support_knowledge_items;
create policy "support_knowledge_items_select"
on tosho.support_knowledge_items
for select
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view self_mv
    where self_mv.workspace_id = support_knowledge_items.workspace_id
      and self_mv.user_id = auth.uid()
      and (
        support_knowledge_items.status = 'active'
        or self_mv.access_role in ('owner', 'admin')
        or lower(coalesce(self_mv.job_role::text, '')) in ('seo', 'manager', 'pm')
      )
  )
);

grant select on tosho.support_requests to authenticated;
grant select on tosho.support_messages to authenticated;
grant select on tosho.support_feedback to authenticated;
grant select on tosho.support_knowledge_items to authenticated;

notify pgrst, 'reload schema';

commit;
