-- ---------------------------------------------------------------------------
-- Перевірка закупок замовлення («Економіка»): хто що бачить і може записати,
-- плюс охоронці. Нічого не лишає: усе в одній транзакції, наприкінці ROLLBACK.
--
-- Після накатки scripts/order-purchases.sql:
--   set -a; . ./.env.backup; set +a
--   psql "$BACKUP_DB_URL" -X -q -f scripts/checks/order-purchases-roles.sql
-- До накатки (схема підвантажиться в цій самій транзакції й зникне з нею):
--   psql "$BACKUP_DB_URL" -X -q -v apply=1 -f scripts/checks/order-purchases-roles.sql
--
-- Користувачі — справжні (перший незаблокований на кожну посаду), запити від
-- їхнього імені через request.jwt.claims + set local role authenticated, як
-- це робить PostgREST. Кожна спроба відкочується власною точкою збереження,
-- тож перевірки однієї посади не впливають на іншу. Підсумок — таблиця
-- «хто · перевірка · очікували · вийшло» і рядок з кількістю розбіжностей.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
begin;

\if :{?apply}
\ir ../order-purchases.sql
\endif

-- Виконати дію, потім (окремим запитом, щоб побачити її наслідки) перевірку;
-- повернути результат перевірки, 'ok' або код помилки. Будь-який ефект
-- відкочується: успіх теж закінчується винятком-маркером P0099.
create function pg_temp.probe(_action text, _check text default null) returns text
language plpgsql as $$
declare
  _out text;
begin
  begin
    execute _action into _out;
    if _check is not null then
      execute _check into _out;
    end if;
    raise exception using errcode = 'P0099', message = coalesce(_out, 'ok');
  exception
    when sqlstate 'P0099' then return sqlerrm;
    when others then return 'ERR ' || sqlstate;
  end;
end;
$$;

