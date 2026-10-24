-- Договори, підписані поза CRM, і хто веде документи замовлення (REQ-322#p39, p41).
--
-- Влад 24.10.2026: договір, який уже підписали без CRM, бухгалтер вносить сам —
-- файлом, з розпізнаними номером, датою й терміном. Рядок тут — такий самий
-- договір замовника з нашою юрособою, як і створений у CRM: замовлення без
-- власного договору успадковують найсвіжіший (src/features/orders/customerContracts.ts).
--
-- Хто вносить договори й править назви позицій у документах: власник, СЕО,
-- головний бухгалтер, бухгалтер, молодший бухгалтер. Дзеркало в коді —
-- canManageOrderDocuments (src/lib/permissions.ts).

create or replace function tosho.is_order_document_clerk(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
  select exists (
    select 1
      from tosho.memberships m
     where m.user_id = _user_id
       and (
         lower(coalesce(m.role::text, '')) = 'owner'
         or lower(coalesce(m.job_role::text, '')) in ('seo', 'chief_accountant', 'accountant', 'junior_accountant')
       )
  );
$$;

revoke all on function tosho.is_order_document_clerk(uuid) from public;
grant execute on function tosho.is_order_document_clerk(uuid) to authenticated;

create table if not exists tosho.customer_contracts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  customer_id uuid not null references tosho.customers(id) on delete cascade,
  -- Наша юрособа: договір із ТОВ не покриває замовлення від ФОП. NULL — як у
  -- замовлень без юрособи (ключ успадкування той самий).
  our_legal_entity_id uuid,
  number text not null check (length(btrim(number)) > 0),
  contract_date date not null,
  valid_until date,
  auto_prolongation boolean not null default false,
  signed_via text not null default 'paper' check (signed_via in ('paper', 'vchasno', 'medoc')),
  file_path text,
  file_name text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table tosho.customer_contracts is
  'Договори з замовником, підписані поза CRM (REQ-322#p39). Замовлення без власного договору успадковують найсвіжіший.';

create index if not exists customer_contracts_customer_idx on tosho.customer_contracts (team_id, customer_id);

alter table tosho.customer_contracts enable row level security;

drop policy if exists customer_contracts_select on tosho.customer_contracts;
create policy customer_contracts_select on tosho.customer_contracts
  for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists customer_contracts_insert on tosho.customer_contracts;
create policy customer_contracts_insert on tosho.customer_contracts
  for insert to authenticated
  with check (
    public.is_team_member(team_id)
    and tosho.is_order_document_clerk(auth.uid())
    and exists (select 1 from tosho.customers c where c.id = customer_id and c.team_id = customer_contracts.team_id)
  );

drop policy if exists customer_contracts_update on tosho.customer_contracts;
create policy customer_contracts_update on tosho.customer_contracts
  for update to authenticated
  using (public.is_team_member(team_id) and tosho.is_order_document_clerk(auth.uid()))
  with check (
    public.is_team_member(team_id)
    and tosho.is_order_document_clerk(auth.uid())
    and exists (select 1 from tosho.customers c where c.id = customer_id and c.team_id = customer_contracts.team_id)
  );

drop policy if exists customer_contracts_delete on tosho.customer_contracts;
create policy customer_contracts_delete on tosho.customer_contracts
  for delete to authenticated
  using (public.is_team_member(team_id) and tosho.is_order_document_clerk(auth.uid()));

-- Default ACL схеми дає новій таблиці гранти й anon; знімаємо явно.
revoke all on tosho.customer_contracts from anon, public;
grant select, insert, update, delete on tosho.customer_contracts to authenticated;

-- Назву позиції в документах (номенклатуру BAS) правлять лише ті самі ролі
-- (REQ-322#p41). Сервісні записи без користувача (auth.uid() is null) не чіпаємо.
create or replace function tosho.order_items_guard_document_name()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
begin
  if new.document_name is distinct from old.document_name
     and auth.uid() is not null
     and not tosho.is_order_document_clerk(auth.uid()) then
    raise exception 'Назву в документах правлять СЕО і бухгалтерія.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_guard_document_name on tosho.order_items;
create trigger order_items_guard_document_name
  before update of document_name on tosho.order_items
  for each row execute function tosho.order_items_guard_document_name();
