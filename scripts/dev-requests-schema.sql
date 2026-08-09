-- Запити на доробку CRM: те, що просить команда, і те, що ми самі вирішили
-- зробити. Дизайн: docs/DEV_REQUESTS_DESIGN.md
--
-- НАВІЩО ОКРЕМО ВІД tosho.support_requests: та таблиця обслуговує AI-асистента
-- (режими ask/fix/route/resolve), її статуси не мають ні «Готово локально», ні
-- «Викочено», вона зрощена з netlify/functions/tosho-ai.ts, і в ній лежать 93
-- чужі картки, з яких 61 мертва. Змішувати з живою чергою розробки не можна.
--
-- Ідемпотентна, безпечна до повторного запуску.
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/dev-requests-schema.sql

\set ON_ERROR_STOP on

begin;

-- Спільний предикат «власник або SEO».
--
-- Де-факто цю роль уже грає tosho.can_read_all_feature_adoption() — її навіть
-- переюзали в product-updates-schema.sql. Але назва бреше про призначення,
-- тому заводимо чесний аліас і надалі беремо його.
--
-- SECURITY DEFINER, а не звернення до memberships_view прямо в політиці:
-- політики зливаються через OR, і помилка прав усередині однієї валить увесь
-- запит (пастка описана в scripts/feature-adoption-schema.sql:31-35).
create or replace function tosho.is_owner_or_seo()
returns boolean
language sql
stable
security definer
set search_path to 'tosho', 'public'
set row_security to 'off'
as $$
  select exists (
    select 1
    from tosho.memberships m
    where m.user_id = auth.uid()
      and (m.role::text = 'owner' or m.job_role::text = 'seo')
  )
  and not tosho.is_user_blocked(auth.uid());
$$;

revoke all on function tosho.is_owner_or_seo() from public, anon;
grant execute on function tosho.is_owner_or_seo() to authenticated;

create table if not exists tosho.dev_requests (
  id             uuid        primary key default gen_random_uuid(),
  /** Людський номер. У базі лише число; «REQ-42» збирає застосунок. */
  number         bigint      not null,
  /** RLS-ключ. */
  team_id        uuid        not null,
  /**
   * Не для політик. Тригер tosho.audit_row_change читає обидві колонки
   * генерично, а RPC tosho.get_audit_log приймає p_workspace_id — без цієї
   * колонки історія картки писалась би, але була б нечитабельною.
   */
  workspace_id   uuid,
  title          text        not null,
  body           text,
  kind           text        not null default 'friction',
  status         text        not null default 'triage',
  /** Приватна картка: видно лише власнику й SEO. */
  is_private     boolean     not null default false,
  /** Автор у CRM. null — автор написав із Telegram і бота ще не підключив. */
  author_user_id uuid,
  tg_user_id     bigint,
  tg_username    text,
  /**
   * Ім'я автора як його показує Telegram.
   *
   * Не дублікат tg_username: у Telegram username НЕОБОВ'ЯЗКОВИЙ, і без цього
   * поля автор без «@» лишався б у картці безіменним числом — тобто рівно той
   * випадок, заради якого картка вміє жити без прив'язаного акаунта.
   */
  display_name   text,
  tg_chat_id     bigint,
  tg_message_id  bigint,
  /** Скільки людей просили те саме. Пріоритетний сигнал. */
  asked_by_count integer     not null default 1,
  /** Припущення, за якими рухаємось, поки ніхто не заперечив. */
  assumptions    jsonb       not null default '[]'::jsonb,
  /** SHA комітів цієї справи. Заповнюється у фазі 2. */
  commit_shas    text[]      not null default '{}',
  released_at    timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint dev_requests_kind_check
    check (kind in ('bug', 'friction', 'feature')),
  -- Перелік не остаточний: статус 'someday' («Ідеї») додає окремим файлом
  -- scripts/dev-requests-someday.sql. На чистій базі треба запустити обидва.
  constraint dev_requests_status_check
    check (status in ('triage', 'queued', 'in_progress', 'done_local', 'released', 'wont_do')),
  constraint dev_requests_number_unique unique (team_id, number)
);

-- Догін для баз, де таблиця вже створена першою версією цього файлу:
-- create table if not exists колонку не додає.
alter table tosho.dev_requests
  add column if not exists display_name text;

comment on table tosho.dev_requests is
  'Запити на доробку CRM: з робочого чату, з дошки або заднім числом із релізу. Дизайн — docs/DEV_REQUESTS_DESIGN.md';

-- Дублікати від ретраїв Telegram: вебхук не має ідемпотентності по update_id,
-- тож захищаємось на рівні даних — одне повідомлення = максимум одна картка.
create unique index if not exists dev_requests_tg_message_key
  on tosho.dev_requests (tg_chat_id, tg_message_id)
  where tg_message_id is not null;

create index if not exists dev_requests_board_idx
  on tosho.dev_requests (team_id, status, created_at desc);

-- updated_at тримає БД, а не фронт.
create or replace function tosho.touch_dev_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_dev_requests_touch on tosho.dev_requests;
create trigger trg_dev_requests_touch
  before update on tosho.dev_requests
  for each row execute function tosho.touch_dev_requests_updated_at();

-- Історія змін полів — наявний генеричний аудит, свого логу не заводимо.
drop trigger if exists trg_dev_requests_audit on tosho.dev_requests;
create trigger trg_dev_requests_audit
  after insert or update or delete on tosho.dev_requests
  for each row execute function tosho.audit_row_change('dev_request');

alter table tosho.dev_requests enable row level security;

-- Дві політики через OR замість однієї з OR всередині: так помилка в одній
-- гілці не валить іншу.
drop policy if exists dev_requests_team_read on tosho.dev_requests;
create policy dev_requests_team_read on tosho.dev_requests
  for select using (not is_private and public.is_team_member(team_id));

drop policy if exists dev_requests_privileged_read on tosho.dev_requests;
create policy dev_requests_privileged_read on tosho.dev_requests
  for select using (tosho.is_owner_or_seo());

-- Заводити картку може будь-хто зі своєї команди; приватну — лише owner/SEO.
drop policy if exists dev_requests_insert on tosho.dev_requests;
create policy dev_requests_insert on tosho.dev_requests
  for insert with check (
    public.is_team_member(team_id)
    and (not is_private or tosho.is_owner_or_seo())
  );

-- Рухати картку по дошці — лише owner/SEO: це рішення про чергу робіт.
drop policy if exists dev_requests_update on tosho.dev_requests;
create policy dev_requests_update on tosho.dev_requests
  for update using (tosho.is_owner_or_seo())
  with check (tosho.is_owner_or_seo());

revoke all on tosho.dev_requests from anon;
grant select, insert, update on tosho.dev_requests to authenticated;

-- Нумерація: переюзуємо наявний атомарний лічильник, лише розширюємо перелік
-- видів. Своєї таблиці лічильників не заводимо.
alter table tosho.document_counters
  drop constraint if exists document_counters_kind_check;
alter table tosho.document_counters
  add constraint document_counters_kind_check
  check (kind in ('invoice', 'dev_request'));

commit;

notify pgrst, 'reload schema';
