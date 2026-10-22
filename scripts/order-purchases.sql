-- ---------------------------------------------------------------------------
-- Закупки під замовлення: вкладка «Економіка» (REQ-56, пункти c7, c9–c12).
--
-- НАВІЩО. Собівартість замовлення досі жила в ексельці Влада: під рахунком
-- замовнику — рядки закупок і підрядників з номерами рахунків, сумами й
-- датами. Тепер бухгалтерія вносить рахунки постачальників у самому
-- замовленні, оплата рядка одразу стає витратою у Фінансах, склад підтверджує
-- отримання товару, і без цього не виписується ВН. Спец:
-- docs/superpowers/specs/2026-10-22-order-economics-design.md
--
-- ДЕ ЛЕЖАТЬ ДАНІ. Рядок закупки — tosho.order_purchases (один рахунок
-- постачальника під одну позицію чи «на все замовлення»). Неоплачений рядок
-- живе лише тут; оплата створює витрату в tosho.finance_expenses і пише її id
-- у expense_id. Позначка «закупок немає» — orders.purchases_none_at/_by.
--
-- ХТО ЩО МОЖЕ. Пряме читання таблиці — has_finance_access (owner, seo,
-- бухгалтери всіх рівнів). Запис — лише через security definer RPC нижче:
--   • внести, змінити, видалити, оплатити, скасувати оплату — writer
--     (is_order_invoice_issuer: owner, seo, accountant, chief_accountant);
--   • підтвердити отримання — receiver (writer + logistics, head_of_logistics,
--     head_of_production, pm);
--   • «закупок немає» — лише accountant, chief_accountant.
-- Склад читає рядки через list_order_purchases без сум, ПДВ і стану оплати:
-- разом із сумою рахунку замовнику сума закупки дає маржу, а її бачать четверо.
-- Менеджер не отримує нічого — ні з таблиці, ні з RPC.
--
-- ОХОРОНЦІ. Витрату, народжену з рядка, з Фінансів не видаляють і міняють їй
-- лише категорію, нотатки, рахунок і файл (finance_expenses_purchase_guard). ВН не зберігається,
-- поки немає рядків чи позначки або склад не підтвердив отримання
-- (orders_waybill_purchase_gate). Позначку «закупок немає» напряму в orders не
-- пишуть (orders_purchases_none_guard). Обхід — GUC-прапорець
-- tosho.purchase_sync, який ставлять лише ці функції; сервіс і крони (без
-- auth.uid()) охоронці не чіпають.
--
-- Застосування: npm run db:apply scripts/order-purchases.sql
-- ---------------------------------------------------------------------------

