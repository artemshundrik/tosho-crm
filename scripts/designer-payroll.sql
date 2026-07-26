-- Зарплата дизайнерів, Фаза 1: ставки, дефолти, календар, закриття місяця.
-- Модель: docs/DESIGNER_PAYROLL_DESIGN.md
--
-- МОДЕЛЬ ДОСТУПУ (перевірено на проді 2026-07-26):
--   tosho.memberships.role = 'owner'  → IT-спеціаліст  (бачить усе, Rule 0)
--   tosho.memberships.role = 'admin'  → SEO (2 особи)  (бачить усе, налаштовує)
--   tosho.memberships.role = 'member' → дизайнери, менеджери, PM, решта
-- tosho.is_workspace_admin(ws) повертає true рівно для owner+admin, тож він і є
-- гейтом «хто бачить чужі гроші». Дизайнер бачить лише власний рядок
-- (user_id = auth.uid()). Менеджер — НІЧОГО: жодної team-member політики тут
-- бути не повинно.
--
-- Ідемпотентний: можна ганяти повторно.

begin;

-- ---------------------------------------------------------------- дефолти
create table if not exists tosho.designer_pay_defaults (
  workspace_id      uuid primary key references tosho.workspaces(id) on delete cascade,
  visual_norm       int           not null default 250,   -- тестове значення, уточнюємо на живих даних
  over_norm_rate    numeric(12,2) not null default 100,   -- грн за візуал понад норму
  creative_percent  numeric(5,2)  not null default 30,    -- % дизайнера з платного креативу (Фаза 2)
  min_creative_cost numeric(12,2) not null default 4500,
  updated_by        uuid references auth.users(id),
  updated_at        timestamptz   not null default now(),
  constraint designer_pay_defaults_sane check (
    visual_norm >= 0 and over_norm_rate >= 0 and creative_percent between 0 and 100
  )
);

-- ------------------------------------------------------------ ставки людей
-- Історія рядками: чинний тариф на місяць M = рядок з максимальним
-- effective_from <= першого числа M. Дата завжди 1 число (гарантує constraint),
-- бо зміна ставки набирає чинності з наступного місяця.
create table if not exists tosho.designer_pay_rates (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references tosho.workspaces(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  base_month_rate  numeric(12,2) not null,
  visual_norm      int,            -- null = взяти з defaults
  over_norm_rate   numeric(12,2),  -- null = взяти з defaults
  creative_percent numeric(5,2),   -- null = взяти з defaults
  effective_from   date not null,
  note             text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  unique (workspace_id, user_id, effective_from),
  constraint designer_pay_rates_first_of_month check (date_trunc('month', effective_from)::date = effective_from),
  constraint designer_pay_rates_sane check (
    base_month_rate >= 0
    and (visual_norm is null or visual_norm >= 0)
    and (over_norm_rate is null or over_norm_rate >= 0)
    and (creative_percent is null or creative_percent between 0 and 100)
  )
);
create index if not exists designer_pay_rates_lookup_idx
  on tosho.designer_pay_rates (workspace_id, user_id, effective_from desc);

-- ------------------------------------------------------- закриття місяця
-- Знімок сум: після закриття цифри не «пливуть», навіть якщо задачі редагують.
create table if not exists tosho.designer_pay_month_close (
  workspace_id  uuid not null references tosho.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  month         date not null,
  base_uah      numeric(12,2) not null default 0,
  over_norm_uah numeric(12,2) not null default 0,
  creatives_uah numeric(12,2) not null default 0,
  total_uah     numeric(12,2) not null default 0,
  details       jsonb not null default '{}'::jsonb,
  closed_by     uuid references auth.users(id),
  closed_at     timestamptz not null default now(),
  primary key (workspace_id, user_id, month),
  constraint designer_pay_month_close_first_of_month check (date_trunc('month', month)::date = month)
);

-- ------------------------------------------------- винятки робочого календаря
-- Порожня на старті: під час воєнного стану держсвята не є вихідними (рішення CEO).
create table if not exists tosho.ua_workday_exceptions (
  workspace_id uuid not null references tosho.workspaces(id) on delete cascade,
  day          date not null,
  is_workday   boolean not null,   -- false = вихідний у будній; true = робоча субота/неділя
  note         text,
  updated_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, day)
);