create function pg_temp.act_as(_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', _user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create temp table check_results (seq serial, who text, what text, expected text, actual text);
grant all on check_results to authenticated;
grant all on sequence check_results_seq_seq to authenticated;

-- Три відкриті замовлення з позиціями, без закупок, позначки й ВН; рахунок оплати.
create temp table fx as
with team as (select o.team_id from tosho.orders o order by o.created_at desc limit 1),
open_orders as (
  select o.id, row_number() over (order by o.created_at desc) as n
    from tosho.orders o, team
   where o.team_id = team.team_id
     and coalesce(o.order_status, '') not in ('completed', 'cancelled')
     and exists (select 1 from tosho.order_items i where i.order_id = o.id)
     and not exists (select 1 from tosho.order_purchases p where p.order_id = o.id)
     and o.purchases_none_at is null
     and o.waybill_number is null
)
select (select id from open_orders where n = 1) as order_a,
       (select id from open_orders where n = 2) as order_b,
       (select id from open_orders where n = 3) as order_c,
       (select team_id from team) as team_id,
       (select a.id from tosho.finance_accounts a, team
         where a.team_id = team.team_id and a.is_active and a.currency = 'UAH'
         order by a.sort_order, a.created_at limit 1) as account_id;
grant select on fx to authenticated;

do $$
begin
  if (select order_c is null or account_id is null from fx) then
    raise exception 'Для перевірки треба три відкриті замовлення без закупок і активний гривневий рахунок';
  end if;
end $$;

-- Хто є хто: перший незаблокований користувач кожної посади; власник окремо.
create temp table who as
select distinct on (m.job_role) m.job_role::text as label, m.user_id
  from tosho.memberships m
 where m.job_role is not null and not tosho.is_user_blocked(m.user_id) and m.role <> 'owner'
 order by m.job_role, m.created_at;
insert into who
select 'owner', m.user_id from tosho.memberships m
 where m.role = 'owner' and not tosho.is_user_blocked(m.user_id)
 order by m.created_at limit 1;
grant select on who to authenticated;

-- Фікстура на замовленні A: два неоплачені рядки «з ПДВ» і ФОП-рядок, оплачений
-- через RPC від бухгалтера (950 замість 1000), щоб витрата й зв'язок були справжні.
insert into tosho.order_purchases (team_id, order_id, description, supplier_name, supplier_invoice_date, amount, vat_mode)
select fx.team_id, fx.order_a, d, 'Перевірка ' || d, current_date, 1000, v
  from fx, (values ('fx-unpaid', 'with_vat'), ('fx-to-pay', 'with_vat'), ('fx-fop', 'no_vat')) t(d, v);

select pg_temp.act_as((select user_id from who where label = 'accountant')) \gset
select tosho.pay_order_purchase(
  (select p.id from tosho.order_purchases p, fx where p.order_id = fx.order_a and p.description = 'fx-fop'),
  current_date, (select account_id from fx), 950
) is not null as fixture_paid \gset
reset role;

-- Рядок у стрічці від оплати фікстури перевіряємо тут, а потім прибираємо, щоб
-- матриця рахувала лише свої.
insert into check_results (who, what, expected, actual)
select 'дані', 'оплата пише рядок у стрічку (title, entity, metadata, ім''я)',
       'Закупку оплачено/orders/так/так',
       l.title || '/' || l.entity_type || '/'
         || case when l.metadata ->> 'order_id' = fx.order_a::text and l.metadata ? 'quote_id' then 'так' else 'ні' end || '/'
         || case when nullif(btrim(l.actor_name), '') is not null and l.user_id = (select user_id from who where label = 'accountant') then 'так' else 'ні' end
  from public.activity_log l, fx
 where l.action = 'order_purchase' and l.entity_id = fx.order_a::text;
delete from public.activity_log l using fx where l.action = 'order_purchase' and l.entity_id = fx.order_a::text;

-- ---------------------------------------------------------------------------
-- 1. Матриця посад.
-- ---------------------------------------------------------------------------
do $$
declare
  _f fx;
  _who record;
  _unpaid uuid;
  _paid uuid;
  _w boolean; _r boolean; _amt boolean; _none boolean; _fin boolean;
  _log text := $q$
    select 'log=' || count(*) from public.activity_log l
     where l.action = 'order_purchase' and l.entity_id = %L and l.title = %L
  $q$;
begin
  select * into _f from fx;
  select id into _unpaid from tosho.order_purchases where order_id = _f.order_a and description = 'fx-to-pay';
  select id into _paid from tosho.order_purchases where order_id = _f.order_a and description = 'fx-fop';

  for _who in select * from who order by label loop
    _w := _who.label in ('owner', 'seo', 'accountant', 'chief_accountant');
    _r := _w or _who.label in ('logistics', 'head_of_logistics', 'head_of_production', 'pm');
    _amt := _w or _who.label = 'junior_accountant';
    _none := _who.label in ('accountant', 'chief_accountant');

    perform pg_temp.act_as(_who.user_id);
    _fin := tosho.has_finance_access(_f.team_id);

    insert into check_results (who, what, expected, actual) values
      (_who.label, 'list: рядків / із сумою / зі сплаченим',
       case when _amt then '3/3/1' when _r then '3/0/0' else 'ERR 42501' end,
       pg_temp.probe(format($q$
         select count(*) || '/' || count(*) filter (where e->>'amount' is not null)
                || '/' || count(*) filter (where e->>'paid_amount' is not null)
           from jsonb_array_elements(tosho.list_order_purchases(%L)) e
       $q$, _f.order_a))),
      (_who.label, 'пряме читання таблиці (рядків)',
       case when _fin then '3' else '0' end,
       pg_temp.probe(format('select count(*)::text from tosho.order_purchases where order_id = %L', _f.order_a))),
      (_who.label, 'внести рядок',
       case when _w then 'ok' else 'ERR 42501' end,
       pg_temp.probe(format($q$
         select null from tosho.save_order_purchase(null, %L, null, 'probe', 'Постачальник', null, current_date, null, null, 10, 'with_vat')
       $q$, _f.order_a))),
      (_who.label, 'оплатити (+рядок у стрічці)',
       case when _w then 'log=1' else 'ERR 42501' end,
       pg_temp.probe(
         format('select null from tosho.pay_order_purchase(%L, current_date, %L, 1000)', _unpaid, _f.account_id),
         format(_log, _f.order_a, 'Закупку оплачено'))),
      (_who.label, 'скасувати оплату (+рядок у стрічці)',
       case when _w then 'log=1' else 'ERR 42501' end,
       pg_temp.probe(
         format('select null from tosho.cancel_order_purchase_payment(%L, %L)', _paid, ' помилились рахунком '),
         format(_log, _f.order_a, 'Скасовано оплату закупки: помилились рахунком'))),
      (_who.label, 'підтвердити отримання',
       case when _r then 'ok' else 'ERR 42501' end,
       pg_temp.probe(format($q$
         select null from tosho.confirm_order_purchase_receipt(%L, current_date, 1, 'waybill', 'ВН-1')
       $q$, _unpaid))),
      (_who.label, '«закупок немає» на іншому замовленні',
       case when _none then 'ok' else 'ERR 42501' end,
       pg_temp.probe(format('select null from tosho.set_order_purchases_none(%L, true)', _f.order_b))),
      (_who.label, 'документи постачальників (головна), без сум',
       case when _r then 'ok' else 'ERR 42501' end,
       pg_temp.probe(format($q$
         select case when tosho.list_pending_purchase_receipts(%L)::text ~ '"(amount|paid_amount|cost_with_vat)"' then 'з сумами!' end
       $q$, _f.team_id))),
      (_who.label, 'insert у таблицю напряму',
       'ERR 42501',
       pg_temp.probe(format($q$
         insert into tosho.order_purchases (team_id, order_id, description, supplier_name, supplier_invoice_date, amount)
         values (%L, %L, 'x', 'x', current_date, 1) returning null
       $q$, _f.team_id, _f.order_a))),
      (_who.label, 'truncate таблиці',
       'ERR 42501',
       pg_temp.probe('truncate tosho.order_purchases'));

    execute 'reset role';
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Гроші, охоронці, гейт ВН (від імені бухгалтера).
-- ---------------------------------------------------------------------------
-- Рахунки, з яких витрату із закупки списувати не можна.
insert into tosho.finance_accounts (team_id, name, kind, currency, is_active)
select team_id, 'fx-usd', 'bank', 'USD', true from fx
union all
select team_id, 'fx-off', 'bank', 'UAH', false from fx;

do $$
declare
  _f fx;
  _fop tosho.order_purchases;
  _expense tosho.finance_expenses;
  _usd uuid;
  _off uuid;
begin
  select * into _f from fx;
  select * into _fop from tosho.order_purchases where order_id = _f.order_a and description = 'fx-fop';
  select * into _expense from tosho.finance_expenses where id = _fop.expense_id;
  select id into _usd from tosho.finance_accounts where name = 'fx-usd' and team_id = _f.team_id;
  select id into _off from tosho.finance_accounts where name = 'fx-off' and team_id = _f.team_id;

  insert into check_results (who, what, expected, actual) values
    ('дані', 'ФОП 1000: собівартість / сплачено / сума витрати / ПДВ витрати',
     '1200.00/950.00/950.00/0.00',
     _fop.cost_with_vat || '/' || _fop.paid_amount || '/' || _expense.amount || '/' || _expense.vat_amount),
    ('дані', 'нотатка витрати', 'закінчується на · fx-fop',
     case when _expense.notes like '% · fx-fop' then 'закінчується на · fx-fop' else _expense.notes end),
    ('дані', 'юрособа витрати = замовлення, інакше рахунку', 'так',
     case when _expense.legal_entity_id is not distinct from coalesce(
            (select our_legal_entity_id from tosho.orders where id = _f.order_a),
            (select legal_entity_id from tosho.finance_accounts where id = _f.account_id)) then 'так' else 'ні' end),
    ('дані', 'категорія витрати активна', 'true',
     (select c.is_active::text from tosho.finance_expense_categories c where c.id = _expense.category_id));

  perform pg_temp.act_as((select user_id from who where label = 'accountant'));
  insert into check_results (who, what, expected, actual) values
    ('accountant', 'витрата із закупки: рахунок на валютний', 'ERR 22023',
     pg_temp.probe(format('update tosho.finance_expenses set account_id = %L where id = %L returning null', _usd, _expense.id))),
    ('accountant', 'витрата із закупки: рахунок на вимкнений', 'ERR 22023',
     pg_temp.probe(format('update tosho.finance_expenses set account_id = %L where id = %L returning null', _off, _expense.id))),
    ('accountant', 'витрата із закупки: рахунок прибрати (видалення рахунку)', 'ERR 42501',
     pg_temp.probe(format('update tosho.finance_expenses set account_id = null where id = %L returning null', _expense.id))),
    ('accountant', 'витрата із закупки: нотатки й категорія', 'ok',
     pg_temp.probe(format('update tosho.finance_expenses set notes = %L, category_id = null where id = %L returning null', 'вручну', _expense.id))),
    ('accountant', 'витрата із закупки: сума', 'ERR 42501',
     pg_temp.probe(format('update tosho.finance_expenses set amount = 1 where id = %L returning null', _expense.id))),
    ('accountant', 'опис і № оплаченого рядка оновлюють нотатку витрати', 'fx-fop нове · 77',
     pg_temp.probe(
       format($q$select null from tosho.save_order_purchase(%L, %L, null, 'fx-fop нове', %L, '77', %L, null, null, 1000, 'no_vat')$q$,
              _fop.id, _f.order_a, _fop.supplier_name, _fop.supplier_invoice_date),
       format($q$select substring(e.notes from position('fx-fop' in e.notes)) from tosho.finance_expenses e where e.id = %L$q$, _expense.id))),
    ('accountant', 'причина скасування довша за 200', 'ERR 22023',
     pg_temp.probe(format('select null from tosho.cancel_order_purchase_payment(%L, %L)', _fop.id, repeat('я', 201)))),
    ('accountant', 'скасування чистить сплачене й видаляє витрату', 'null/null/null/0',
     pg_temp.probe(
       format('select null from tosho.cancel_order_purchase_payment(%L, %L)', _fop.id, 'тест'),
       format($q$
         select coalesce(p.paid_amount::text, 'null') || '/' || coalesce(p.paid_on::text, 'null') || '/'
                || coalesce(p.expense_id::text, 'null') || '/'
                || (select count(*) from tosho.finance_expenses e where e.id = %L)
           from tosho.order_purchases p where p.id = %L
       $q$, _expense.id, _fop.id))),
    ('accountant', 'ВН на замовленні з неотриманими', 'ERR P0001',
     pg_temp.probe(format('update tosho.orders set waybill_number = %L where id = %L returning null', 'РН-1', _f.order_a))),
    ('accountant', 'ВН без закупок і без позначки', 'ERR P0001',
     pg_temp.probe(format('update tosho.orders set waybill_number = %L where id = %L returning null', 'РН-2', _f.order_c))),
    ('accountant', 'ВН на замовленні, що закривається актом', 'ok',
     pg_temp.probe(format($q$update tosho.orders set closing_document = 'act', waybill_number = 'РН-3' where id = %L returning null$q$, _f.order_c)));
  execute 'reset role';
end $$;

-- Обхід гейта через акт — окремими кроками, як зробив би клієнт PostgREST.
select pg_temp.act_as((select user_id from who where label = 'accountant')) \gset
update tosho.orders set closing_document = 'act' where id = (select order_a from fx);
update tosho.orders set waybill_number = 'РН-обхід' where id = (select order_a from fx);
insert into check_results (who, what, expected, actual)
select 'accountant', 'обхід: акт → номер ВН → назад на ВН', 'ERR P0001',
       pg_temp.probe(format($q$update tosho.orders set closing_document = 'waybill' where id = %L returning null$q$, order_a))
  from fx;
insert into check_results (who, what, expected, actual)
select 'accountant', 'обхід: акт → номер ВН → документ порожній', 'ERR P0001',
       pg_temp.probe(format('update tosho.orders set closing_document = null where id = %L returning null', order_a))
  from fx;
reset role;

-- Уже чинну ВН гейт не чіпає: виправлення номера проходить і з неотриманими.
-- Фікстуру пишемо як сервіс (без auth.uid()), тож claims спершу чистимо.
select set_config('request.jwt.claims', '', true) \gset
update tosho.orders set closing_document = 'waybill', waybill_number = 'РН-чинна' where id = (select order_a from fx);
select pg_temp.act_as((select user_id from who where label = 'accountant')) \gset
insert into check_results (who, what, expected, actual)
select 'accountant', 'виправлення вже чинної ВН не блокується', 'ok',
       pg_temp.probe(format($q$update tosho.orders set waybill_number = 'РН-чинна-2' where id = %L returning null$q$, order_a))
  from fx;
reset role;

-- Вимкнена категорія вмикається оплатою, а не ховає витрату.
update tosho.finance_expense_categories set is_active = false
 where team_id = (select team_id from fx) and lower(btrim(name)) = lower('Закупки під замовлення');
select pg_temp.act_as((select user_id from who where label = 'accountant')) \gset
insert into check_results (who, what, expected, actual)
select 'accountant', 'оплата у вимкнену категорію вмикає її', 'true',
       pg_temp.probe(
         format('select null from tosho.pay_order_purchase(%L, current_date, %L, 1000)', p.id, fx.account_id),
         format($q$
           select c.is_active::text
             from tosho.order_purchases op
             join tosho.finance_expenses e on e.id = op.expense_id
             join tosho.finance_expense_categories c on c.id = e.category_id
            where op.id = %L
         $q$, p.id))
  from fx join tosho.order_purchases p on p.order_id = fx.order_a and p.description = 'fx-to-pay';
reset role;

-- ---------------------------------------------------------------------------
-- Підсумок.
-- ---------------------------------------------------------------------------
\pset footer off
select who as "хто", what as "перевірка", expected as "очікували", actual as "вийшло",
       case when expected = actual then '' else 'РОЗБІЖНІСТЬ' end as " "
  from check_results order by seq;

select count(*) filter (where expected is distinct from actual) as "розбіжностей",
       count(*) as "перевірок",
       count(distinct who) filter (where who <> 'дані') as "хто"
  from check_results;

rollback;
