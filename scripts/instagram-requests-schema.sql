-- Заявки з Instagram Direct (картка 352).
--
-- ЩО ТУТ. Налаштування, заявка, її повідомлення й історія. Розмови не з реклами
-- (`kind = 'other'`) лежать у тих самих таблицях, але менеджери їх не бачать
-- уже на рівні бази: це особисті листи компанії, і прихованої в інтерфейсі
-- вкладки для них замало.
--
-- ЧОМУ БРАУЗЕР НЕ ПИШЕ. Передача, таймер, перша відповідь і надсилання клієнту
-- мають зійтись в одному місці, інакше клієнт отримає дві відповіді. Усі записи
-- робить функція instagram-requests під service role, тож тут лише select.
--
-- ЧОМУ ДЕДЛАЙН ЗБЕРІГАЄТЬСЯ ЧАСОМ. Робочі хвилини рахує застосунок один раз, у
-- момент призначення. Таймер тоді це простий запит «у кого минув дедлайн», без
-- обчислення робочих годин у SQL і без окремого крона.
--
-- БЕЗПЕЧНО ЗАСТОСОВУВАТИ ПОВТОРНО: if not exists, create or replace, drop if exists.

create table if not exists tosho.instagram_settings (
  team_id uuid primary key,
  reminder_minutes integer not null default 15 check (reminder_minutes between 1 and 480),
  handover_minutes integer not null default 30 check (handover_minutes between 2 and 480),
  work_start_hour integer not null default 9 check (work_start_hour between 0 and 23),
  work_end_hour integer not null default 18 check (work_end_hour between 1 and 24),
  auto_reply_text text not null default 'Дякуємо, що написали! Менеджер відповість у робочий час, з 9:00 до 18:00.',
  other_reviewer_user_id uuid,
  round_excluded_user_ids uuid[] not null default '{}',
  round_cursor_user_id uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (reminder_minutes < handover_minutes),
  check (work_start_hour < work_end_hour)
);

create table if not exists tosho.instagram_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  external_user_id text not null,
  handle text,
  display_name text,
  avatar_url text,
  kind text not null default 'ad' check (kind in ('ad', 'other')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'lead', 'closed')),
  assigned_user_id uuid,
  assigned_at timestamptz,
  reminder_due_at timestamptz,
  handover_due_at timestamptz,
  reminded_at timestamptz,
  -- Поза робочим часом сповіщення лише в дзвіночок, а push і Telegram на відкритті дня.
  assignee_notified_at timestamptz,
  -- Менеджерів немає зовсім: керівнику кажемо один раз, а не на кожен тік таймера.
  unassigned_alerted_at timestamptz,
  round integer not null default 1,
  round_user_ids uuid[] not null default '{}',
  is_overdue boolean not null default false,
  first_response_at timestamptz,
  first_response_minutes integer,
  first_response_by uuid,
  close_reason text check (close_reason in ('not_client', 'cannot_do', 'changed_mind')),
  closed_at timestamptz,
  closed_by uuid,
  lead_id uuid references tosho.leads (id) on delete set null,
  customer_id uuid references tosho.customers (id) on delete set null,
  party_name text,
  company_name text,
  contact text,
  ad_id text,
  ad_title text,
  last_client_message_at timestamptz,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  last_message_direction text check (last_message_direction in ('in', 'out')),
  last_message_sender_id uuid,
  awaiting_reply boolean not null default false,
  auto_replied_at timestamptz,
  is_test boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (team_id, external_user_id)
);

create index if not exists instagram_requests_team_recent_idx
  on tosho.instagram_requests (team_id, last_message_at desc);
-- Таймер: дедлайн є лише в заявки, що чекає першої відповіді.
create index if not exists instagram_requests_due_idx
  on tosho.instagram_requests (handover_due_at) where handover_due_at is not null;
create index if not exists instagram_requests_unassigned_idx
  on tosho.instagram_requests (team_id) where kind = 'ad' and assigned_user_id is null;

create table if not exists tosho.instagram_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  request_id uuid not null references tosho.instagram_requests (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  source text not null check (source in ('client', 'crm', 'ig_app', 'auto_reply')),
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  -- Ідентифікатор Instagram: повторна доставка події не створить дубля.
  external_id text,
  -- Ідентифікатор від браузера: подвійний клік «Надіслати» не надішле двічі.
  client_message_id uuid,
  sender_user_id uuid,
  send_status text not null default 'sent' check (send_status in ('pending', 'sent', 'failed')),
  send_error text,
  created_at timestamptz not null default now()
);

create unique index if not exists instagram_messages_external_uq
  on tosho.instagram_messages (team_id, external_id) where external_id is not null;
