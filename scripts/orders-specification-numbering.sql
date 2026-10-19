-- Номер договору, номер СП і «Текст у СП» (REQ-322#p22–p24).
--
-- НОМЕР ДОГОВОРУ — «ДД/ММ/РРРР-NNN»: дата договору + лічильник договорів за
-- цю дату (001, 002…). Досі CRM підставляла номер замовлення (TS-1026-0012),
-- а бухгалтерія вела номери окремо — і вони розходились.
--
-- НОМЕР СП — «Додаток (Специфікація) № N», N з 1 у межах договору: нова СП —
-- наступна після попередньої СП цього договору. Договір один на замовника й
-- нашу юрособу, а СП — на кожне замовлення (див. contractInheritanceKey у
-- orderRecords.ts), тож «межі договору» — це замовлення того ж замовника з тією
-- ж нашою юрособою, чия СП створена після цього договору.
--
-- Обидва номери видає тригер у момент, коли документ уперше позначено
-- створеним: двоє менеджерів, що створюють договори одночасно, не отримають
-- однакового номера (замок на дату / договір), а лічильник бачить усі
-- замовлення команди незалежно від того, що дозволяє RLS конкретному менеджеру.
-- Номер, вписаний руками (CEO вводить номер паперового договору), не
-- перезаписується. Старі договори й СП без номера лишаються як були: вони вже
-- підписані з номером замовлення, і перенумерація заднім числом розвела б їх із
-- папером.

alter table tosho.orders
  add column if not exists specification_number integer;

comment on column tosho.orders.specification_number is
  'Номер СП у межах договору (1, 2, 3…). Видає тригер orders_document_numbers; групова СП ставить один номер усім своїм замовленням.';

-- Опис позиції в СП, який менеджер поправив руками. null — береться типовий
-- текст (назва + технічні характеристики + нанесення), зібраний у CRM.
alter table tosho.order_items
  add column if not exists spec_text text;

comment on column tosho.order_items.spec_text is
  'Текст позиції в СП, поправлений менеджером. null — типовий текст, який збирає CRM.';

create or replace function tosho.assign_order_document_numbers()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public'
as $$
declare
  v_date date;
  v_prefix text;
  v_next integer;
  v_contract_id uuid;
  v_contract_created_at timestamptz;
begin
  -- Договір: номер за датою договору, коли його вперше створено без номера.
  if new.contract_created_at is not null
     and old.contract_created_at is null
     and nullif(btrim(coalesce(new.contract_number, '')), '') is null then
    v_date := coalesce(new.contract_date, (now() at time zone 'Europe/Kyiv')::date);
    v_prefix := to_char(v_date, 'DD/MM/YYYY') || '-';
    perform pg_advisory_xact_lock(hashtextextended('order-contract-number:' || new.team_id::text || ':' || v_prefix, 0));
    select coalesce(max(substring(o.contract_number from char_length(v_prefix) + 1)::integer), 0) + 1
      into v_next
      from tosho.orders o
     where o.team_id = new.team_id
       and o.id <> new.id
       and o.contract_number like v_prefix || '%'
       and substring(o.contract_number from char_length(v_prefix) + 1) ~ '^[0-9]{1,6}$';
    new.contract_number := v_prefix || lpad(v_next::text, 3, '0');
    new.contract_date := v_date;
  end if;

  -- СП: наступний номер у межах договору, коли СП уперше створено без номера.
  if new.specification_created_at is not null
     and old.specification_created_at is null
     and new.specification_number is null then
    -- Договір, під який іде СП: власний, інакше найсвіжіший договір того ж
    -- замовника з тією ж нашою юрособою (так само рахує orderRecords.ts).
    select o.id, o.contract_created_at
      into v_contract_id, v_contract_created_at
      from tosho.orders o
     where o.team_id = new.team_id
       and o.contract_created_at is not null
       and (
         o.id = new.id
         or (
           new.customer_id is not null
           and o.customer_id = new.customer_id
           and o.our_legal_entity_id is not distinct from new.our_legal_entity_id
         )
       )
     order by (o.id = new.id) desc, coalesce(o.contract_date, o.contract_created_at::date) desc, o.contract_created_at desc
     limit 1;

    perform pg_advisory_xact_lock(
      hashtextextended('order-specification-number:' || coalesce(v_contract_id, new.id)::text, 0)
    );
    select coalesce(max(o.specification_number), 0) + 1
      into v_next
      from tosho.orders o
     where o.team_id = new.team_id
       and o.id <> new.id
       and o.specification_number is not null
       and new.customer_id is not null
       and o.customer_id = new.customer_id
       and o.our_legal_entity_id is not distinct from new.our_legal_entity_id
       and (v_contract_created_at is null or o.specification_created_at >= v_contract_created_at);
    new.specification_number := v_next;
  end if;

  return new;
end;
$$;

revoke all on function tosho.assign_order_document_numbers() from public;

drop trigger if exists orders_document_numbers on tosho.orders;
create trigger orders_document_numbers
before update of contract_created_at, specification_created_at on tosho.orders
for each row execute function tosho.assign_order_document_numbers();
