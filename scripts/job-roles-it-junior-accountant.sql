-- Нові посади в довіднику ролей: IT-спеціаліст і Молодший бухгалтер.
-- job_role — enum tosho.crm_job_role, тож нові значення треба додати в тип
-- (ALTER TYPE ... ADD VALUE не можна в транзакції, тому окремими командами).
-- Мітки для UI — у src/lib/jobRoles.ts. Safe to run multiple times.

alter type tosho.crm_job_role add value if not exists 'it_specialist';
alter type tosho.crm_job_role add value if not exists 'junior_accountant';

notify pgrst, 'reload schema';