create table if not exists tosho.order_purchases (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  order_id uuid not null references tosho.orders(id) on delete cascade,
  order_item_id uuid references tosho.order_items(id) on delete set null,
  description text not null
    constraint order_purchases_description_len check (char_length(btrim(description)) between 1 and 300),
  supplier_name text not null
    constraint order_purchases_supplier_len check (char_length(btrim(supplier_name)) between 1 and 200),
  supplier_invoice_number text,
  supplier_invoice_date date not null,
  qty numeric,
  unit text,
  amount numeric(14,2) not null check (amount >= 0),
  vat_mode text not null default 'with_vat' check (vat_mode in ('with_vat', 'no_vat')),
  -- ФОП (no_vat) × 1,2 до копійок — ставка 20% фіксована; «з ПДВ» = сума.
  cost_with_vat numeric(14,2) generated always as (
    case when vat_mode = 'no_vat' then round(amount * 1.2, 2) else amount end
  ) stored,
  received_on date,
  received_qty numeric,
  received_doc_kind text check (received_doc_kind in ('waybill', 'act')),
  received_doc_number text,
  received_by uuid,
  received_at timestamptz,
  expense_id uuid unique references tosho.finance_expenses(id) on delete restrict,
  paid_on date,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table tosho.order_purchases is
  'Рахунки постачальників і підрядників під замовлення. Запис лише через RPC (order-purchases.sql).';
comment on column tosho.order_purchases.cost_with_vat is
  'Собівартість з ПДВ: with_vat = amount, no_vat (ФОП) = round(amount × 1,2, 2).';
comment on column tosho.order_purchases.expense_id is
  'Витрата у Фінансах, створена оплатою рядка. Порожньо = «рахунок є», не оплачено.';

create index if not exists order_purchases_order_idx on tosho.order_purchases (order_id);
create index if not exists order_purchases_pending_idx
  on tosho.order_purchases (team_id) where received_on is null;

drop trigger if exists order_purchases_touch on tosho.order_purchases;
create trigger order_purchases_touch
  before update on tosho.order_purchases
  for each row execute function tosho.finance_touch_updated_at();

alter table tosho.order_purchases enable row level security;

drop policy if exists order_purchases_select on tosho.order_purchases;
create policy order_purchases_select on tosho.order_purchases
  for select to authenticated
  using (public.is_team_member(team_id) and tosho.has_finance_access(team_id));

-- Default ACL схеми роздає таблицям усе, включно з TRUNCATE (його RLS не
-- спиняє). Застосунку лишаємо тільки читання; запис — RPC.
revoke all on table tosho.order_purchases from public, anon, authenticated;
grant select on table tosho.order_purchases to authenticated;

alter table tosho.orders
  add column if not exists purchases_none_at timestamptz,
  add column if not exists purchases_none_by uuid;

comment on column tosho.orders.purchases_none_at is
  'Бухгалтерія позначила «закупок немає» — гейт ВН пропускає замовлення без рядків закупок.';

-- ---------------------------------------------------------------------------
-- Хто є хто. Дзеркало в коді — src/lib/permissions.ts (поруч із canIssueOrderInvoice).
-- ---------------------------------------------------------------------------

/** Склад: підтверджує отримання. Writer — теж. */
create or replace function tosho.is_order_purchase_receiver(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = tosho, public, auth
as $$
  select tosho.is_order_invoice_issuer(_user_id)
    or exists (
      select 1
        from tosho.memberships m
       where m.user_id = _user_id
         and lower(coalesce(m.job_role::text, '')) in ('logistics', 'head_of_logistics', 'head_of_production', 'pm')
    );
$$;

/** «Закупок немає» ставлять і знімають лише бухгалтер і головбух (слова Влада). */
create or replace function tosho.is_order_purchase_none_marker(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = tosho, public, auth
as $$
  select exists (
    select 1
      from tosho.memberships m
     where m.user_id = _user_id
       and lower(coalesce(m.job_role::text, '')) in ('accountant', 'chief_accountant')
  );
$$;

create or replace function tosho.assert_order_purchase_access(_team_id uuid, _need text)
returns void
language plpgsql
stable
security definer
set search_path = tosho, public, auth
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null or _team_id is null or not public.is_team_member(_team_id) then
    raise exception 'Немає доступу до закупок замовлення' using errcode = '42501';
  end if;
  if _need = 'writer' then
    if not tosho.is_order_invoice_issuer(_uid) then
      raise exception 'Закупки вносить і оплачує бухгалтерія або СЕО' using errcode = '42501';
    end if;
  elsif _need = 'receiver' then
    if not tosho.is_order_purchase_receiver(_uid) then
      raise exception 'Отримання підтверджує склад, проджект або бухгалтерія' using errcode = '42501';
    end if;
  elsif _need = 'none_marker' then
    if not tosho.is_order_purchase_none_marker(_uid) then
      raise exception 'Позначку «закупок немає» ставить бухгалтер або головбух' using errcode = '42501';
    end if;
  else
    raise exception 'Невідомий рівень доступу: %', _need using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Охоронці.
-- ---------------------------------------------------------------------------

/**
 * Витрата із закупки: з Фінансів не видаляють, а міняти можна лише категорію,
 * нотатки, рахунок і файл. Білий список, а не чорний: форма Фінансів шле всі
 * колонки, і «регулярна», «змінна сума», ПДВ чи ручні суми за місяці інакше
 * мовчки розвели б Фінанси із замовленням. Незмінені значення проходять
 * (порівняння рядків без дозволених ключів). Обхід — tosho.purchase_sync.
 */
create or replace function tosho.finance_expenses_purchase_guard()
returns trigger
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
begin
  if auth.uid() is null
     or coalesce(current_setting('tosho.purchase_sync', true), '') = 'on'
     or not exists (select 1 from tosho.order_purchases p where p.expense_id = old.id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Витрату із закупки прибирають у замовленні: скасуйте оплату закупки'
      using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['category_id', 'notes', 'account_id', 'file', 'updated_at'])
     is distinct from (to_jsonb(old) - array['category_id', 'notes', 'account_id', 'file', 'updated_at']) then
    raise exception 'Витрату із закупки виправляють у замовленні' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists finance_expenses_purchase_guard on tosho.finance_expenses;
create trigger finance_expenses_purchase_guard
  before update or delete on tosho.finance_expenses
  for each row execute function tosho.finance_expenses_purchase_guard();

/**
 * Оплачений рядок не зникає мовчки — ні видаленням, ні каскадом від видалення
 * замовлення: інакше у Фінансах лишилась би витрата без рядка.
 */
create or replace function tosho.order_purchases_guard_delete()
returns trigger
language plpgsql
set search_path = tosho, public, auth
as $$
begin
  if old.expense_id is not null
     and auth.uid() is not null
     and coalesce(current_setting('tosho.purchase_sync', true), '') <> 'on' then
    raise exception 'Закупку «%» оплачено — спершу скасуйте оплату', old.description
      using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists order_purchases_guard_delete on tosho.order_purchases;
create trigger order_purchases_guard_delete
  before delete on tosho.order_purchases
  for each row execute function tosho.order_purchases_guard_delete();

/** «Закупок немає» пишеться лише через set_order_purchases_none. */
create or replace function tosho.orders_purchases_none_guard()
returns trigger
language plpgsql
set search_path = tosho, public, auth
as $$
begin
  if auth.uid() is null or coalesce(current_setting('tosho.purchase_sync', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.purchases_none_at := null;
    new.purchases_none_by := null;
    return new;
  end if;
  if new.purchases_none_at is distinct from old.purchases_none_at
     or new.purchases_none_by is distinct from old.purchases_none_by then
    raise exception 'Позначку «закупок немає» ставить бухгалтерія у вкладці «Економіка»'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_purchases_none_guard on tosho.orders;
create trigger orders_purchases_none_guard
  before insert or update of purchases_none_at, purchases_none_by on tosho.orders
  for each row execute function tosho.orders_purchases_none_guard();

/**
 * Гейт ВН. Замовлення, що закривається ВН (не актом), не отримує номер ВН, поки
 * немає рядків і позначки або склад не підтвердив отримання. Спрацьовує лише на
 * першому внесенні номера: уже внесені ВН заднім числом не ламаємо. Іде після
 * orders_closing_document_number (за абеткою), тож номер уже обрізаний.
 */
create or replace function tosho.orders_waybill_purchase_gate()
returns trigger
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
declare
  _total integer;
  _pending text[];
  _pending_count integer;
begin
  if old.waybill_number is not null
     or new.waybill_number is null
     or coalesce(new.closing_document, 'waybill') = 'act'
     or auth.uid() is null then
    return new;
  end if;

  select count(*),
         count(*) filter (where received_on is null),
         (array_agg(description order by created_at) filter (where received_on is null))[1:5]
    into _total, _pending_count, _pending
    from tosho.order_purchases
   where order_id = new.id;

  if _total = 0 and new.purchases_none_at is null then
    raise exception 'Внесіть закупки або позначку «закупок немає»' using errcode = 'P0001';
  end if;
  if _pending_count > 0 then
    raise exception 'Склад ще не підтвердив отримання: %',
      array_to_string(_pending, ', ')
        || case when _pending_count > 5 then format(' та ще %s', _pending_count - 5) else '' end
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_waybill_purchase_gate on tosho.orders;
create trigger orders_waybill_purchase_gate
  before update of waybill_number on tosho.orders
  for each row execute function tosho.orders_waybill_purchase_gate();

-- ---------------------------------------------------------------------------
-- RPC: рядки.
-- ---------------------------------------------------------------------------

/** Внести (p_id null) або змінити рядок. На оплаченому — лише опис, № рахунку, кількість, одиниця. */
create or replace function tosho.save_order_purchase(
  p_id uuid,
  p_order_id uuid,
  p_order_item_id uuid,
  p_description text,
  p_supplier_name text,
  p_invoice_number text,
  p_invoice_date date,
  p_qty numeric,
  p_unit text,
  p_amount numeric,
  p_vat_mode text
)
returns uuid
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
declare
  _order tosho.orders;
  _row tosho.order_purchases;
  _description text := nullif(btrim(coalesce(p_description, '')), '');
  _supplier text := nullif(btrim(coalesce(p_supplier_name, '')), '');
  _invoice text := nullif(btrim(coalesce(p_invoice_number, '')), '');
  _unit text := nullif(btrim(coalesce(p_unit, '')), '');
  _amount numeric := round(p_amount, 2);
  _vat text := coalesce(nullif(btrim(coalesce(p_vat_mode, '')), ''), 'with_vat');
  _id uuid;
begin
  -- Замок на замовленні: «закупок немає» й новий рядок не проходять разом.
  select * into _order from tosho.orders where id = p_order_id for update;
  if not found then
    raise exception 'Замовлення не знайдено' using errcode = '22023';
  end if;
  perform tosho.assert_order_purchase_access(_order.team_id, 'writer');

  if _order.purchases_none_at is not null then
    raise exception 'На замовленні стоїть «закупок немає» — спершу зніміть позначку' using errcode = '22023';
  end if;
  if _description is null or char_length(_description) > 300 then
    raise exception 'Опишіть, що закуповуємо (до 300 символів)' using errcode = '22023';
  end if;
  if _supplier is null or char_length(_supplier) > 200 then
    raise exception 'Вкажіть постачальника' using errcode = '22023';
  end if;
  if p_invoice_date is null then
    raise exception 'Вкажіть дату рахунку постачальника' using errcode = '22023';
  end if;
  if _amount is null or _amount < 0 then
    raise exception 'Сума рахунку не може бути від''ємною' using errcode = '22023';
  end if;
  if _vat not in ('with_vat', 'no_vat') then
    raise exception 'Невідомий режим ПДВ' using errcode = '22023';
  end if;
  if p_qty is not null and p_qty <= 0 then
    raise exception 'Кількість має бути більшою за нуль' using errcode = '22023';
  end if;
  if p_order_item_id is not null and not exists (
    select 1 from tosho.order_items i where i.id = p_order_item_id and i.order_id = _order.id
  ) then
    raise exception 'Позиція не з цього замовлення' using errcode = '22023';
  end if;

  if p_id is null then
    insert into tosho.order_purchases (
      team_id, order_id, order_item_id, description, supplier_name,
      supplier_invoice_number, supplier_invoice_date, qty, unit, amount, vat_mode, created_by
    ) values (
      _order.team_id, _order.id, p_order_item_id, _description, _supplier,
      _invoice, p_invoice_date, p_qty, _unit, _amount, _vat, auth.uid()
    )
    returning id into _id;
    return _id;
  end if;

  select * into _row from tosho.order_purchases where id = p_id for update;
  if not found or _row.order_id <> _order.id then
    raise exception 'Закупку не знайдено' using errcode = '22023';
  end if;

  if _row.expense_id is not null then
    if _row.amount is distinct from _amount
       or _row.vat_mode is distinct from _vat
       or _row.order_item_id is distinct from p_order_item_id
       or _row.supplier_name is distinct from _supplier
       or _row.supplier_invoice_date is distinct from p_invoice_date then
      raise exception 'Закупку оплачено: суму, ПДВ, позицію, постачальника й дату рахунку міняють, скасувавши оплату'
        using errcode = '22023';
    end if;
    update tosho.order_purchases
       set description = _description,
           supplier_invoice_number = _invoice,
           qty = p_qty,
           unit = _unit
     where id = p_id;
    return p_id;
  end if;

  update tosho.order_purchases
     set order_item_id = p_order_item_id,
         description = _description,
         supplier_name = _supplier,
         supplier_invoice_number = _invoice,
         supplier_invoice_date = p_invoice_date,
         qty = p_qty,
         unit = _unit,
         amount = _amount,
         vat_mode = _vat
   where id = p_id;
  return p_id;
end;
$$;

/** Видалити неоплачений рядок. */
create or replace function tosho.delete_order_purchase(p_id uuid)
returns void
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
declare
  _row tosho.order_purchases;
begin
  select * into _row from tosho.order_purchases where id = p_id for update;
  if not found then
    raise exception 'Закупку не знайдено' using errcode = '22023';
  end if;
  perform tosho.assert_order_purchase_access(_row.team_id, 'writer');
  if _row.expense_id is not null then
    raise exception 'Закупку оплачено — спершу скасуйте оплату' using errcode = '22023';
  end if;
  delete from tosho.order_purchases where id = p_id;
end;
$$;

/**
 * «Оплачено»: витрата у Фінансах + зв'язок з рядком, одна транзакція.
 * Сума витрати — фактично сплачене (для ФОП без × 1,2); ПДВ — сума / 6 для
 * рядка «з ПДВ», 0 для ФОП. Повертає id витрати.
 */
create or replace function tosho.pay_order_purchase(
  p_id uuid,
  p_paid_on date,
  p_account_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
declare
  _row tosho.order_purchases;
  _order tosho.orders;
  _account tosho.finance_accounts;
  _today date := (now() at time zone 'Europe/Kyiv')::date;
  _amount numeric := round(p_amount, 2);
  _category_id uuid;
  _expense_id uuid;
begin
  select * into _row from tosho.order_purchases where id = p_id for update;
  if not found then
    raise exception 'Закупку не знайдено' using errcode = '22023';
  end if;
  perform tosho.assert_order_purchase_access(_row.team_id, 'writer');
  if _row.expense_id is not null then
    raise exception 'Закупку вже оплачено' using errcode = '22023';
  end if;
  if _amount is null or _amount <= 0 then
    raise exception 'Сума платежу має бути більшою за нуль' using errcode = '22023';
  end if;
  if p_paid_on is null or p_paid_on > _today then
    raise exception 'Дата оплати не може бути в майбутньому' using errcode = '22023';
  end if;

  select * into _order from tosho.orders where id = _row.order_id;

  select * into _account
    from tosho.finance_accounts
   where id = p_account_id and team_id = _row.team_id and is_active;
  if not found then
    raise exception 'Оберіть рахунок, з якого платили' using errcode = '22023';
  end if;
  if _account.currency <> 'UAH' then
    raise exception 'Рахунок «%» не гривневий', _account.name using errcode = '22023';
  end if;
  if _account.legal_entity_id is not null
     and _order.our_legal_entity_id is not null
     and _account.legal_entity_id <> _order.our_legal_entity_id then
    raise exception 'Рахунок «%» належить іншій юрособі', _account.name using errcode = '22023';
  end if;

  -- Категорія «Закупки під замовлення» — одна на команду; два паралельні
  -- платежі не заводять дві.
  perform pg_advisory_xact_lock(hashtext('tosho.order_purchase_category:' || _row.team_id::text));
  select c.id into _category_id
    from tosho.finance_expense_categories c
   where c.team_id = _row.team_id and lower(btrim(c.name)) = lower('Закупки під замовлення')
   order by c.is_active desc, c.created_at
   limit 1;
  if _category_id is null then
    insert into tosho.finance_expense_categories (team_id, name, kind, is_active, sort_order)
    values (
      _row.team_id, 'Закупки під замовлення', 'variable', true,
      coalesce((select max(c.sort_order) + 1 from tosho.finance_expense_categories c where c.team_id = _row.team_id), 0)
    )
    returning id into _category_id;
  end if;

  insert into tosho.finance_expenses (
    team_id, legal_entity_id, account_id, category_id, supplier_name,
    amount, vat_amount, expense_date, currency, notes, entered_by
  ) values (
    _row.team_id, _order.our_legal_entity_id, _account.id, _category_id, _row.supplier_name,
    _amount,
    case when _row.vat_mode = 'with_vat' then round(_amount / 6, 2) else 0 end,
    p_paid_on, 'UAH',
    concat_ws(' · ', coalesce(nullif(btrim(_order.quote_number), ''), _order.id::text), _row.description, _row.supplier_invoice_number),
    auth.uid()
  )
  returning id into _expense_id;

  update tosho.order_purchases
     set expense_id = _expense_id, paid_on = p_paid_on
   where id = p_id;

  return _expense_id;
end;
$$;

/** Скасувати оплату: видаляє витрату, створену оплатою, рядок вертається в «рахунок є». */
create or replace function tosho.cancel_order_purchase_payment(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
declare
  _row tosho.order_purchases;
  _reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into _row from tosho.order_purchases where id = p_id for update;
  if not found then
    raise exception 'Закупку не знайдено' using errcode = '22023';
  end if;
  perform tosho.assert_order_purchase_access(_row.team_id, 'writer');
  if _row.expense_id is null then
    raise exception 'Закупку не оплачено' using errcode = '22023';
  end if;
  if _reason is null then
    raise exception 'Вкажіть причину скасування' using errcode = '22023';
  end if;

  perform set_config('tosho.purchase_sync', 'on', true);
  update tosho.order_purchases
     set expense_id = null, paid_on = null
   where id = p_id;
  delete from tosho.finance_expenses where id = _row.expense_id;
  perform set_config('tosho.purchase_sync', 'off', true);
end;
$$;

/** Склад підтверджує отримання. Повторний виклик виправляє. */
create or replace function tosho.confirm_order_purchase_receipt(
  p_id uuid,
  p_received_on date,
  p_received_qty numeric,
  p_doc_kind text,
  p_doc_number text
)
returns void
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
declare
  _row tosho.order_purchases;
  _today date := (now() at time zone 'Europe/Kyiv')::date;
  _doc_number text := nullif(btrim(coalesce(p_doc_number, '')), '');
begin
  select * into _row from tosho.order_purchases where id = p_id for update;
  if not found then
    raise exception 'Закупку не знайдено' using errcode = '22023';
  end if;
  perform tosho.assert_order_purchase_access(_row.team_id, 'receiver');
  if p_received_on is null or p_received_on > _today then
    raise exception 'Дата отримання не може бути порожньою чи в майбутньому' using errcode = '22023';
  end if;
  if p_received_qty is null or p_received_qty <= 0 then
    raise exception 'Отримана кількість має бути більшою за нуль' using errcode = '22023';
  end if;
  if p_doc_kind is null or p_doc_kind not in ('waybill', 'act') then
    raise exception 'Оберіть документ постачальника: ВН або акт' using errcode = '22023';
  end if;
  if _doc_number is null then
    raise exception 'Вкажіть номер документа постачальника' using errcode = '22023';
  end if;

  update tosho.order_purchases
     set received_on = p_received_on,
         received_qty = p_received_qty,
         received_doc_kind = p_doc_kind,
         received_doc_number = left(_doc_number, 100),
         received_by = auth.uid(),
         received_at = timezone('utc', now())
   where id = p_id;
end;
$$;

/** Поставити чи зняти «закупок немає». З рядками — не ставиться. */
create or replace function tosho.set_order_purchases_none(p_order_id uuid, p_none boolean)
returns void
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
declare
  _order tosho.orders;
begin
  select * into _order from tosho.orders where id = p_order_id for update;
  if not found then
    raise exception 'Замовлення не знайдено' using errcode = '22023';
  end if;
  perform tosho.assert_order_purchase_access(_order.team_id, 'none_marker');

  if coalesce(p_none, false) then
    if exists (select 1 from tosho.order_purchases p where p.order_id = _order.id) then
      raise exception 'У замовленні вже є закупки — позначка «закупок немає» не потрібна' using errcode = '22023';
    end if;
    if _order.purchases_none_at is not null then
      return;
    end if;
    perform set_config('tosho.purchase_sync', 'on', true);
    update tosho.orders
       set purchases_none_at = timezone('utc', now()), purchases_none_by = auth.uid()
     where id = _order.id;
    perform set_config('tosho.purchase_sync', 'off', true);
  elsif _order.purchases_none_at is not null then
    perform set_config('tosho.purchase_sync', 'on', true);
    update tosho.orders
       set purchases_none_at = null, purchases_none_by = null
     where id = _order.id;
    perform set_config('tosho.purchase_sync', 'off', true);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: читання.
-- ---------------------------------------------------------------------------

/**
 * Рядки закупок замовлення. Writer і has_finance_access — повністю; склад —
 * без суми, собівартості, ПДВ і стану оплати (null).
 */
create or replace function tosho.list_order_purchases(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = tosho, public, auth
as $$
declare
  _order tosho.orders;
  _uid uuid := auth.uid();
  _sees_amounts boolean;
begin
  select * into _order from tosho.orders where id = p_order_id;
  if not found or _uid is null or not public.is_team_member(_order.team_id) then
    raise exception 'Замовлення не знайдено' using errcode = '42501';
  end if;
  _sees_amounts := tosho.has_finance_access(_order.team_id) or tosho.is_order_invoice_issuer(_uid);
  if not _sees_amounts and not tosho.is_order_purchase_receiver(_uid) then
    raise exception 'Немає доступу до закупок замовлення' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
             to_jsonb(p)
               || jsonb_build_object(
                    'received_by_name',
                    coalesce(
                      (select nullif(btrim(tmp.full_name), '') from tosho.team_member_profiles tmp where tmp.user_id = p.received_by limit 1),
                      (select nullif(btrim(mv.full_name), '') from tosho.memberships_view mv where mv.user_id = p.received_by limit 1)
                    )
                  )
               || case when _sees_amounts then '{}'::jsonb else jsonb_build_object(
                    'amount', null, 'cost_with_vat', null, 'vat_mode', null, 'paid_on', null, 'expense_id', null
                  ) end
             order by p.created_at, p.id
           )
      from tosho.order_purchases p
     where p.order_id = _order.id
  ), '[]'::jsonb);
end;
$$;

/**
 * «Документи постачальників» для складу: неотримані рядки й замовлення з
 * позначкою «закупок немає» по відкритих замовленнях команди. Без сум.
 */
create or replace function tosho.list_pending_purchase_receipts(p_team_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = tosho, public, auth
as $$
begin
  perform tosho.assert_order_purchase_access(p_team_id, 'receiver');

  return jsonb_build_object(
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
               'purchase_id', p.id,
               'order_id', o.id,
               'order_number', o.quote_number,
               'description', p.description,
               'supplier_name', p.supplier_name,
               'supplier_invoice_number', p.supplier_invoice_number,
               'supplier_invoice_date', p.supplier_invoice_date
             ) order by p.supplier_invoice_date, p.created_at)
        from tosho.order_purchases p
        join tosho.orders o on o.id = p.order_id
       where p.team_id = p_team_id
         and o.team_id = p_team_id
         and p.received_on is null
         and coalesce(o.order_status, '') not in ('completed', 'cancelled')
    ), '[]'::jsonb),
    'none_orders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id', o.id,
               'order_number', o.quote_number,
               'marked_at', o.purchases_none_at,
               'marked_by_name', coalesce(
                 (select nullif(btrim(tmp.full_name), '') from tosho.team_member_profiles tmp where tmp.user_id = o.purchases_none_by limit 1),
                 (select nullif(btrim(mv.full_name), '') from tosho.memberships_view mv where mv.user_id = o.purchases_none_by limit 1)
               )
             ) order by o.purchases_none_at desc)
        from tosho.orders o
       where o.team_id = p_team_id
         and o.purchases_none_at is not null
         and coalesce(o.order_status, '') not in ('completed', 'cancelled')
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Права. Default ACL схеми роздає нові функції всім — знімаємо явно.
-- ---------------------------------------------------------------------------

revoke all on function tosho.is_order_purchase_receiver(uuid) from public, anon, authenticated;
revoke all on function tosho.is_order_purchase_none_marker(uuid) from public, anon, authenticated;
revoke all on function tosho.assert_order_purchase_access(uuid, text) from public, anon, authenticated;
revoke all on function tosho.finance_expenses_purchase_guard() from public, anon, authenticated;
revoke all on function tosho.order_purchases_guard_delete() from public, anon, authenticated;
revoke all on function tosho.orders_purchases_none_guard() from public, anon, authenticated;
revoke all on function tosho.orders_waybill_purchase_gate() from public, anon, authenticated;

revoke all on function tosho.save_order_purchase(uuid, uuid, uuid, text, text, text, date, numeric, text, numeric, text) from public, anon;
revoke all on function tosho.delete_order_purchase(uuid) from public, anon;
revoke all on function tosho.pay_order_purchase(uuid, date, uuid, numeric) from public, anon;
revoke all on function tosho.cancel_order_purchase_payment(uuid, text) from public, anon;
revoke all on function tosho.confirm_order_purchase_receipt(uuid, date, numeric, text, text) from public, anon;
revoke all on function tosho.set_order_purchases_none(uuid, boolean) from public, anon;
revoke all on function tosho.list_order_purchases(uuid) from public, anon;
revoke all on function tosho.list_pending_purchase_receipts(uuid) from public, anon;
grant execute on function tosho.save_order_purchase(uuid, uuid, uuid, text, text, text, date, numeric, text, numeric, text) to authenticated;
grant execute on function tosho.delete_order_purchase(uuid) to authenticated;
grant execute on function tosho.pay_order_purchase(uuid, date, uuid, numeric) to authenticated;
grant execute on function tosho.cancel_order_purchase_payment(uuid, text) to authenticated;
grant execute on function tosho.confirm_order_purchase_receipt(uuid, date, numeric, text, text) to authenticated;
grant execute on function tosho.set_order_purchases_none(uuid, boolean) to authenticated;
grant execute on function tosho.list_order_purchases(uuid) to authenticated;
grant execute on function tosho.list_pending_purchase_receipts(uuid) to authenticated;

notify pgrst, 'reload schema';
