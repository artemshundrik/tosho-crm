-- ---------------------------------------------------------------------------
-- Прибрати позицію з виписаного рахунку (REQ-366, 19.11.2026).
--
-- НАВІЩО. Бухгалтерія 19.11 на TO-1126-0001: рахунок № 361 виписано на
-- щоденник і ручку, а ручку треба прибрати. «Виправити рахунок» міняв лише
-- ціну й кількість, кількість 0 не пропускав — прибрати позицію було нічим.
--
-- ЩО ЗМІНЮЄТЬСЯ.
--   * tosho.correct_order_invoice отримує p_removed_item_ids: прибрані позиції
--     видаляються в тій самій транзакції, що й нові ціни, номер і дата; номери
--     рядків (position) стають підряд, сума замовлення перераховується.
--     Параметр зі значенням за замовчуванням — старий клієнт із чотирма
--     аргументами працює далі.
--   * Позиція прорахунку, яку прибрали, звільняється (order_items_quote_item_uniq):
--     прорахунок може піти в інше замовлення пізніше. Сам прорахунок не чіпаємо.
--
-- МЕЖІ. Останню позицію не прибрати — рахунок без позицій це скасування, а не
-- виправлення. Позицію із закупівлею теж: закупівля повисла б без рядка
-- (order_purchases.order_item_id on delete set null). Запущене у виробництво
-- замовлення має техкарту — там позиції не прибираються. Решта меж (права,
-- підписана СП, оплата) — ті самі, що й на зміні ціни.
--
-- ЗАХИСТ. order_items_delete пускав будь-кого з команди: позицію можна було
-- видалити через API, а orders.total лишався старим (і виправити його не дав би
-- orders_guard_total). Тепер видаляє лише ця функція (прапорець
-- tosho.invoice_correction). Каскад від видалення самого замовлення і сервісні
-- записи без користувача не зачіпаються.
--
-- Застосування: npm run db:apply scripts/orders-invoice-remove-items.sql
-- ---------------------------------------------------------------------------

drop function if exists tosho.correct_order_invoice(uuid, jsonb, text, date);

