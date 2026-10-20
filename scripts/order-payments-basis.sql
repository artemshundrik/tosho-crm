-- ---------------------------------------------------------------------------
-- Оплати замовлення: та сама база суми, що й на екрані (REQ-322, пункт p26).
-- Доповнює scripts/order-payments.sql; накочувати після нього.
--
-- НАВІЩО. Рецензія знайшла, що база й екран рахували статус з різних чисел:
--   • сума — база брала лише orders.total, а екран падав на суму прорахунку,
--     коли total = 0 (на проді 2 з 11 замовлень). Бухгалтер вносить усі гроші,
--     віконце каже «Оплачено», а база пише «Частково» — і вручну не виправити;
--   • % передоплати — екран бере його з договору, укладеного раніше з тим самим
--     замовником і юрособою, а без умов вважає 70/30; база — нуль.
-- Ще дві дірки: зміна умов чи суми замовлення не перераховувала статус (тригер
-- сидів лише на платежах), а рядок платежу замовлення можна було тихо
-- переписати з Фінансів — суму, замовлення чи «розскасувати».
--
-- Дзеркало на клієнті: src/features/orders/orderPayments.ts і orderRecords.ts
-- (total = orders.total || прорахунок || позиції). Міняти лише разом.
-- ---------------------------------------------------------------------------

/** Сума замовлення для оплат: orders.total, інакше прорахунок, інакше позиції. */
create or replace function tosho.order_payment_total(_order tosho.orders)
returns numeric
language sql
stable
set search_path = tosho, public
as $$
  select coalesce(
    nullif(_order.total, 0),
    nullif((select q.total from tosho.quotes q where q.id = _order.quote_id and q.team_id = _order.team_id), 0),
    nullif((select sum(i.line_total) from tosho.order_items i where i.order_id = _order.id), 0),
    0
  );
$$;

/**
 * Скільки треба наперед. % — з умов замовлення, інакше з найсвіжішого договору
 * з тим самим замовником і нашою юрособою (як buildContractByCustomerId), інакше
 * з пресету умов, де порожні умови = 70/30 (DEFAULT_PAYMENT_TERMS).
 */
create or replace function tosho.order_prepayment_amount(_order tosho.orders)
returns numeric
language sql
stable
set search_path = tosho, public
as $$
  select round(
    tosho.order_payment_total(_order) * coalesce(
      _order.prepayment_pct,
      (
        select c.prepayment_pct
          from tosho.orders c
         where _order.customer_id is not null
           and c.team_id = _order.team_id
           and c.customer_id = _order.customer_id
           and c.our_legal_entity_id is not distinct from _order.our_legal_entity_id
           and c.contract_created_at is not null
         order by coalesce(c.contract_date::text, c.contract_created_at::text) desc
         limit 1
      ),
      case coalesce(nullif(btrim(_order.payment_terms), ''), '70/30')
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
    tosho.order_payment_total(_order),
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

/** Ручний статус не розходиться з сумою; збігається з сумою — пропускаємо. */
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
    tosho.order_paid_total(new.id), tosho.order_payment_total(new), tosho.order_prepayment_amount(new), old.payment_status
  );
  if new.payment_status = _derived then
    return new;
  end if;
  if old.payment_status in ('partially_paid', 'awaiting_balance')
     and new.payment_status in ('partially_paid', 'awaiting_balance')
     and _derived in ('partially_paid', 'awaiting_balance') then
    return new;
  end if;
  raise exception 'Статус оплати рахується з внесених оплат — внесіть або скасуйте платіж'
    using errcode = '42501';
end;
$$;

/** Змінились умови чи сума замовлення — статус оплати рахується наново. */
create or replace function tosho.orders_payment_basis_sync()
returns trigger
language plpgsql
security definer
set search_path = tosho, public, auth
as $$
begin
  if exists (select 1 from tosho.finance_payments p where p.order_id = new.id and p.cancelled_at is null) then
    perform tosho.recompute_order_payment_status(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists orders_payment_basis_sync on tosho.orders;
create trigger orders_payment_basis_sync
  after update of total, prepayment_pct, payment_terms, quote_id on tosho.orders
  for each row
  when (
    old.total is distinct from new.total
    or old.prepayment_pct is distinct from new.prepayment_pct
    or old.payment_terms is distinct from new.payment_terms
    or old.quote_id is distinct from new.quote_id
  )
  execute function tosho.orders_payment_basis_sync();

/** Прив'язка лише до замовлення своєї команди — і за quote_id, і явним order_id. */
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
  elsif new.order_id is not null
        and not exists (select 1 from tosho.orders o where o.id = new.order_id and o.team_id = new.team_id) then
    raise exception 'Замовлення з іншої команди' using errcode = '42501';
  end if;
  return new;
end;
$$;

/**
 * Платіж замовлення з Фінансів не переписують: сума, валюта, замовлення й
 * скасування міняються лише через RPC (прапорець tosho.payment_sync). Дата,
 * рахунок, № платіжки й примітка — можна. Сервіс і крони (без auth.uid()) — так.
 */
create or replace function tosho.finance_payments_guard_update()
returns trigger
language plpgsql
set search_path = tosho, public, auth
as $$
begin
  if old.order_id is null
     or auth.uid() is null
     or coalesce(current_setting('tosho.payment_sync', true), '') = 'on' then
    return new;
  end if;
  if new.amount is distinct from old.amount
     or new.currency is distinct from old.currency
     or new.quote_id is distinct from old.quote_id
     or new.order_id is distinct from old.order_id
     or new.cancelled_at is distinct from old.cancelled_at
     or new.cancelled_by is distinct from old.cancelled_by
     or new.cancel_reason is distinct from old.cancel_reason then
    raise exception 'Платіж із замовлення виправляють у замовленні: скасуйте його з причиною й внесіть знову'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists finance_payments_guard_update on tosho.finance_payments;
create trigger finance_payments_guard_update
  before update on tosho.finance_payments
  for each row execute function tosho.finance_payments_guard_update();

/** Скасування тепер іде з прапорцем — інакше finance_payments_guard_update його спинить. */
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

  perform set_config('tosho.payment_sync', 'on', true);
  update tosho.finance_payments
     set cancelled_at = timezone('utc', now()),
         cancelled_by = auth.uid(),
         cancel_reason = left(_reason, 500)
   where id = p_payment_id;
  perform set_config('tosho.payment_sync', 'off', true);

  return tosho.order_payment_summary(_payment.order_id);
end;
$$;

revoke all on function tosho.order_payment_total(tosho.orders) from public, anon, authenticated;
revoke all on function tosho.order_prepayment_amount(tosho.orders) from public, anon, authenticated;
revoke all on function tosho.recompute_order_payment_status(uuid) from public, anon, authenticated;
revoke all on function tosho.orders_payment_basis_sync() from public, anon, authenticated;
revoke all on function tosho.finance_payments_guard_update() from public, anon, authenticated;
-- RPC лише для входу: default ACL схеми інакше лишає anon EXECUTE.
revoke all on function tosho.record_order_payment(uuid, numeric, date, uuid, text, text) from anon;
revoke all on function tosho.cancel_order_payment(uuid, text) from public, anon;
grant execute on function tosho.cancel_order_payment(uuid, text) to authenticated;
revoke all on function tosho.undo_order_payment(uuid) from anon;
revoke all on function tosho.list_order_payments(uuid) from anon;

notify pgrst, 'reload schema';
