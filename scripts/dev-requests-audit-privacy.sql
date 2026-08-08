-- Приватна картка запиту не має протікати через журнал аудиту.
--
-- ПРОБЛЕМА. Два гейти для тих самих даних відрізняються:
--   картка   → tosho.is_owner_or_seo()  =  role='owner'  АБО  job_role='seo'
--   аудит    → audit_log_select         =  role IN ('owner','admin')
-- Різниця — це «admin, який не SEO». Такої людини сьогодні немає (обидва
-- адміни за сумісництвом SEO), але ролі призначаються НЕЗАЛЕЖНО
-- (update_member_roles у create-workspace-invite.ts), тож конфігурація
-- admin+manager цілком звичайна й з'явиться сама собою.
--
-- ЧОМУ ЦЕ СТАЛО ВАЖЛИВО САМЕ ЗАРАЗ. До появи правки й видалення картки в
-- журнал ішов лише INSERT із порожнім `changed`, а UPDATE писав тільки статус.
-- Тепер редагування пише діф `title`/`body`, а DELETE — ПОВНИЙ знімок рядка
-- (title, body, is_private, tg_username, display_name, author_user_id).
-- Тобто механізм витоку створила саме та зміна, що додала меню картки.
--
-- РІШЕННЯ. Для entity_type='dev_request' аудит доступний рівно тому, кому
-- доступна сама картка. Решта сутностей (quotes/orders/customers/leads/...)
-- має лише командне обмеження, яке аудит і так відтворює — їх не чіпаємо.
--
-- Ідемпотентна, безпечна до повторного запуску.
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/dev-requests-audit-privacy.sql

\set ON_ERROR_STOP on

begin;

drop policy if exists audit_log_select on tosho.audit_log;
create policy audit_log_select on tosho.audit_log
  for select using (
    (
      (workspace_id is not null and exists (
        select 1 from tosho.memberships_view mv
        where mv.workspace_id = audit_log.workspace_id
          and mv.user_id = auth.uid()
          and lower(coalesce(mv.access_role::text, '')) = any (array['owner', 'admin'])
      ))
      or
      (team_id is not null and public.is_team_member(team_id) and exists (
        select 1 from tosho.memberships_view mv
        where mv.user_id = auth.uid()
          and lower(coalesce(mv.access_role::text, '')) = any (array['owner', 'admin'])
      ))
    )
    -- Додаткове звуження рівно для запитів на доробку: журнал не має бути
    -- ширшим за саму сутність.
    and (entity_type is distinct from 'dev_request' or tosho.is_owner_or_seo())
  );

commit;

notify pgrst, 'reload schema';