create or replace function tosho.correct_order_invoice(
  p_order_id uuid,
  p_items jsonb,
  p_invoice_number text,
  p_invoice_date date,
  p_removed_item_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
declare
  _order tosho.orders;
  _item jsonb;
  _qty numeric;
  _price numeric;
  _number text := nullif(btrim(coalesce(p_invoice_number, '')), '');
  _removed_ids uuid[] := coalesce(p_removed_item_ids, '{}');
  _removed jsonb := '[]'::jsonb;
  _total numeric;
begin
  select * into _order from tosho.orders o where o.id = p_order_id for update;
  if not found or not public.is_team_member(_order.team_id) then
    raise exception 'Замовлення не знайдено' using errcode = '42501';
  end if;
  if not tosho.is_order_invoice_issuer(auth.uid()) then
    raise exception 'Рахунок виправляє бухгалтерія або СЕО' using errcode = '42501';
  end if;
  -- Запит, що чекає бухгалтера: invoice_requested_at стоїть, номера ще немає
  -- («Повернути менеджеру» знімає invoice_requested_at).
  if _order.invoice_number is null and _order.invoice_requested_at is null then
    raise exception 'Рахунок ще не просили — ціну й кількість бухгалтер міняє на запиті рахунку' using errcode = '23514';
  end if;
  if _order.specification_signed_at is not null then
    raise exception 'СП уже підписана — зміна ціни потребує нової СП' using errcode = '23514';
  end if;
  if exists (select 1 from tosho.finance_payments p where p.order_id = _order.id and p.cancelled_at is null) then
    raise exception 'За рахунком уже є оплата — виправлення поки не підтримується' using errcode = '23514';
  end if;
  if _number is null or p_invoice_date is null then
    raise exception 'Вкажіть номер і дату рахунку з BAS' using errcode = '23514';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Немає позицій для виправлення' using errcode = '22023';
  end if;

  if cardinality(_removed_ids) > 0 then
    if _order.order_status in ('production_started', 'in_production', 'ready', 'shipped', 'completed') then
      raise exception 'Замовлення вже запущене — позиції з нього не прибираються' using errcode = '23514';
    end if;
    if exists (
      select 1 from unnest(_removed_ids) r(id)
       where not exists (select 1 from tosho.order_items i where i.id = r.id and i.order_id = _order.id)
    ) then
      raise exception 'Позиція не належить цьому замовленню' using errcode = '22023';
    end if;
    if not exists (
      select 1 from tosho.order_items i where i.order_id = _order.id and i.id <> all (_removed_ids)
    ) then
      raise exception 'Останню позицію не прибрати — рахунок без позицій це скасування' using errcode = '23514';
    end if;
    if exists (select 1 from tosho.order_purchases p where p.order_item_id = any (_removed_ids)) then
      raise exception 'По позиції вже є закупівля — спершу приберіть закупівлю' using errcode = '23514';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_items) e
       where (e ->> 'id')::uuid = any (_removed_ids)
    ) then
      raise exception 'Позицію не можна водночас прибрати й виправити' using errcode = '22023';
    end if;
  end if;

  perform set_config('tosho.invoice_correction', 'on', true);

  if cardinality(_removed_ids) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', coalesce(nullif(btrim(i.document_name), ''), i.name),
             'line_total', i.line_total
           ) order by i.position), '[]'::jsonb)
      into _removed
      from tosho.order_items i
     where i.order_id = _order.id and i.id = any (_removed_ids);

    delete from tosho.order_items i where i.order_id = _order.id and i.id = any (_removed_ids);

    -- Номери рядків підряд: «№» у рахунку й СП береться з position.
    update tosho.order_items i
       set position = r.rn
      from (
        select x.id, row_number() over (order by x.position, x.created_at) as rn
          from tosho.order_items x
         where x.order_id = _order.id
      ) r
     where i.id = r.id and i.position is distinct from r.rn;
  end if;

  for _item in select * from jsonb_array_elements(p_items) loop
    _qty := (_item ->> 'qty')::numeric;
    _price := (_item ->> 'unit_price')::numeric;
    if _qty is null or _qty <= 0 then
      raise exception 'Кількість має бути більша за нуль' using errcode = '23514';
    end if;
    if _price is null or _price <= 0 then
      raise exception 'Ціна має бути більша за нуль' using errcode = '23514';
    end if;
    update tosho.order_items i
       set qty = _qty,
           unit_price = round(_price, 2),
           line_total = round(_qty * round(_price, 2), 2)
     where i.id = (_item ->> 'id')::uuid
       and i.order_id = _order.id;
    if not found then
      raise exception 'Позиція не належить цьому замовленню' using errcode = '22023';
    end if;
  end loop;

  select round(coalesce(sum(i.line_total), 0), 2) into _total from tosho.order_items i where i.order_id = _order.id;

  -- Номер і дату перевіряє й нормалізує тригер orders_invoice_flow; дубль у
  -- межах року ловить orders_invoice_number_year_uniq (23505).
  update tosho.orders o
     set total = _total,
         invoice_number = _number,
         invoice_date = p_invoice_date,
         updated_at = timezone('utc', now())
   where o.id = _order.id;

  perform set_config('tosho.invoice_correction', 'off', true);

  return jsonb_build_object(
    'total_before', _order.total,
    'total_after', _total,
    'number_before', _order.invoice_number,
    'number_after', _number,
    'date_before', _order.invoice_date,
    'date_after', p_invoice_date,
    'removed', _removed
  );
end;
$$;

revoke all on function tosho.correct_order_invoice(uuid, jsonb, text, date, uuid[]) from public, anon;
grant execute on function tosho.correct_order_invoice(uuid, jsonb, text, date, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Видалення позиції — лише через correct_order_invoice.
-- ---------------------------------------------------------------------------
create or replace function tosho.guard_order_item_delete()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
begin
  if auth.uid() is null or coalesce(current_setting('tosho.invoice_correction', true), '') = 'on' then
    return old;
  end if;
  -- Каскад від видалення самого замовлення: рядка замовлення вже немає.
  if not exists (select 1 from tosho.orders o where o.id = old.order_id) then
    return old;
  end if;
  raise exception 'Позицію з замовлення прибирає бухгалтерія кнопкою «Виправити рахунок»'
    using errcode = '42501';
end;
$$;

revoke all on function tosho.guard_order_item_delete() from public, anon, authenticated;

drop trigger if exists order_items_guard_delete on tosho.order_items;
create trigger order_items_guard_delete
  before delete on tosho.order_items
  for each row execute function tosho.guard_order_item_delete();
