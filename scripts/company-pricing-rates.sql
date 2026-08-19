-- Ставки ціноутворення компанії: постійні витрати і податковий резерв.
--
-- Навіщо: досі ці два числа були КОНСТАНТАМИ В КОДІ, ще й продубльованими у
-- двох файлах (QuotesPage.tsx і QuoteDetailsPage.tsx). Щоб змінити ставку,
-- потрібен був деплой, а якби хтось поправив лише один файл — прорахунки з
-- різних екранів рахувались би по-різному. Рішення СЕО 18.08: винести в
-- налаштування, щоб міняти самому.
--
-- Ставка МЕНЕДЖЕРА сюди НЕ переїжджає: вона персональна й живе в
-- tosho.team_member_manager_rates.

create table if not exists tosho.company_pricing_rates (
  workspace_id uuid primary key,
  fixed_cost_rate numeric(6, 2) not null default 30,
  vat_rate numeric(6, 2) not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Історія: СЕО просив бачити, «що було в той день/час» — хто поставив, коли,
-- і з чого на що. Веде ТРИГЕР, а не клієнт: запис, який залежить від того, чи
-- не забув про нього фронт, історією не є.
create table if not exists tosho.company_pricing_rate_changes (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  field text not null check (field in ('fixed_cost_rate', 'vat_rate')),
  old_value numeric(6, 2),
  -- changed_by НАВМИСНО nullable: на аудиті статусу прорахунку вже наступали
  -- на NOT NULL — запис падав там, де auth-контексту немає (міграції, cron).
  new_value numeric(6, 2) not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists company_pricing_rate_changes_ws_idx
  on tosho.company_pricing_rate_changes (workspace_id, changed_at desc);

create or replace function tosho.log_company_pricing_rate_change()
returns trigger
language plpgsql
security definer
set search_path = tosho, public
as $$
begin
  if tg_op = 'INSERT' then
    insert into tosho.company_pricing_rate_changes (workspace_id, field, old_value, new_value, changed_by)
    values (new.workspace_id, 'fixed_cost_rate', null, new.fixed_cost_rate, new.updated_by),
           (new.workspace_id, 'vat_rate', null, new.vat_rate, new.updated_by);
    return new;
  end if;

  if new.fixed_cost_rate is distinct from old.fixed_cost_rate then
    insert into tosho.company_pricing_rate_changes (workspace_id, field, old_value, new_value, changed_by)
    values (new.workspace_id, 'fixed_cost_rate', old.fixed_cost_rate, new.fixed_cost_rate, new.updated_by);
  end if;

  if new.vat_rate is distinct from old.vat_rate then
    insert into tosho.company_pricing_rate_changes (workspace_id, field, old_value, new_value, changed_by)
    values (new.workspace_id, 'vat_rate', old.vat_rate, new.vat_rate, new.updated_by);
  end if;

  return new;
end;
$$;

drop trigger if exists company_pricing_rates_audit on tosho.company_pricing_rates;
create trigger company_pricing_rates_audit
  after insert or update on tosho.company_pricing_rates
  for each row execute function tosho.log_company_pricing_rate_change();

alter table tosho.company_pricing_rates enable row level security;
alter table tosho.company_pricing_rate_changes enable row level security;

-- ЧИТАТИ ставки має ВСЯ команда, не лише СЕО: ціна рахується на клієнті, і
-- якщо менеджер не побачить рядка, він мовчки впаде на дефолти — той самий
-- прорахунок показував би різні ціни різним людям.
drop policy if exists company_pricing_rates_select on tosho.company_pricing_rates;
create policy company_pricing_rates_select on tosho.company_pricing_rates
  for select using (
    exists (
      select 1 from tosho.memberships_view mv
      where mv.workspace_id = company_pricing_rates.workspace_id
        and mv.user_id = auth.uid()
    )
  );

-- МІНЯТИ — власник або СЕО. Той самий набір, що вирішує персональні ставки.
drop policy if exists company_pricing_rates_insert on tosho.company_pricing_rates;
create policy company_pricing_rates_insert on tosho.company_pricing_rates
  for insert with check (
    exists (
      select 1 from tosho.memberships_view mv
      where mv.workspace_id = company_pricing_rates.workspace_id
        and mv.user_id = auth.uid()
        and (mv.access_role = 'owner'::tosho.workspace_role
             or lower(coalesce(mv.job_role::text, '')) = 'seo')
    )
  );

drop policy if exists company_pricing_rates_update on tosho.company_pricing_rates;
create policy company_pricing_rates_update on tosho.company_pricing_rates
  for update using (
    exists (
      select 1 from tosho.memberships_view mv
      where mv.workspace_id = company_pricing_rates.workspace_id
        and mv.user_id = auth.uid()
        and (mv.access_role = 'owner'::tosho.workspace_role
             or lower(coalesce(mv.job_role::text, '')) = 'seo')
    )
  );

-- Історію читають лише ті, хто може міняти. Писати з клієнта не можна взагалі:
-- єдине джерело записів — тригер (security definer).
drop policy if exists company_pricing_rate_changes_select on tosho.company_pricing_rate_changes;
create policy company_pricing_rate_changes_select on tosho.company_pricing_rate_changes
  for select using (
    exists (
      select 1 from tosho.memberships_view mv
      where mv.workspace_id = company_pricing_rate_changes.workspace_id
        and mv.user_id = auth.uid()
        and (mv.access_role = 'owner'::tosho.workspace_role
             or lower(coalesce(mv.job_role::text, '')) = 'seo')
    )
  );

grant select on tosho.company_pricing_rates to authenticated;
grant insert, update on tosho.company_pricing_rates to authenticated;
grant select on tosho.company_pricing_rate_changes to authenticated;
revoke all on tosho.company_pricing_rates from anon;
revoke all on tosho.company_pricing_rate_changes from anon;

comment on table tosho.company_pricing_rates is
  'Постійні витрати і податковий резерв у відсотках. Ставка менеджера персональна — у team_member_manager_rates.';
