-- ---------------------------------------------------------------------------
-- Надсилання документів замовнику: «надіслано», «нагадали», «повернули з
-- правками» (REQ-343; СЕО погодив 30.10–02.11.2026).
--
-- ЗВІДКИ. Після погодження договору й СП CRM писала «чекаємо замовника», хоча
-- документи могли ще лежати в менеджера: чи їх надіслали, база не знала. Тож
-- хибним був і «хід» у списку замовлень, і нагадувати не було від чого.
--
-- ЖУРНАЛ, А НЕ СТАТУС. Кожен рядок — факт: що (договір, СП, рахунок), коли, як
-- (пошта, Telegram, Viber, WhatsApp, інакше, Вчасно) і відбиток документа на
-- той момент. Чинність рахує інтерфейс: змінили документ після надсилання —
-- відбиток інший, і «надіслано» вже не про нього. Окремий рядок на «нагадали»
-- і «повернув з правками» дає історію без перезапису.
--
-- ВЧАСНО (картка 333) пише сюди ж, з каналом 'vchasno' і через service role —
-- тригер тоді не підміняє автора.
--
-- ПРАВКИ НЕМАЄ: рядок або є, або його прибрали. Помилкову позначку прибирає
-- той, хто її поставив, — і тільки свою.
--
-- Застосування: npm run db:apply scripts/order-document-dispatches.sql
-- Код без таблиці не падає: читання повертає порожньо, тож порядок застосування
-- й пушу не важливий.
-- ---------------------------------------------------------------------------

create table if not exists tosho.order_document_dispatches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  order_id uuid not null references tosho.orders(id) on delete cascade,
  document text not null check (document in ('contract', 'specification', 'invoice')),
  event text not null check (event in ('sent', 'reminded', 'customer_returned')),
  channel text check (channel is null or channel in ('email', 'telegram', 'viber', 'whatsapp', 'other', 'vchasno')),
  -- Відбиток документа на момент події (той самий, що в order_approvals).
  document_stamp text,
  note text check (note is null or char_length(note) <= 2000),
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table tosho.order_document_dispatches is
  'Надсилання договору, СП і рахунку замовнику: надіслано / нагадали / повернув з правками, з каналом і відбитком документа. REQ-343.';

create index if not exists order_document_dispatches_team_idx
  on tosho.order_document_dispatches (team_id, order_id, created_at desc);

alter table tosho.order_document_dispatches enable row level security;

drop policy if exists order_document_dispatches_select on tosho.order_document_dispatches;
create policy order_document_dispatches_select on tosho.order_document_dispatches
  for select to authenticated using (public.is_team_member(team_id));

drop policy if exists order_document_dispatches_insert on tosho.order_document_dispatches;
create policy order_document_dispatches_insert on tosho.order_document_dispatches
  for insert to authenticated with check (public.is_team_member(team_id));

drop policy if exists order_document_dispatches_delete on tosho.order_document_dispatches;
create policy order_document_dispatches_delete on tosho.order_document_dispatches
  for delete to authenticated
  using (public.is_team_member(team_id) and created_by = auth.uid());
-- UPDATE свідомо без політики: факт не переписується.

revoke all on tosho.order_document_dispatches from anon;
revoke all on tosho.order_document_dispatches from authenticated;
grant select, insert, delete on tosho.order_document_dispatches to authenticated;

-- Автор і час — від бази, не від клієнта; замовлення має бути своєї команди,
-- інакше член однієї команди міг би вішати позначки на чуже замовлення.
create or replace function tosho.stamp_order_document_dispatch()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
begin
  if not exists (
    select 1 from tosho.orders o where o.id = new.order_id and o.team_id = new.team_id
  ) then
    raise exception 'Замовлення не належить цій команді' using errcode = '42501';
  end if;
  new.note := nullif(btrim(coalesce(new.note, '')), '');
  if auth.uid() is null then
    -- Сервісні записи (Вчасно, картка 333): автор і час — як передали.
    return new;
  end if;
  if new.channel = 'vchasno' then
    raise exception 'Позначку «у Вчасно» ставить сама інтеграція' using errcode = '42501';
  end if;
  if new.event = 'customer_returned' and new.note is null then
    raise exception 'Напишіть, що замовник просить змінити' using errcode = '23514';
  end if;
  new.created_by := auth.uid();
  new.created_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function tosho.stamp_order_document_dispatch() from public;

drop trigger if exists order_document_dispatches_stamp on tosho.order_document_dispatches;
create trigger order_document_dispatches_stamp
before insert on tosho.order_document_dispatches
for each row execute function tosho.stamp_order_document_dispatch();
