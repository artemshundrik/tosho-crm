-- Хто виписує рахунок замовлення (REQ-322#p16, 19.10.2026).
--
-- Рахунок погоджують бухгалтер, головний бухгалтер або СЕО. Молодший бухгалтер
-- більше не вносить номер з BAS і не отримує запитів. Та сама функція пускає
-- погодження договору й СП (is_order_approver) і номери ВН та акта, тож коло
-- звужується для них разом. Дзеркало в коді — INVOICE_ISSUER_JOB_ROLES.

create or replace function tosho.is_order_invoice_issuer(_user_id uuid)
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
         or lower(coalesce(m.job_role::text, '')) in ('seo', 'accountant', 'chief_accountant')
       )
  );
$$;

revoke all on function tosho.is_order_invoice_issuer(uuid) from public;
grant execute on function tosho.is_order_invoice_issuer(uuid) to authenticated;
