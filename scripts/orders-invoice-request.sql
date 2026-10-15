-- ---------------------------------------------------------------------------
-- Рахунок через бухгалтерію (REQ-322, пункт p10).
--
-- НАВІЩО. Бухгалтерія 07.10.2026: головний номер рахунку — з BAS, не з CRM.
-- Досі CRM нумерувала рахунок сама при першому відкритті
-- (assignOrderInvoiceNumber, лічильник document_counters), і номери 001–003
-- розійшлись із BAS (там на 07.10 був 407). СЕО 14.10 погодив новий порядок:
--   менеджер тисне «Створити рахунок» → бухгалтер і СЕО отримують сповіщення →
--   бухгалтер вносить номер і дату з BAS (або повертає менеджеру з коментарем) →
--   лише тоді менеджер може відкрити рахунок.
--
-- СТАН рахунку виводиться з колонок, окремого статусу немає:
--   invoice_number є                    → виписано
--   invoice_requested_at є              → у бухгалтерії
--   invoice_return_note є               → повернено менеджеру
--   нічого                              → ще не просили
--
-- ЧОМУ ТРИГЕР, А НЕ ПОЛІТИКА. orders_update пускає будь-кого з команди, а
-- політика не вміє порівняти old і new. Без тригера менеджер міг би сам
-- вписати номер — рівно те, що бухгалтерія заборонила.
--
-- КОД ЧИТАЄ НОВІ КОЛОНКИ В ЗАГАЛЬНОМУ ЗАПИТІ ЗАМОВЛЕНЬ: без них список падає
-- на базові колонки й губить умови оплати. Застосувати ДО пушу.
--
-- Застосування: npm run db:apply scripts/orders-invoice-request.sql
-- ---------------------------------------------------------------------------

alter table tosho.orders
  add column if not exists invoice_requested_at timestamptz,
  add column if not exists invoice_requested_by uuid,
  add column if not exists invoice_date date,
  add column if not exists invoice_issued_by uuid,
  add column if not exists invoice_returned_at timestamptz,
  add column if not exists invoice_return_note text;

comment on column tosho.orders.invoice_requested_at is
  'Коли менеджер попросив рахунок. Лишається й після виписки — видно, хто й коли просив.';
comment on column tosho.orders.invoice_date is
  'Дата рахунку з BAS. Задає бухгалтер, це не дата друку і не дата внесення.';
comment on column tosho.orders.invoice_return_note is
  'Чому бухгалтер повернув запит. Новий запит менеджера її стирає.';

-- Хто вписує номер і дату з BAS або повертає запит: бухгалтери, СЕО, власник.
-- Молодший бухгалтер теж: рахунки виписує бухгалтерія загалом, а не одна людина.
create or replace function tosho.is_order_invoice_issuer(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
  select exists (
    select 1
      from tosho.memberships m
     where m.user_id = _user_id
       and (
         lower(coalesce(m.role::text, '')) = 'owner'
         or lower(coalesce(m.job_role::text, '')) in ('seo', 'accountant', 'chief_accountant', 'junior_accountant')
       )
  );
$$;

revoke all on function tosho.is_order_invoice_issuer(uuid) from public;
grant execute on function tosho.is_order_invoice_issuer(uuid) to authenticated;

create or replace function tosho.enforce_order_invoice_flow()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
declare
  _issuing boolean := new.invoice_number is distinct from old.invoice_number
    or new.invoice_date is distinct from old.invoice_date;
  _returning boolean := new.invoice_returned_at is distinct from old.invoice_returned_at
    or new.invoice_return_note is distinct from old.invoice_return_note;
  _requesting boolean := new.invoice_requested_at is distinct from old.invoice_requested_at;
begin
  -- Сервісні записи (psql, функції без сесії) не перевіряємо: так само, як у
  -- погодженні накрутки. Застосунок завжди ходить із сесією.
  if auth.uid() is null then
    return new;
  end if;

  if not (_issuing or _returning or _requesting
          or new.invoice_requested_by is distinct from old.invoice_requested_by
          or new.invoice_issued_by is distinct from old.invoice_issued_by
          or new.invoice_created_at is distinct from old.invoice_created_at) then
    return new;
  end if;

  if _issuing then
    if not tosho.is_order_invoice_issuer(auth.uid()) then
      raise exception 'Номер і дату рахунку вносить бухгалтер з BAS'
        using errcode = '42501';
    end if;
    new.invoice_number := nullif(btrim(coalesce(new.invoice_number, '')), '');
    if new.invoice_number is not null and new.invoice_date is null then
      raise exception 'Вкажіть дату рахунку з BAS' using errcode = '23514';
    end if;
    if new.invoice_number is null then
      new.invoice_date := null;
      new.invoice_issued_by := null;
      new.invoice_created_at := null;
    else
      new.invoice_issued_by := auth.uid();
      new.invoice_created_at := coalesce(
        case when old.invoice_number is null then null else old.invoice_created_at end,
        timezone('utc', now())
      );
      new.invoice_return_note := null;
      new.invoice_returned_at := null;
    end if;
    return new;
  end if;

  if _returning then
    if not tosho.is_order_invoice_issuer(auth.uid()) then
      raise exception 'Повернути запит рахунку може бухгалтер'
        using errcode = '42501';
    end if;
    if old.invoice_number is not null then
      raise exception 'Рахунок уже виписано — повертати нема що' using errcode = '23514';
    end if;
    new.invoice_return_note := nullif(btrim(coalesce(new.invoice_return_note, '')), '');
    if new.invoice_return_note is null then
      raise exception 'Напишіть менеджеру, що виправити' using errcode = '23514';
    end if;
    new.invoice_returned_at := timezone('utc', now());
    new.invoice_requested_at := null;
    new.invoice_requested_by := old.invoice_requested_by;
    new.invoice_issued_by := old.invoice_issued_by;
    new.invoice_created_at := old.invoice_created_at;
    return new;
  end if;

  if _requesting then
    if old.invoice_number is not null then
      raise exception 'Рахунок уже виписано' using errcode = '23514';
    end if;
    if new.invoice_requested_at is null then
      -- Зняти запит без повернення може лише бухгалтерія (через «Повернути»).
      raise exception 'Запит рахунку знімає бухгалтер кнопкою «Повернути менеджеру»'
        using errcode = '42501';
    end if;
    new.invoice_requested_at := timezone('utc', now());
    new.invoice_requested_by := auth.uid();
    new.invoice_return_note := null;
    new.invoice_returned_at := null;
    new.invoice_issued_by := old.invoice_issued_by;
    new.invoice_created_at := old.invoice_created_at;
    return new;
  end if;

  -- Решта службових колонок напряму не пишеться.
  raise exception 'Ці поля рахунку ставить CRM сама' using errcode = '42501';
end;
$$;

revoke all on function tosho.enforce_order_invoice_flow() from public;

drop trigger if exists orders_invoice_flow on tosho.orders;
create trigger orders_invoice_flow
before update on tosho.orders
for each row execute function tosho.enforce_order_invoice_flow();

-- Номер з BAS не повторюється в межах року. Коли з'явиться юрособа ФОП
-- (REQ-322, пункти p1–p3) зі своєю серією, ключ треба розширити юрособою.
-- Старі номери 001–003 від лічильника CRM дати не мають — під індекс не йдуть.
create unique index if not exists orders_invoice_number_year_uniq
  on tosho.orders (team_id, invoice_number, (extract(year from invoice_date)))
  where invoice_number is not null and invoice_date is not null;
