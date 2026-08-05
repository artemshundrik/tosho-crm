-- Наскрізна нумерація документів (поки що — рахунки на оплату).
--
-- Чому окрема таблиця, а не max+1 по orders, як у номерах замовлень:
-- номер замовлення не унікальний і колізія там нешкідлива, а два рахунки з
-- однаковим номером — це вже проблема в бухгалтерії. Тож інкремент атомарний,
-- під блокуванням рядка, і видає номер рівно один раз.
--
-- Ключ лічильника — чотири поля, і кожне з них тут не випадкове:
--   kind       — тип документа (поки лише 'invoice');
--   entity_key — юрособа, від імені якої виписано. Нумерація ТОВ і ФОП
--                НЕЗАЛЕЖНІ: у ТОВ уже близько 300 рахунків, у ФОП — близько 100;
--   period     — рік. Нумерація обнуляється 1 січня, тож новий рік просто
--                створює новий рядок, який починається з 1. Нічого чистити
--                вручну не треба;
--   last_number — ОСТАННІЙ виданий номер (не наступний).
--
-- Формат («001») лишається на боці застосунку: у базі це число, щоб
-- інкремент і сортування були чесними.

drop function if exists tosho.next_document_number(uuid, text);
drop table if exists tosho.document_counters;

create table tosho.document_counters (
  team_id     uuid        not null,
  kind        text        not null,
  entity_key  text        not null,
  period      text        not null,
  last_number bigint      not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (team_id, kind, entity_key, period),
  constraint document_counters_kind_check check (kind in ('invoice')),
  constraint document_counters_last_number_check check (last_number >= 0)
);

comment on table tosho.document_counters is
  'Лічильники номерів документів: окремо на юрособу і на рік. last_number — останній виданий номер.';

alter table tosho.document_counters enable row level security;

drop policy if exists document_counters_team_read on tosho.document_counters;
create policy document_counters_team_read
  on tosho.document_counters for select
  using (public.is_team_member(team_id));

-- Бухгалтерія мусить мати змогу виправити нумерацію (перенести залишок зі старої
-- програми, зсунути після помилки), тож запис дозволений — але лише своїй команді.
drop policy if exists document_counters_team_write on tosho.document_counters;
create policy document_counters_team_write
  on tosho.document_counters for all
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

revoke all on tosho.document_counters from anon;
grant select, insert, update on tosho.document_counters to authenticated;

/**
 * Видати наступний номер документа. Атомарно: конфлікт по ключу блокує рядок,
 * тож паралельні виклики отримають різні номери.
 *
 * SECURITY DEFINER — тому членство в команді перевіряємо тут явно.
 */
create or replace function tosho.next_document_number(
  p_team_id    uuid,
  p_kind       text,
  p_entity_key text,
  p_period     text
)
returns bigint
language plpgsql
security definer
set search_path = tosho, public
as $$
declare
  v_number bigint;
begin
  if p_team_id is null or p_kind is null or p_entity_key is null or p_period is null then
    raise exception 'team_id, kind, entity_key and period are required';
  end if;
  if not public.is_team_member(p_team_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into tosho.document_counters as c (team_id, kind, entity_key, period, last_number)
  values (p_team_id, p_kind, p_entity_key, p_period, 1)
  on conflict (team_id, kind, entity_key, period)
    do update set last_number = c.last_number + 1, updated_at = now()
  returning c.last_number into v_number;

  return v_number;
end;
$$;

revoke all on function tosho.next_document_number(uuid, text, text, text) from public, anon;
grant execute on function tosho.next_document_number(uuid, text, text, text) to authenticated;

-- Закріплений за замовленням номер рахунку. Проставляється один раз, при першій
-- генерації, і далі не змінюється сам — але бухгалтерія може виправити руками.
alter table tosho.orders add column if not exists invoice_number text;
alter table tosho.orders add column if not exists invoice_created_at timestamptz;

comment on column tosho.orders.invoice_number is
  'Номер рахунку. Видається лічильником при першій генерації; редагується бухгалтерією.';

notify pgrst, 'reload schema';
