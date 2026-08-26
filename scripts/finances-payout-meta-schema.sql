-- Finance module — payout overlay over the existing payroll sheet.
-- The amounts live in tosho.payroll_entries (legacy /payroll page, has real data).
-- This table adds the finance-specific layer: яка юрособа платить (ФОП/ТОВ),
-- з якої каси, та статус виплати. Keyed the same way (user_id + period) but
-- team-scoped like the other finance_* tables. See docs/FINANCES_DESIGN.md.
-- Safe to run multiple times.

begin;

create table if not exists tosho.finance_payout_meta (
  team_id uuid not null,
  user_id uuid not null,
  period date not null,                              -- YYYY-MM-01, matches payroll_entries
  legal_entity_id uuid references tosho.finance_legal_entities (id) on delete set null,
  account_id uuid references tosho.finance_accounts (id) on delete set null,
  status text not null default 'pending',            -- pending | paid
  paid_at date,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (team_id, user_id, period)
);

alter table tosho.finance_payout_meta
  drop constraint if exists finance_payout_meta_status_check;
alter table tosho.finance_payout_meta
  add constraint finance_payout_meta_status_check
  check (status in ('pending', 'paid'));

create index if not exists finance_payout_meta_team_period_idx
  on tosho.finance_payout_meta (team_id, period);

drop trigger if exists finance_payout_meta_touch on tosho.finance_payout_meta;
create trigger finance_payout_meta_touch
before update on tosho.finance_payout_meta
for each row execute function tosho.finance_touch_updated_at();

-- RLS. Політики тут НЕ створюються навмисно.
--
-- Раніше цей файл роздавав доступ усій команді (`public.is_team_member`), а
-- scripts/finances-access-rls.sql потім перетирав його вужчим правилом. Хто
-- запустився останнім, той і вирішував, — а запустити цей файл виглядало
-- безпечно, бо він «лише про таблицю». Виплати команді відкривались усім
-- мовчки й без жодної помилки.
--
-- Тепер контур один: політики для tosho.finance_payout_meta живуть у
-- scripts/finances-access-rls.sql (`tosho.has_payroll_access` — власник + SEO).
-- RLS вмикаємо тут, і без політик таблиця закрита для всіх — це правильний бік
-- відмови, якщо файл колись запустять на чистій базі окремо.
alter table tosho.finance_payout_meta enable row level security;
grant select, insert, update, delete on tosho.finance_payout_meta to authenticated;

notify pgrst, 'reload schema';

commit;
