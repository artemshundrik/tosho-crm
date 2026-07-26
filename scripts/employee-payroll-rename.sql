-- Перейменування payroll-таблиць: designer_pay_* → employee_pay_*
--
-- ЧОМУ ЗАРАЗ: ставки задумані для всіх ролей (поки заповнюємо дизайнерам, далі
-- менеджери й решта). Таблиці ще ПОРОЖНІ, тож перейменування коштує нічого;
-- після першого продуктивного рядка це вже була б міграція даних.
--
-- Що лишається дизайнер-специфічним: visual_norm / over_norm_rate /
-- creative_percent — вони nullable і просто не заповнюються для інших ролей.
-- Базова ставка + робочі дні — універсальні для всіх.
--
-- Ідемпотентний: перейменовує лише якщо стара назва ще існує.

begin;

do $$
begin
  if to_regclass('tosho.designer_pay_defaults') is not null
     and to_regclass('tosho.employee_pay_defaults') is null then
    alter table tosho.designer_pay_defaults rename to employee_pay_defaults;
  end if;

  if to_regclass('tosho.designer_pay_rates') is not null
     and to_regclass('tosho.employee_pay_rates') is null then
    alter table tosho.designer_pay_rates rename to employee_pay_rates;
  end if;

  if to_regclass('tosho.designer_pay_month_close') is not null
     and to_regclass('tosho.employee_pay_month_close') is null then
    alter table tosho.designer_pay_month_close rename to employee_pay_month_close;
  end if;
end $$;

-- Політики переносяться разом із таблицею, але їхні ІМЕНА лишаються старими —
-- перестворюємо, щоб у pg_policies не було «designer_» у назвах.
drop policy if exists designer_pay_rates_select on tosho.employee_pay_rates;
drop policy if exists designer_pay_rates_write  on tosho.employee_pay_rates;
create policy employee_pay_rates_select on tosho.employee_pay_rates
  for select to authenticated
  using (tosho.is_workspace_admin(workspace_id) or user_id = auth.uid());
create policy employee_pay_rates_write on tosho.employee_pay_rates
  for all to authenticated
  using (tosho.is_workspace_admin(workspace_id))
  with check (tosho.is_workspace_admin(workspace_id));

drop policy if exists designer_pay_month_close_select on tosho.employee_pay_month_close;
drop policy if exists designer_pay_month_close_write  on tosho.employee_pay_month_close;
create policy employee_pay_month_close_select on tosho.employee_pay_month_close
  for select to authenticated
  using (tosho.is_workspace_admin(workspace_id) or user_id = auth.uid());
create policy employee_pay_month_close_write on tosho.employee_pay_month_close
  for all to authenticated
  using (tosho.is_workspace_admin(workspace_id))
  with check (tosho.is_workspace_admin(workspace_id));

drop policy if exists designer_pay_defaults_select on tosho.employee_pay_defaults;
drop policy if exists designer_pay_defaults_write  on tosho.employee_pay_defaults;
create policy employee_pay_defaults_select on tosho.employee_pay_defaults
  for select to authenticated
  using (
    tosho.is_workspace_admin(workspace_id)
    or exists (
      select 1 from tosho.employee_pay_rates r
      where r.workspace_id = employee_pay_defaults.workspace_id
        and r.user_id = auth.uid()
    )
  );
create policy employee_pay_defaults_write on tosho.employee_pay_defaults
  for all to authenticated
  using (tosho.is_workspace_admin(workspace_id))
  with check (tosho.is_workspace_admin(workspace_id));

commit;
