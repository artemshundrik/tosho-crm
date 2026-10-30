-- ---------------------------------------------------------------------------
-- Одне замовлення з кількох прорахунків (REQ-344, погоджено власником 30.10.2026).
--
-- НАВІЩО. Клієнт погоджує товари з кількох прорахунків, а рахунок потрібен
-- один. Досі замовлення було прибите до одного прорахунку (orders.quote_id
-- unique), і додати позиції в уже створене замовлення було нічим.
--
-- МОДЕЛЬ. Зв'язок іде по ПОЗИЦІЯХ: order_items.quote_item_id каже, з якого
-- прорахунку прийшов рядок. orders.quote_id лишається «прорахунком, з якого
-- замовлення почали» — для історії, номера в картці й старих читачів.
--   * orders.quote_id більше не унікальний: з прорахунку можна взяти частину
--     позицій зараз, а решту — пізніше окремим замовленням.
--   * одна позиція прорахунку — щонайбільше в одному замовленні, інакше той
--     самий товар продали б двічі.
--
-- ДОДАВАННЯ В НАЯВНЕ ЗАМОВЛЕННЯ — лише через tosho.append_quote_items_to_order:
-- orders.total користувачам міняти заборонено (orders_guard_total), а правила
-- «той самий замовник, та сама валюта, рахунок ще не запитано, СП не
-- підписана» мають жити в базі, а не тільки в кнопці.
--
-- Застосування: npm run db:apply scripts/orders-multi-quote.sql
-- ---------------------------------------------------------------------------

-- Зняття обмеження бере ексклюзивний лок на orders: якщо таблицю тримає довга
-- транзакція, краще впасти за 5 с, ніж поставити в чергу всі запити до замовлень.
set local lock_timeout = '5s';

do $$
declare
  _name text;
begin
  for _name in
    select c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.conrelid = 'tosho.orders'::regclass
       and c.contype = 'u'
       and a.attname = 'quote_id'
       and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table tosho.orders drop constraint %I', _name);
  end loop;
end;
$$;

create unique index if not exists order_items_quote_item_uniq
  on tosho.order_items (quote_item_id)
  where quote_item_id is not null;

