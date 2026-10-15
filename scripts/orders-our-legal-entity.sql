-- Наша юрособа на замовленні й закривальний документ (REQ-322, пункти p1–p3).
--
-- Документи замовлення виписуються від ТОВ «АВАНПРІНТ» або від одного з ФОП.
-- Реквізити — у довіднику tosho.finance_legal_entities, але його читає лише
-- фінансове коло (has_finance_access), а менеджер обирає юрособу сам. Тому:
--   - функція list_order_legal_entities() віддає учасникам команди активні
--     юрособи з реквізитами (ті самі, що й так друкуються в документах замовнику);
--   - на замовлення лягає ЗНІМОК реквізитів (our_legal_entity), щоб надісланий
--     документ не мінявся заднім числом, коли довідник поправили.
-- Замовлення без юрособи друкуються від ТОВ, як і досі.

alter table tosho.orders
  add column if not exists our_legal_entity_id uuid
    references tosho.finance_legal_entities(id) on delete restrict,  -- юрособа з замовленнями не зникає: інакше ФОП-замовлення мовчки стали б ТОВ
  add column if not exists our_legal_entity jsonb,
  add column if not exists closing_document text;

alter table tosho.orders drop constraint if exists orders_closing_document_check;
alter table tosho.orders
  add constraint orders_closing_document_check
  check (closing_document is null or closing_document in ('waybill', 'act'));

create or replace function tosho.list_order_legal_entities(_team_id uuid)
returns table (
  id uuid,
  name text,
  kind text,
  vat_payer boolean,
  tax_group text,
  edrpou text,
  ipn text,
  iban text,
  requisites jsonb
)
language sql
stable
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
  select e.id, e.name, e.kind, e.vat_payer, e.tax_group, e.edrpou, e.ipn, e.iban,
    -- лише те, що друкують документи; решта requisites — для фінансового кола
    jsonb_strip_nulls(jsonb_build_object(
      'full_name', e.requisites->'full_name',
      'address', e.requisites->'address',
      'bank', e.requisites->'bank',
      'phone', e.requisites->'phone',
      'signatory_name', e.requisites->'signatory_name',
      'signatory_genitive', e.requisites->'signatory_genitive',
      'signatory_position', e.requisites->'signatory_position',
      'signatory_position_genitive', e.requisites->'signatory_position_genitive',
      'authority', e.requisites->'authority',
      'signature_label', e.requisites->'signature_label'
    )) as requisites
  from tosho.finance_legal_entities e
  where e.team_id = _team_id
    and e.is_active
    and e.kind in ('llc', 'sole_prop')
    and public.is_team_member(_team_id)
  order by e.sort_order, e.name;
$$;

revoke all on function tosho.list_order_legal_entities(uuid) from public;
revoke all on function tosho.list_order_legal_entities(uuid) from anon;
grant execute on function tosho.list_order_legal_entities(uuid) to authenticated;

-- У кожної юрособи своя база в BAS і своя нумерація рахунків: «№ 118» ТОВ і
-- «№ 118» ФОП — різні рахунки. Ключ унікальності розширюємо юрособою.
drop index if exists tosho.orders_invoice_number_year_uniq;
create unique index if not exists orders_invoice_number_entity_year_uniq
  on tosho.orders (
    team_id,
    coalesce(our_legal_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    invoice_number,
    (extract(year from invoice_date))
  )
  where invoice_number is not null and invoice_date is not null;
