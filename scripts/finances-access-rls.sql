-- Finance module — role-restricted RLS.
-- Доступ до фінансових даних мають ЛИШЕ: власник (owner / CEO), SEO та бухгалтери
-- (accountant, chief_accountant, junior_accountant). Enforced at the DB level,
-- not just in the UI. See docs/FINANCES_DESIGN.md.
--
-- ВИПЛАТИ КОМАНДІ — ОКРЕМИЙ, ВУЖЧИЙ КОНТУР. Зарплати бачать лише власник і SEO:
-- бухгалтер веде рахунки й витрати, але не заглядає, хто скільки отримує.
-- Це не «фінанси суворіше», це інший контур: `tosho.has_payroll_access`.
-- Так само вже влаштовані політики tosho.payroll_entries (owner/seo inline).
-- Safe to run multiple times.

begin;

-- Team-scoped membership (public.team_members) + finance-authorized role
-- (tosho.memberships holds the real access_role/job_role used by the app).
create or replace function tosho.has_finance_access(_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'tosho', 'auth'
as $$
  select
    exists (
      select 1 from public.team_members tm
      where tm.team_id = _team_id and tm.user_id = auth.uid()
    )
    and exists (
      select 1 from tosho.memberships m
      where m.user_id = auth.uid()
        and (
          lower(coalesce(m.role::text, '')) = 'owner'
          or lower(coalesce(m.job_role::text, '')) in ('seo', 'accountant', 'chief_accountant', 'junior_accountant')
        )
    )
    -- Звільненого не пускаємо, навіть якщо посада фінансова. Цей рядок додав
    -- access-lockout.sql; тримаємо обидві копії функції однаковими, інакше
    -- повторний запуск ЦЬОГО файлу мовчки зняв би блокування.
    and not tosho.is_user_blocked(auth.uid());
$$;

grant execute on function tosho.has_finance_access(uuid) to authenticated;

-- Виплати команді: власник + SEO, і більше ніхто. Окрема функція, а не прапорець
-- усередині has_finance_access, бо це інше питання й інша відповідь.
create or replace function tosho.has_payroll_access(_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'tosho', 'auth'
as $$
  select
    exists (
      select 1 from public.team_members tm
      where tm.team_id = _team_id and tm.user_id = auth.uid()
    )
    and exists (
      select 1 from tosho.memberships m
      where m.user_id = auth.uid()
        and (
          lower(coalesce(m.role::text, '')) = 'owner'
          or lower(coalesce(m.job_role::text, '')) = 'seo'
        )
    )
    and not tosho.is_user_blocked(auth.uid());
$$;

grant execute on function tosho.has_payroll_access(uuid) to authenticated;

do $$
declare
  tbl text;
  op text;
  policy_name text;
begin
  foreach tbl in array array[
    'finance_legal_entities',
    'finance_accounts',
    'finance_order_meta',
    'finance_invoices',
    'finance_payments',
    'finance_expense_categories',
    'finance_expenses',
    'finance_expense_allocations',
    'finance_taxes'
  ] loop
    execute format('alter table tosho.%I enable row level security', tbl);

    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      policy_name := tbl || '_' || op;
      execute format('drop policy if exists %I on tosho.%I', policy_name, tbl);

      if op = 'select' then
        execute format(
          'create policy %I on tosho.%I for select using (tosho.has_finance_access(team_id))',
          policy_name, tbl);
      elsif op = 'insert' then
        execute format(
          'create policy %I on tosho.%I for insert with check (tosho.has_finance_access(team_id))',
          policy_name, tbl);
      elsif op = 'update' then
        execute format(
          'create policy %I on tosho.%I for update using (tosho.has_finance_access(team_id)) with check (tosho.has_finance_access(team_id))',
          policy_name, tbl);
      else
        execute format(
          'create policy %I on tosho.%I for delete using (tosho.has_finance_access(team_id))',
          policy_name, tbl);
      end if;
    end loop;
  end loop;
end $$;

-- Виплати команді: та сама таблиця, але вужчий контур (owner + SEO).
-- Джерело правди для ЦИХ політик — цей файл; scripts/finances-payout-meta-schema.sql
-- їх навмисно не створює, щоб два файли не перетирали один одного по черзі.
do $$
declare
  op text;
  policy_name text;
begin
  execute 'alter table tosho.finance_payout_meta enable row level security';
  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    policy_name := 'finance_payout_meta_' || op;
    execute format('drop policy if exists %I on tosho.finance_payout_meta', policy_name);

    if op = 'select' then
      execute format(
        'create policy %I on tosho.finance_payout_meta for select using (tosho.has_payroll_access(team_id))',
        policy_name);
    elsif op = 'insert' then
      execute format(
        'create policy %I on tosho.finance_payout_meta for insert with check (tosho.has_payroll_access(team_id))',
        policy_name);
    elsif op = 'update' then
      execute format(
        'create policy %I on tosho.finance_payout_meta for update using (tosho.has_payroll_access(team_id)) with check (tosho.has_payroll_access(team_id))',
        policy_name);
    else
      execute format(
        'create policy %I on tosho.finance_payout_meta for delete using (tosho.has_payroll_access(team_id))',
        policy_name);
    end if;
  end loop;
end $$;

-- Backfill UI module_access.finance to match the authorized roles, so the
-- sidebar + route gate are consistent with the RLS above (mirrors how `stock`
-- was backfilled for owner/seo). Non-authorized members get finance=false.
update tosho.team_member_profiles p
set module_access = jsonb_set(
  coalesce(p.module_access, '{}'::jsonb),
  '{finance}',
  to_jsonb(
    exists (
      select 1
      from tosho.memberships m
      where m.workspace_id = p.workspace_id
        and m.user_id = p.user_id
        and (
          lower(coalesce(m.role::text, '')) = 'owner'
          or lower(coalesce(m.job_role::text, '')) in ('seo', 'accountant', 'chief_accountant', 'junior_accountant')
        )
    )
  ),
  true
);

notify pgrst, 'reload schema';

commit;