create unique index if not exists instagram_messages_client_uq
  on tosho.instagram_messages (request_id, client_message_id) where client_message_id is not null;
create index if not exists instagram_messages_request_idx
  on tosho.instagram_messages (request_id, created_at);

create table if not exists tosho.instagram_request_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  request_id uuid not null references tosho.instagram_requests (id) on delete cascade,
  kind text not null,
  from_user_id uuid,
  to_user_id uuid,
  actor_user_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists instagram_request_events_request_idx
  on tosho.instagram_request_events (request_id, created_at);

-- Хто що читає. Security definer з тієї ж причини, що й is_owner_or_seo: політика
-- не має залежати від прав читача на memberships.
-- Перелік менеджерів тримати синхронно з REQUEST_MANAGER_JOB_ROLES у rules.ts.
create or replace function tosho.can_read_instagram_requests(p_team_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path to 'tosho', 'public'
set row_security to 'off'
as $$
  select public.is_team_member(p_team_id)
    and not tosho.is_user_blocked(auth.uid())
    and exists (
      select 1
      from tosho.memberships m
      where m.user_id = auth.uid()
        and (
          m.role::text = 'owner'
          or m.job_role::text = 'seo'
          or (
            p_kind = 'ad'
            and m.job_role::text in ('manager', 'sales_manager', 'junior_sales_manager', 'top_manager')
          )
        )
    );
$$;

revoke all on function tosho.can_read_instagram_requests(uuid, text) from public, anon;
grant execute on function tosho.can_read_instagram_requests(uuid, text) to authenticated, service_role;

alter table tosho.instagram_settings enable row level security;
alter table tosho.instagram_requests enable row level security;
alter table tosho.instagram_messages enable row level security;
alter table tosho.instagram_request_events enable row level security;

drop policy if exists instagram_settings_select on tosho.instagram_settings;
create policy instagram_settings_select on tosho.instagram_settings
  for select to authenticated
  using (tosho.can_read_instagram_requests(team_id, 'ad'));

drop policy if exists instagram_requests_select on tosho.instagram_requests;
create policy instagram_requests_select on tosho.instagram_requests
  for select to authenticated
  using (tosho.can_read_instagram_requests(team_id, kind));

drop policy if exists instagram_messages_select on tosho.instagram_messages;
create policy instagram_messages_select on tosho.instagram_messages
  for select to authenticated
  using (
    exists (
      select 1 from tosho.instagram_requests r
      where r.id = instagram_messages.request_id
        and tosho.can_read_instagram_requests(r.team_id, r.kind)
    )
  );

drop policy if exists instagram_request_events_select on tosho.instagram_request_events;
create policy instagram_request_events_select on tosho.instagram_request_events
  for select to authenticated
  using (
    exists (
      select 1 from tosho.instagram_requests r
      where r.id = instagram_request_events.request_id
        and tosho.can_read_instagram_requests(r.team_id, r.kind)
    )
  );

revoke all on tosho.instagram_settings, tosho.instagram_requests, tosho.instagram_messages, tosho.instagram_request_events from anon;
revoke all on tosho.instagram_settings, tosho.instagram_requests, tosho.instagram_messages, tosho.instagram_request_events from authenticated;
grant select on tosho.instagram_settings, tosho.instagram_requests, tosho.instagram_messages, tosho.instagram_request_events to authenticated;
grant all on tosho.instagram_settings, tosho.instagram_requests, tosho.instagram_messages, tosho.instagram_request_events to service_role;

-- Живе оновлення: порожній сигнал, сам зміст клієнт перечитує запитом із RLS.
-- Канал спільний на команду, тому в сигналі немає нічого з розмови.
create or replace function tosho.broadcast_instagram_requests_changed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_team uuid := coalesce(new.team_id, old.team_id);
begin
  begin
    perform realtime.send('{}'::jsonb, 'changed', 'tosho:' || v_team::text || ':instagram-requests', true);
  exception when others then
    raise warning 'broadcast_instagram_requests_changed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function tosho.broadcast_instagram_requests_changed() from public, anon, authenticated;

drop trigger if exists instagram_requests_broadcast_changed on tosho.instagram_requests;
create trigger instagram_requests_broadcast_changed
  after insert or update or delete on tosho.instagram_requests
  for each row execute function tosho.broadcast_instagram_requests_changed();

drop trigger if exists instagram_messages_broadcast_changed on tosho.instagram_messages;
create trigger instagram_messages_broadcast_changed
  after insert or update on tosho.instagram_messages
  for each row execute function tosho.broadcast_instagram_requests_changed();