-- ============================================================ RLS
alter table tosho.designer_pay_defaults     enable row level security;
alter table tosho.designer_pay_rates        enable row level security;
alter table tosho.designer_pay_month_close  enable row level security;
alter table tosho.ua_workday_exceptions     enable row level security;

-- Гранти: тільки authenticated + service_role. anon не отримує НІЧОГО
-- (це зарплати; anon-ключ публічний і лежить у JS-бандлі).
grant select, insert, update, delete on tosho.designer_pay_defaults    to authenticated, service_role;
grant select, insert, update, delete on tosho.designer_pay_rates       to authenticated, service_role;
grant select, insert, update, delete on tosho.designer_pay_month_close to authenticated, service_role;
grant select, insert, update, delete on tosho.ua_workday_exceptions    to authenticated, service_role;
revoke all on tosho.designer_pay_defaults    from anon;
revoke all on tosho.designer_pay_rates       from anon;
revoke all on tosho.designer_pay_month_close from anon;
revoke all on tosho.ua_workday_exceptions    from anon;

-- ---- ставки: читає admin/owner або сам власник рядка; пише лише admin/owner
drop policy if exists designer_pay_rates_select on tosho.designer_pay_rates;
create policy designer_pay_rates_select on tosho.designer_pay_rates
  for select to authenticated
  using (tosho.is_workspace_admin(workspace_id) or user_id = auth.uid());

drop policy if exists designer_pay_rates_write on tosho.designer_pay_rates;
create policy designer_pay_rates_write on tosho.designer_pay_rates
  for all to authenticated
  using (tosho.is_workspace_admin(workspace_id))
  with check (tosho.is_workspace_admin(workspace_id));

-- ---- закриття місяця: та сама логіка
drop policy if exists designer_pay_month_close_select on tosho.designer_pay_month_close;
create policy designer_pay_month_close_select on tosho.designer_pay_month_close
  for select to authenticated
  using (tosho.is_workspace_admin(workspace_id) or user_id = auth.uid());

drop policy if exists designer_pay_month_close_write on tosho.designer_pay_month_close;
create policy designer_pay_month_close_write on tosho.designer_pay_month_close
  for all to authenticated
  using (tosho.is_workspace_admin(workspace_id))
  with check (tosho.is_workspace_admin(workspace_id));

-- ---- дефолти: читають admin/owner + ті, хто сам є учасником pay-системи
-- (дизайнер має бачити правила гри: норму і ставку за візуал).
drop policy if exists designer_pay_defaults_select on tosho.designer_pay_defaults;
create policy designer_pay_defaults_select on tosho.designer_pay_defaults
  for select to authenticated
  using (
    tosho.is_workspace_admin(workspace_id)
    or exists (
      select 1 from tosho.designer_pay_rates r
      where r.workspace_id = designer_pay_defaults.workspace_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists designer_pay_defaults_write on tosho.designer_pay_defaults;
create policy designer_pay_defaults_write on tosho.designer_pay_defaults
  for all to authenticated
  using (tosho.is_workspace_admin(workspace_id))
  with check (tosho.is_workspace_admin(workspace_id));

-- ---- календар: несекретний, читають усі члени; пише admin/owner
drop policy if exists ua_workday_exceptions_select on tosho.ua_workday_exceptions;
create policy ua_workday_exceptions_select on tosho.ua_workday_exceptions
  for select to authenticated
  using (tosho.is_workspace_member(workspace_id));

drop policy if exists ua_workday_exceptions_write on tosho.ua_workday_exceptions;
create policy ua_workday_exceptions_write on tosho.ua_workday_exceptions
  for all to authenticated
  using (tosho.is_workspace_admin(workspace_id))
  with check (tosho.is_workspace_admin(workspace_id));

commit;
