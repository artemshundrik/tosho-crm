-- ---------------------------------------------------------------------------
-- Погодження договору й СП, підписи і виняток для запуску
-- (REQ-322, пункти p6, p7, p8; СЕО погодив 14.10.2026).
--
-- p6. Договір і СП менеджер формує сам, але надіслати замовнику може лише
--     після погодження бухгалтера або СЕО (вистачить одного).
-- p7. Замовник підписує СП (паперово, у Вчасно чи в Медку); на першому
--     замовленні договір має бути підписаний обома сторонами. Підпис позначає
--     менеджер.
-- p8. Запуск = підписана СП (+ договір) + оплата за умовами. Запустити без
--     оплати чи підпису можна з дозволу одного з трьох: двох СЕО або головного
--     бухгалтера. Механіка — як у підписі ціни в прорахунку.
--
-- ОДНА ТАБЛИЦЯ НА ТРИ ВИДИ ЗАПИТІВ. Погодження договору, СП і винятку на запуск
-- мають однаковий життєвий цикл (на погодженні → погоджено / повернено /
-- відкликано), різниться лише коло тих, хто вирішує. Окремі таблиці дали б
-- три копії того самого тригера.
--
-- ЧОМУ ТРИГЕР. Політика не вміє порівняти old і new: без тригера автор міг би
-- сам перевести свій запит у «погоджено» — рівно та діра, від якої все це.
--
-- КОД ЧИТАЄ НОВІ КОЛОНКИ orders У ЗАГАЛЬНОМУ ЗАПИТІ ЗАМОВЛЕНЬ: без них список
-- падає на базові колонки й губить умови оплати. Застосувати ДО пушу.
--
-- Застосування: npm run db:apply scripts/order-approvals-and-signatures.sql
-- ---------------------------------------------------------------------------

create table if not exists tosho.order_approvals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  order_id uuid not null references tosho.orders(id) on delete cascade,
  kind text not null check (kind in ('contract', 'specification', 'launch')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'returned', 'withdrawn')),
  -- Відбиток документа на момент запиту (параметри, суми). Перестворили СП з
  -- іншими умовами — відбиток інший, і погодження вже не про цей документ.
  document_stamp text,
  request_note text,
  requested_by uuid,
  requested_at timestamptz not null default timezone('utc', now()),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text
);

comment on table tosho.order_approvals is
  'Запити погодження на замовленні: договір і СП (бухгалтер або СЕО), виняток для запуску (СЕО або головний бухгалтер). REQ-322 p6/p8.';

create unique index if not exists order_approvals_one_pending
  on tosho.order_approvals (order_id, kind)
  where status = 'pending';

create index if not exists order_approvals_team_idx
  on tosho.order_approvals (team_id, order_id, requested_at desc);

alter table tosho.order_approvals enable row level security;

drop policy if exists order_approvals_select on tosho.order_approvals;
create policy order_approvals_select on tosho.order_approvals
  for select to authenticated using (public.is_team_member(team_id));

drop policy if exists order_approvals_insert on tosho.order_approvals;
create policy order_approvals_insert on tosho.order_approvals
  for insert to authenticated with check (public.is_team_member(team_id));

drop policy if exists order_approvals_update on tosho.order_approvals;
create policy order_approvals_update on tosho.order_approvals
  for update to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
-- DELETE свідомо без політики: історія рішень не стирається.

revoke all on tosho.order_approvals from anon;
grant select, insert, update on tosho.order_approvals to authenticated;

-- Хто вирішує. Договір і СП — той самий круг, що виписує рахунок
-- (власник, СЕО, бухгалтери; tosho.is_order_invoice_issuer). Виняток для
-- запуску — лише СЕО або головний бухгалтер: саме їх троє назвав Влад.
create or replace function tosho.is_order_approver(_user_id uuid, _kind text)
returns boolean
language sql
stable
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
  select case
    when _kind = 'launch' then exists (
      select 1
        from tosho.memberships m
       where m.user_id = _user_id
         and lower(coalesce(m.job_role::text, '')) in ('seo', 'chief_accountant')
    )
    else tosho.is_order_invoice_issuer(_user_id)
  end;
$$;

revoke all on function tosho.is_order_approver(uuid, text) from public;
grant execute on function tosho.is_order_approver(uuid, text) to authenticated;

