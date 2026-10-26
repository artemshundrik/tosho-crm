-- ---------------------------------------------------------------------------
-- Виправлення вже виписаного рахунку (REQ-335, вузька версія 26.10.2026).
--
-- НАВІЩО. Юлія (бухгалтерія) 26.10: рахунок № 448 на TO-1026-0007 виписано,
-- а ціну треба змінити. У CRM після виписки змінювалась лише назва позиції:
-- ціна й кількість лягають в order_items один раз при створенні замовлення,
-- а картка бухгалтера зникає, щойно номер внесено. Тепер бухгалтер, СЕО чи
-- власник виправляють ціну й кількість позицій, а за потреби — номер і дату з
-- BAS, однією дією.
--
-- МЕЖІ ВУЗЬКОЇ ВЕРСІЇ. Не виправляємо, коли СП уже підписана (тоді потрібна
-- нова СП — питання ще відкрите) або коли за замовленням є оплата (що робити
-- з різницею — теж). Юрособу не чіпаємо: інша юрособа — інша серія номерів.
-- Погоджена СП після зміни ціни сама стає «змінився після погодження»:
-- відбиток погодження містить ціну й кількість кожної позиції.
--
-- ЗАХИСТ. Досі order_items_update пускав будь-кого з команди, тож ціну позиції
-- можна було переписати через API повз інтерфейс. Тепер ціну, кількість і суму
-- позиції, а також orders.total змінює лише ця функція (прапорець
-- tosho.invoice_correction, як tosho.payment_sync в оплатах). Сервісні записи
-- без користувача (auth.uid() is null) не перевіряємо.
--
-- Застосування: npm run db:apply scripts/orders-invoice-correction.sql
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
  if _order.invoice_number is null then
    raise exception 'Рахунок ще не виписано — ціну міняє менеджер до запиту' using errcode = '23514';
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

create or replace function tosho.guard_order_money()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
begin
  if auth.uid() is null or coalesce(current_setting('tosho.invoice_correction', true), '') = 'on' then
    return new;
  end if;
  raise exception 'Ціну й кількість у замовленні змінює бухгалтерія кнопкою «Виправити рахунок»'
    using errcode = '42501';
end;
$$;

revoke all on function tosho.guard_order_money() from public, anon, authenticated;

drop trigger if exists order_items_guard_money on tosho.order_items;
create trigger order_items_guard_money
  before update of qty, unit_price, line_total on tosho.order_items
  for each row
  when (
    old.qty is distinct from new.qty
    or old.unit_price is distinct from new.unit_price
    or old.line_total is distinct from new.line_total
  )
  execute function tosho.guard_order_money();

drop trigger if exists orders_guard_total on tosho.orders;
create trigger orders_guard_total
  before update of total on tosho.orders
  for each row
  when (old.total is distinct from new.total)
  execute function tosho.guard_order_money();
