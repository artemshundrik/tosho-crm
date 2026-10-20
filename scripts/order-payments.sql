-- ---------------------------------------------------------------------------
-- Оплати замовлення сумою й датою (REQ-322, пункт p26).
--
-- НАВІЩО. Досі статус оплати замовлення («Очікує оплату», «Частково оплачено»,
-- «Оплачено») ставили руками з меню, а скільки саме й коли прийшло, ніде не
-- лежало. Бухгалтерія вносить надходження в замовленні — сума, дата, куди
-- прийшло, № платіжки — і статус рахується з суми. Спец:
-- docs/superpowers/specs/2026-10-20-order-payment-entry-design.md
--
-- ДЕ ЛЕЖАТЬ ДАНІ. Окремої таблиці немає: це той самий tosho.finance_payments,
-- з якого Фінанси рахують доходи. Новий рядок має order_id; скасування — не
-- видалення, а cancelled_at з причиною (видно в замовленні закресленим).
--
-- ЧОМУ RPC, А НЕ ПОЛІТИКИ. finance_payments закрита для менеджерів
-- (has_finance_access), а менеджер має бачити список платежів свого
-- замовлення без рахунку й № платіжки. Запис — лише бухгалтерії й СЕО
-- (is_order_invoice_issuer, без молодшого бухгалтера, REQ-322#p16). Тому
-- запис і читання з замовлення йдуть через security definer функції нижче.
--
-- СТАТУС ІЗ СУМИ. Після кожної зміни платежу з order_id тригер
-- finance_payments_sync_order перераховує orders.payment_status. Ручну зміну
-- статусу, коли є внесені оплати, спиняє orders_payment_status_guard — крім
-- пари «Частково оплачено» ↔ «Очікує доплату», яку сума не розрізняє.
--
-- Застосування: npm run db:apply scripts/order-payments.sql
-- ---------------------------------------------------------------------------

alter table tosho.finance_payments
  add column if not exists order_id uuid references tosho.orders(id) on delete restrict,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancel_reason text;

comment on column tosho.finance_payments.order_id is
  'Замовлення, до якого внесено оплату. Заповнюється й само з quote_id (тригер finance_payments_link_order).';
comment on column tosho.finance_payments.cancelled_at is
  'Платіж скасовано в замовленні: у суму й у доходи Фінансів не йде, але лишається в історії.';

alter table tosho.finance_payments drop constraint if exists finance_payments_order_amount_positive;
alter table tosho.finance_payments
  add constraint finance_payments_order_amount_positive check (order_id is null or amount > 0);

create index if not exists finance_payments_order_active_idx
  on tosho.finance_payments (order_id) where cancelled_at is null;

-- ---------------------------------------------------------------------------
-- Правила суми. Ті самі, що в src/features/orders/orderPayments.ts.
-- ---------------------------------------------------------------------------

/** Скільки треба наперед: % передоплати з умов, інакше з пресету умов оплати. */
create or replace function tosho.order_prepayment_amount(_order tosho.orders)
returns numeric
language sql
stable
set search_path = tosho, public
as $$
  select round(
    coalesce(_order.total, 0) * coalesce(
      _order.prepayment_pct,
      case _order.payment_terms
        when '50/50' then 50
        when '70/30' then 70
        when '100_prepaid' then 100
        when '100_after' then 0
      end,
      0
    ) / 100,
    2
  );
$$;

create or replace function tosho.order_payment_status_from_sum(
  _paid numeric,
  _total numeric,
  _pre numeric,
  _current text
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(_paid, 0) <= 0 then 'awaiting_payment'
    when coalesce(_total, 0) > 0 and _paid >= _total then 'fully_paid'
    when (_pre > 0 and _paid >= _pre) or (coalesce(_pre, 0) = 0 and _paid > 0) then
      case when _current = 'awaiting_balance' then 'awaiting_balance' else 'partially_paid' end
    else 'awaiting_payment'
  end;
$$;

create or replace function tosho.order_paid_total(_order_id uuid)
returns numeric
language sql
stable
set search_path = tosho, public
as $$
  select coalesce(sum(amount), 0)
    from tosho.finance_payments
   where order_id = _order_id and cancelled_at is null;
$$;

/** Перерахувати статус оплати з суми. Внутрішня: grant authenticated немає. */
create or replace function tosho.recompute_order_payment_status(_order_id uuid)
returns text
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
declare
  _order tosho.orders;
  _next text;
begin
  select * into _order from tosho.orders where id = _order_id for update;
  if not found then
    return null;
  end if;
  _next := tosho.order_payment_status_from_sum(
    tosho.order_paid_total(_order_id),
    _order.total,
    tosho.order_prepayment_amount(_order),
    _order.payment_status
  );
  if _next is distinct from _order.payment_status then
    perform set_config('tosho.payment_sync', 'on', true);
    update tosho.orders
       set payment_status = _next, updated_at = timezone('utc', now())
     where id = _order_id;
    perform set_config('tosho.payment_sync', 'off', true);
  end if;
  return _next;
end;
$$;

revoke all on function tosho.recompute_order_payment_status(uuid) from public;
revoke all on function tosho.recompute_order_payment_status(uuid) from authenticated, anon;

create or replace function tosho.order_payment_summary(_order_id uuid)
returns jsonb
language sql
stable
set search_path = tosho, public
as $$
  select jsonb_build_object(
    'payment_status', o.payment_status,
    'paid_total', tosho.order_paid_total(o.id)
  )
    from tosho.orders o
   where o.id = _order_id;
$$;

-- ---------------------------------------------------------------------------
-- Тригери.
-- ---------------------------------------------------------------------------

/** Платіж із Фінансів за quote_id сам прив'язується до замовлення. */
create or replace function tosho.finance_payments_link_order()
returns trigger
language plpgsql
security definer
set search_path = tosho, public
as $$
begin
  if new.order_id is null and new.quote_id is not null then
    select o.id into new.order_id
      from tosho.orders o
     where o.team_id = new.team_id
       and (o.quote_id = new.quote_id or o.id = new.quote_id)
     order by o.created_at
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_payments_link_order on tosho.finance_payments;
create trigger finance_payments_link_order
  before insert or update of quote_id, order_id on tosho.finance_payments
  for each row execute function tosho.finance_payments_link_order();

/** Платіж замовлення не видаляють — скасовують з причиною. Виняток — undo. */
create or replace function tosho.finance_payments_guard_delete()
returns trigger
language plpgsql
as $$
begin
  if old.order_id is not null and coalesce(current_setting('tosho.payment_sync', true), '') <> 'on' then
    raise exception 'Платіж із замовлення скасовують у замовленні' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists finance_payments_guard_delete on tosho.finance_payments;
create trigger finance_payments_guard_delete
  before delete on tosho.finance_payments
  for each row execute function tosho.finance_payments_guard_delete();

/** Будь-яка зміна платежу з order_id (зокрема з Фінансів) перераховує статус. */
create or replace function tosho.finance_payments_sync_order()
returns trigger
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.order_id is not null then
    perform tosho.recompute_order_payment_status(old.order_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.order_id is not null
     and (tg_op = 'INSERT' or new.order_id is distinct from old.order_id) then
    perform tosho.recompute_order_payment_status(new.order_id);
  end if;
  return null;
end;
$$;

drop trigger if exists finance_payments_sync_order on tosho.finance_payments;
create trigger finance_payments_sync_order
  after insert or update of amount, order_id, cancelled_at or delete on tosho.finance_payments
  for each row execute function tosho.finance_payments_sync_order();

/** Ручний статус оплати не має розходитися з внесеними сумами. */
create or replace function tosho.guard_order_payment_status()
returns trigger
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
declare
  _count integer;
  _derived text;
begin
  if auth.uid() is null or coalesce(current_setting('tosho.payment_sync', true), '') = 'on' then
    return new;
  end if;
  select count(*) into _count
    from tosho.finance_payments
   where order_id = new.id and cancelled_at is null;
  if _count = 0 then
    return new;
  end if;
  _derived := tosho.order_payment_status_from_sum(
    tosho.order_paid_total(new.id), new.total, tosho.order_prepayment_amount(new), old.payment_status
  );
  if old.payment_status in ('partially_paid', 'awaiting_balance')
     and new.payment_status in ('partially_paid', 'awaiting_balance')
     and _derived in ('partially_paid', 'awaiting_balance') then
    return new;
  end if;
  raise exception 'Статус оплати рахується з внесених оплат — внесіть або скасуйте платіж'
    using errcode = '42501';
end;
$$;

drop trigger if exists orders_payment_status_guard on tosho.orders;
create trigger orders_payment_status_guard
  before update of payment_status on tosho.orders
  for each row
  when (old.payment_status is distinct from new.payment_status)
  execute function tosho.guard_order_payment_status();

-- ---------------------------------------------------------------------------
-- RPC.
-- ---------------------------------------------------------------------------

create or replace function tosho.assert_order_payment_writer(_team_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = tosho, public, auth
as $$
begin
  if auth.uid() is null
     or not public.is_team_member(_team_id)
     or not tosho.is_order_invoice_issuer(auth.uid()) then
    raise exception 'Вносити й скасовувати оплати може бухгалтерія або СЕО' using errcode = '42501';
  end if;
end;
$$;

revoke all on function tosho.assert_order_payment_writer(uuid) from public;
revoke all on function tosho.assert_order_payment_writer(uuid) from authenticated, anon;

create or replace function tosho.record_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_paid_at date,
  p_account_id uuid,
  p_bank_txn_ref text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
declare
  _order tosho.orders;
  _account tosho.finance_accounts;
  _today date := (now() at time zone 'Europe/Kyiv')::date;
  _amount numeric := round(p_amount, 2);
  _payment_id uuid;
begin
  select * into _order from tosho.orders where id = p_order_id for update;
  if not found then
    raise exception 'Замовлення не знайдено' using errcode = '22023';
  end if;
  perform tosho.assert_order_payment_writer(_order.team_id);

  if coalesce(_order.currency, 'UAH') <> 'UAH' then
    raise exception 'Валютні оплати — поки у Фінансах' using errcode = '22023';
  end if;
  if _amount is null or _amount <= 0 then
    raise exception 'Сума оплати має бути більшою за нуль' using errcode = '22023';
  end if;
  if p_paid_at is null or p_paid_at > _today then
    raise exception 'Дата оплати не може бути в майбутньому' using errcode = '22023';
  end if;
  if p_paid_at < (_order.created_at at time zone 'Europe/Kyiv')::date - 30 then
    raise exception 'Дата оплати раніша за замовлення більш ніж на місяць — перевірте дату' using errcode = '22023';
  end if;

  select * into _account
    from tosho.finance_accounts
   where id = p_account_id and team_id = _order.team_id and is_active;
  if not found then
    raise exception 'Оберіть рахунок, куди прийшли гроші' using errcode = '22023';
  end if;
  if _account.currency <> 'UAH' then
    raise exception 'Рахунок «%» не гривневий', _account.name using errcode = '22023';
  end if;
  if _account.legal_entity_id is not null
     and _order.our_legal_entity_id is not null
     and _account.legal_entity_id <> _order.our_legal_entity_id then
    raise exception 'Рахунок «%» належить іншій юрособі', _account.name using errcode = '22023';
  end if;

  insert into tosho.finance_payments (
    team_id, account_id, quote_id, order_id, amount, currency, paid_at,
    source, bank_txn_ref, notes, entered_by
  ) values (
    _order.team_id, _account.id, coalesce(_order.quote_id, _order.id), _order.id, _amount, 'UAH', p_paid_at,
    'manual', nullif(btrim(coalesce(p_bank_txn_ref, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), auth.uid()
  )
  returning id into _payment_id;

  return jsonb_build_object('payment_id', _payment_id) || tosho.order_payment_summary(_order.id);
end;
$$;

create or replace function tosho.cancel_order_payment(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
declare
  _payment tosho.finance_payments;
  _reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into _payment from tosho.finance_payments where id = p_payment_id for update;
  if not found or _payment.order_id is null then
    raise exception 'Платіж не знайдено' using errcode = '22023';
  end if;
  perform tosho.assert_order_payment_writer(_payment.team_id);
  if _payment.cancelled_at is not null then
    raise exception 'Платіж уже скасовано' using errcode = '22023';
  end if;
  if _reason is null then
    raise exception 'Вкажіть причину скасування' using errcode = '22023';
  end if;

  update tosho.finance_payments
     set cancelled_at = timezone('utc', now()),
         cancelled_by = auth.uid(),
         cancel_reason = left(_reason, 500)
   where id = p_payment_id;

  return tosho.order_payment_summary(_payment.order_id);
end;
$$;

/** «Скасувати» в тості одразу після внесення: свій платіж, 30 секунд. */
create or replace function tosho.undo_order_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
declare
  _payment tosho.finance_payments;
begin
  select * into _payment from tosho.finance_payments where id = p_payment_id for update;
  if not found or _payment.order_id is null then
    raise exception 'Платіж не знайдено' using errcode = '22023';
  end if;
  perform tosho.assert_order_payment_writer(_payment.team_id);
  if _payment.entered_by is distinct from auth.uid()
     or _payment.cancelled_at is not null
     or _payment.created_at < timezone('utc', now()) - interval '30 seconds' then
    raise exception 'Відкликати внесення можна лише своє й упродовж 30 секунд — скасуйте платіж з причиною'
      using errcode = '42501';
  end if;

  perform set_config('tosho.payment_sync', 'on', true);
  delete from tosho.finance_payments where id = p_payment_id;
  perform set_config('tosho.payment_sync', 'off', true);

  return tosho.order_payment_summary(_payment.order_id);
end;
$$;

/**
 * Платежі замовлення для картки «Оплата». Бачить будь-хто з команди; рахунок і
 * № платіжки — лише бухгалтерія, СЕО й ті, кому відкриті Фінанси.
 */
create or replace function tosho.list_order_payments(p_order_id uuid)
returns table (
  id uuid,
  amount numeric,
  paid_at date,
  kind text,
  created_at timestamptz,
  entered_by uuid,
  entered_by_name text,
  account_name text,
  bank_txn_ref text,
  notes text,
  cancelled_at timestamptz,
  cancel_reason text
)
language plpgsql
stable
security definer
set search_path = tosho, public, auth
as $$
declare
  _order tosho.orders;
  _sees_finance boolean;
  _pre numeric;
begin
  select * into _order from tosho.orders o where o.id = p_order_id;
  if not found or not public.is_team_member(_order.team_id) then
    raise exception 'Замовлення не знайдено' using errcode = '42501';
  end if;
  _sees_finance := tosho.is_order_invoice_issuer(auth.uid()) or tosho.has_finance_access(_order.team_id);
  _pre := tosho.order_prepayment_amount(_order);

  return query
    select
      p.id,
      p.amount,
      p.paid_at,
      case
        when coalesce(sum(p.amount) filter (where p.cancelled_at is null) over (
          order by p.paid_at, p.created_at rows between unbounded preceding and 1 preceding
        ), 0) < _pre then 'prepayment'
        else 'balance'
      end,
      p.created_at,
      p.entered_by,
      coalesce(
        (select nullif(btrim(tmp.full_name), '') from tosho.team_member_profiles tmp where tmp.user_id = p.entered_by limit 1),
        (select nullif(btrim(mv.full_name), '') from tosho.memberships_view mv where mv.user_id = p.entered_by limit 1)
      ),
      case when _sees_finance then a.name end,
      case when _sees_finance then p.bank_txn_ref end,
      case when _sees_finance then p.notes end,
      p.cancelled_at,
      p.cancel_reason
    from tosho.finance_payments p
    left join tosho.finance_accounts a on a.id = p.account_id
    where p.order_id = p_order_id
    order by p.paid_at, p.created_at;
end;
$$;

-- Допоміжні — лише для функцій вище; default ACL схеми інакше роздав би їх усім.
revoke all on function tosho.order_prepayment_amount(tosho.orders) from public, anon, authenticated;
revoke all on function tosho.order_paid_total(uuid) from public, anon, authenticated;
revoke all on function tosho.order_payment_summary(uuid) from public, anon, authenticated;

revoke all on function tosho.record_order_payment(uuid, numeric, date, uuid, text, text) from public;
revoke all on function tosho.cancel_order_payment(uuid, text) from public;
revoke all on function tosho.undo_order_payment(uuid) from public;
revoke all on function tosho.list_order_payments(uuid) from public;
grant execute on function tosho.record_order_payment(uuid, numeric, date, uuid, text, text) to authenticated;
grant execute on function tosho.cancel_order_payment(uuid, text) to authenticated;
grant execute on function tosho.undo_order_payment(uuid) to authenticated;
grant execute on function tosho.list_order_payments(uuid) to authenticated;

notify pgrst, 'reload schema';