create or replace function tosho.enforce_order_approval_flow()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'Запит погодження заводиться у стані «на погодженні»' using errcode = '42501';
    end if;
    if new.kind = 'launch' and nullif(btrim(coalesce(new.request_note, '')), '') is null then
      raise exception 'Напишіть, чому запускаємо без оплати чи підпису' using errcode = '23514';
    end if;
    new.requested_by := auth.uid();
    new.requested_at := timezone('utc', now());
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
    return new;
  end if;

  if new.kind is distinct from old.kind
     or new.order_id is distinct from old.order_id
     or new.team_id is distinct from old.team_id
     or new.document_stamp is distinct from old.document_stamp
     or new.request_note is distinct from old.request_note
     or new.requested_by is distinct from old.requested_by
     or new.requested_at is distinct from old.requested_at then
    raise exception 'Заведений запит не переписується — заведіть новий' using errcode = '42501';
  end if;

  if old.status <> 'pending' then
    raise exception 'Рішення вже ухвалене — його не переглядають правкою рядка' using errcode = '42501';
  end if;

  if new.status in ('approved', 'returned') then
    if not tosho.is_order_approver(auth.uid(), new.kind) then
      raise exception '%', case when new.kind = 'launch'
        then 'Дозволити запуск без умов може СЕО або головний бухгалтер'
        else 'Погодити договір чи СП може бухгалтер або СЕО' end
        using errcode = '42501';
    end if;
    new.decision_note := nullif(btrim(coalesce(new.decision_note, '')), '');
    if new.status = 'returned' and new.decision_note is null then
      raise exception 'Напишіть, що виправити' using errcode = '23514';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := timezone('utc', now());
    return new;
  end if;

  if new.status = 'withdrawn' then
    if auth.uid() is distinct from old.requested_by
       and not tosho.is_order_approver(auth.uid(), old.kind) then
      raise exception 'Відкликати запит може його автор' using errcode = '42501';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := timezone('utc', now());
    return new;
  end if;

  raise exception 'Невідомий стан запиту: %', new.status using errcode = '22023';
end;
$$;

revoke all on function tosho.enforce_order_approval_flow() from public;

drop trigger if exists order_approvals_flow on tosho.order_approvals;
create trigger order_approvals_flow
before insert or update on tosho.order_approvals
for each row execute function tosho.enforce_order_approval_flow();

-- p7. Позначки підпису. Хто поставив — пише тригер, не клієнт.
alter table tosho.orders
  add column if not exists contract_signed_at timestamptz,
  add column if not exists contract_signed_by uuid,
  add column if not exists contract_signed_via text,
  add column if not exists specification_signed_at timestamptz,
  add column if not exists specification_signed_by uuid,
  add column if not exists specification_signed_via text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_contract_signed_via_chk') then
    alter table tosho.orders add constraint orders_contract_signed_via_chk
      check (contract_signed_via is null or contract_signed_via in ('paper', 'vchasno', 'medoc'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_specification_signed_via_chk') then
    alter table tosho.orders add constraint orders_specification_signed_via_chk
      check (specification_signed_via is null or specification_signed_via in ('paper', 'vchasno', 'medoc'));
  end if;
end$$;

comment on column tosho.orders.contract_signed_at is
  'Договір підписаний обома сторонами (позначає менеджер). На наступних замовленнях замовника успадковується.';
comment on column tosho.orders.specification_signed_at is
  'СП підписана замовником — папір, Вчасно чи Медок. Без неї запуск лише з дозволу (REQ-322 p8).';

create or replace function tosho.stamp_order_signature_marks()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.contract_signed_at is distinct from old.contract_signed_at then
    new.contract_signed_by := case when new.contract_signed_at is null then null else auth.uid() end;
    if new.contract_signed_at is null then new.contract_signed_via := null; end if;
  elsif new.contract_signed_by is distinct from old.contract_signed_by then
    new.contract_signed_by := old.contract_signed_by;
  end if;
  if new.specification_signed_at is distinct from old.specification_signed_at then
    new.specification_signed_by := case when new.specification_signed_at is null then null else auth.uid() end;
    if new.specification_signed_at is null then new.specification_signed_via := null; end if;
  elsif new.specification_signed_by is distinct from old.specification_signed_by then
    new.specification_signed_by := old.specification_signed_by;
  end if;
  return new;
end;
$$;

revoke all on function tosho.stamp_order_signature_marks() from public;

drop trigger if exists orders_signature_marks on tosho.orders;
create trigger orders_signature_marks
before update on tosho.orders
for each row execute function tosho.stamp_order_signature_marks();