create or replace function tosho.append_quote_items_to_order(
  p_order_id uuid,
  p_quote_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
declare
  _order tosho.orders;
  _quote record;
  _item jsonb;
  _quote_item_id uuid;
  _qty numeric;
  _price numeric;
  _position integer;
  _added integer := 0;
  _total numeric;
begin
  select * into _order from tosho.orders o where o.id = p_order_id for update;
  if not found or not public.is_team_member(_order.team_id) then
    raise exception 'Замовлення не знайдено' using errcode = '42501';
  end if;

  select q.id, q.team_id, q.customer_id, q.status, upper(coalesce(nullif(btrim(q.currency), ''), 'UAH')) as currency
    into _quote
    from tosho.quotes q
   where q.id = p_quote_id;
  if not found or _quote.team_id is distinct from _order.team_id then
    raise exception 'Прорахунок не знайдено' using errcode = '42501';
  end if;

  if _quote.status is distinct from 'approved' then
    raise exception 'Додати можна лише погоджений прорахунок' using errcode = '23514';
  end if;
  if _quote.customer_id is null or _quote.customer_id is distinct from _order.customer_id then
    raise exception 'Прорахунок іншого замовника — в одне замовлення не об''єднати' using errcode = '23514';
  end if;
  if _quote.currency is distinct from upper(coalesce(nullif(btrim(_order.currency), ''), 'UAH')) then
    raise exception 'Валюта прорахунку (%) не збігається з валютою замовлення (%)', _quote.currency, _order.currency
      using errcode = '23514';
  end if;
  if _order.order_status = 'cancelled' then
    raise exception 'Замовлення скасоване' using errcode = '23514';
  end if;
  -- Запущене у виробництво замовлення вже має свою базу оплати й техкарту:
  -- нові позиції — окремим замовленням (LAUNCHED_ORDER_STATUSES у orderLaunchPath.ts).
  if _order.order_status in ('production_started', 'in_production', 'ready', 'shipped', 'completed') then
    raise exception 'Замовлення вже запущене — нові позиції оформіть окремим замовленням' using errcode = '23514';
  end if;
  if _order.invoice_number is not null then
    raise exception 'Рахунок уже виписано — додати позиції не можна' using errcode = '23514';
  end if;
  if _order.invoice_requested_at is not null then
    raise exception 'Рахунок уже запитано в бухгалтерії — додати позиції не можна' using errcode = '23514';
  end if;
  if _order.specification_signed_at is not null then
    raise exception 'СП уже підписана — додати позиції не можна' using errcode = '23514';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Виберіть хоча б одну позицію' using errcode = '22023';
  end if;

  select coalesce(max(i.position), 0) into _position from tosho.order_items i where i.order_id = _order.id;

  for _item in select * from jsonb_array_elements(p_items) loop
    _quote_item_id := (_item ->> 'quote_item_id')::uuid;
    if not exists (select 1 from tosho.quote_items qi where qi.id = _quote_item_id and qi.quote_id = _quote.id) then
      raise exception 'Позиція не належить цьому прорахунку' using errcode = '22023';
    end if;
    if exists (select 1 from tosho.order_items i where i.quote_item_id = _quote_item_id) then
      raise exception 'Позиція «%» уже в іншому замовленні', coalesce(_item ->> 'name', '')
        using errcode = '23505';
    end if;
    _qty := coalesce((_item ->> 'qty')::numeric, 0);
    _price := round(coalesce((_item ->> 'unit_price')::numeric, 0), 2);
    if _qty <= 0 then
      raise exception 'Кількість має бути більша за нуль' using errcode = '23514';
    end if;
    if _price < 0 then
      raise exception 'Ціна не може бути від''ємна' using errcode = '23514';
    end if;
    _position := _position + 1;
    insert into tosho.order_items (
      id, team_id, order_id, quote_item_id, position, name, description, qty, unit,
      unit_price, line_total, methods, catalog_model_id, image_url, thumb_url
    ) values (
      gen_random_uuid(),
      _order.team_id,
      _order.id,
      _quote_item_id,
      _position,
      coalesce(nullif(btrim(_item ->> 'name'), ''), 'Позиція без назви'),
      nullif(btrim(_item ->> 'description'), ''),
      _qty,
      nullif(btrim(_item ->> 'unit'), ''),
      _price,
      -- Сума рядка — лише з ціни й кількості, як у correct_order_invoice: line_total
      -- від клієнта не беремо, бо з нього складається orders.total.
      round(_qty * _price, 2),
      case when jsonb_typeof(_item -> 'methods') = 'array' then _item -> 'methods' else null end,
      nullif(_item ->> 'catalog_model_id', '')::uuid,
      nullif(btrim(_item ->> 'image_url'), ''),
      nullif(btrim(_item ->> 'thumb_url'), '')
    );
    _added := _added + 1;
  end loop;

  select coalesce(sum(i.line_total), 0) into _total from tosho.order_items i where i.order_id = _order.id;

  -- orders_guard_total пускає зміну суми лише під цим прапорцем (той самий,
  -- що й у виправленні рахунку): сума рахується тут із позицій, а не з клієнта.
  perform set_config('tosho.invoice_correction', 'on', true);
  update tosho.orders o
     set total = _total,
         updated_at = timezone('utc', now())
   where o.id = _order.id;
  perform set_config('tosho.invoice_correction', 'off', true);

  return jsonb_build_object('added', _added, 'total_before', _order.total, 'total_after', _total);
end;
$$;

revoke all on function tosho.append_quote_items_to_order(uuid, uuid, jsonb) from public, anon;
grant execute on function tosho.append_quote_items_to_order(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Позиції в уже оформлене замовлення не докладаються й повз функцію.
--
-- order_items_insert пускає будь-кого з команди, тож без цього тригера правила
-- вище можна було б обійти прямою вставкою через API. Нове замовлення
-- (рахунку ще нема) і сервісні записи без користувача не зачіпаються.
-- ---------------------------------------------------------------------------
create or replace function tosho.order_items_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
declare
  _order tosho.orders;
begin
  if auth.uid() is null then
    return new;
  end if;
  select * into _order from tosho.orders o where o.id = new.order_id;
  if not found then
    return new;
  end if;
  if _order.invoice_number is not null
     or _order.invoice_requested_at is not null
     or _order.specification_signed_at is not null
     or _order.order_status in ('cancelled', 'production_started', 'in_production', 'ready', 'shipped', 'completed') then
    raise exception 'Замовлення вже оформлене (рахунок, СП або запуск) — позиції сюди не додаються'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function tosho.order_items_guard_insert() from public, anon, authenticated;

drop trigger if exists order_items_guard_insert on tosho.order_items;
create trigger order_items_guard_insert
  before insert on tosho.order_items
  for each row execute function tosho.order_items_guard_insert();

-- ---------------------------------------------------------------------------
-- Оплата з Фінансів, прив'язана лише до прорахунку (без order_id).
--
-- Досі прорахунок = одне замовлення, і тригер брав «перше за датою». Тепер з
-- одного прорахунку буває кілька замовлень, і мовчки чіпляти оплату до першого
-- означало б: одне переплачене, друге неоплачене. Неоднозначно — зупиняємо з
-- підказкою; однозначно — як і було. Решта тіла — без змін
-- (scripts/order-payments-basis.sql).
-- ---------------------------------------------------------------------------
create or replace function tosho.finance_payments_link_order()
returns trigger
language plpgsql
security definer
set search_path = tosho, public
as $$
begin
  if new.order_id is null and new.quote_id is not null then
    if (select count(*) from tosho.orders o
         where o.team_id = new.team_id and o.quote_id = new.quote_id) > 1 then
      raise exception 'З цього прорахунку кілька замовлень — внесіть оплату з картки потрібного замовлення'
        using errcode = '23514';
    end if;
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
