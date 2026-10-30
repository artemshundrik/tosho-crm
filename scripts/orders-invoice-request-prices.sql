-- ---------------------------------------------------------------------------
-- Ціна й кількість — уже на запиті рахунку (картка 345, 30.10.2026).
--
-- НАВІЩО. Юлія (бухгалтерія) 30.10: на запиті рахунку їй треба виправити ще й
-- ціну, а CRM давала це лише після «Рахунок виписано» (REQ-335). Тож вона
-- спершу виписувала рахунок зі старою ціною — менеджер одразу отримував
-- «рахунок готовий» і міг надіслати замовнику не той, — а тоді виправляла,
-- удруге вносячи номер і дату з BAS.
--
-- ЩО ЗМІНЮЄТЬСЯ. tosho.correct_order_invoice тепер приймає й замовлення, на
-- якому рахунок попросили, але ще не виписали: ціни, кількість, номер і дата
-- лягають однією транзакцією, а виписку (хто, коли, зняти повернення) ставить
-- той самий тригер enforce_order_invoice_flow, що й на звичайній виписці.
-- Межі ті самі: не бухгалтерія/СЕО, підписана СП, оплата — відмова. Без запиту
-- ціну, як і раніше, не міняє ніхто: замовлення без запиту рахунку — відмова.
--
-- Застосування: npm run db:apply scripts/orders-invoice-request-prices.sql
-- ---------------------------------------------------------------------------

create or replace function tosho.correct_order_invoice(
  p_order_id uuid,
  p_items jsonb,
  p_invoice_number text,
  p_invoice_date date
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

  perform set_config('tosho.invoice_correction', 'on', true);

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

  select coalesce(sum(i.line_total), 0) into _total from tosho.order_items i where i.order_id = _order.id;

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
    'date_after', p_invoice_date
  );
end;
$$;

revoke all on function tosho.correct_order_invoice(uuid, jsonb, text, date) from public, anon;
grant execute on function tosho.correct_order_invoice(uuid, jsonb, text, date) to authenticated;
