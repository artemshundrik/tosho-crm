-- scripts/vchasno-schema.sql
-- Інтеграція з «Вчасно.ЕДО» — Фаза 1 (вихідний потік).
-- Схема: tosho. RLS — team-scoped через public.is_team_member(team_id).
-- Застосовувати в Supabase SQL editor. Ідемпотентна (if not exists / add column if not exists).

-- 1) Touch-функція для updated_at (самодостатня, не залежить від фінмодуля)
create or replace function tosho.vchasno_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- 2) Реєстр документів, що пройшли через «Вчасно» (вихідні + згодом вхідні)
create table if not exists tosho.vchasno_documents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,

  -- з-під кого слали (→ який токен у env); Фаза 1 — завжди ФОП В.О.
  legal_entity_id uuid references tosho.finance_legal_entities(id) on delete set null,

  -- контрагент-отримувач
  customer_id uuid references tosho.customers(id) on delete set null,
  recipient_edrpou text,

  -- наш документ
  crm_doc_type text not null,          -- invoice | debit_note | annex | contract (рахунок/ВН/додаток/договір)
  crm_doc_id uuid,                     -- = vendor_id у «Вчасно» (синхронізація статусів)
  order_id uuid,
  quote_id uuid,

  -- бік «Вчасно»
  direction text not null default 'outgoing',  -- outgoing | incoming
  vchasno_document_id text,            -- id документа в «Вчасно»
  vchasno_category integer,            -- мапа типу (рахунок=2, ВН=5, додаток=14, договір=3 ...)
  status_code integer,                 -- 7000 завантажений / 7001 готовий / 7006,7008 завершено / 7011 анульовано
  status_label text,
  last_error text,

  -- віхи
  sent_at timestamptz,
  signed_at timestamptz,
  finished_at timestamptz,
  last_synced_at timestamptz,

  raw jsonb not null default '{}'::jsonb,

  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists vchasno_documents_team_idx
  on tosho.vchasno_documents (team_id, created_at desc);
create index if not exists vchasno_documents_vdoc_idx
  on tosho.vchasno_documents (vchasno_document_id);
create index if not exists vchasno_documents_crmdoc_idx
  on tosho.vchasno_documents (crm_doc_id);
create index if not exists vchasno_documents_customer_idx
  on tosho.vchasno_documents (customer_id);

alter table tosho.vchasno_documents enable row level security;

drop policy if exists vchasno_documents_select on tosho.vchasno_documents;
create policy vchasno_documents_select on tosho.vchasno_documents
  for select using (public.is_team_member(team_id));

drop policy if exists vchasno_documents_insert on tosho.vchasno_documents;
create policy vchasno_documents_insert on tosho.vchasno_documents
  for insert with check (public.is_team_member(team_id));

drop policy if exists vchasno_documents_update on tosho.vchasno_documents;
create policy vchasno_documents_update on tosho.vchasno_documents
  for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

drop policy if exists vchasno_documents_delete on tosho.vchasno_documents;
create policy vchasno_documents_delete on tosho.vchasno_documents
  for delete using (public.is_team_member(team_id));

drop trigger if exists vchasno_documents_touch on tosho.vchasno_documents;
create trigger vchasno_documents_touch
  before update on tosho.vchasno_documents
  for each row execute function tosho.vchasno_touch_updated_at();

-- 3) Юрособа → ключ кабінету «Вчасно» (за яким бекенд бере токен з env, напр. 'fop_vo')
alter table tosho.finance_legal_entities
  add column if not exists vchasno_company_key text;

-- 4) Картка клієнта → вкладка «Бухгалтер»: куди слати документ + ЄДРПОУ контрагента
alter table tosho.customers
  add column if not exists accountant_name text,
  add column if not exists accountant_email text,
  add column if not exists accountant_edrpou text;
