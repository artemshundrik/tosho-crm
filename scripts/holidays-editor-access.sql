-- =====================================================================
-- Керування календарем свят: право писати — owner і SEO.
--
-- Було: політика `ua_workday_exceptions_write` пускала `is_workspace_admin`
-- (owner/admin), а SEO — ні. При цьому квотами відсутностей SEO керує
-- (team_absence_quotas), заявки вирішує теж SEO. Календар свят — та сама
-- HR-поверхня, тож розходження було випадковим, а не задуманим: редактор
-- свят у CRM для SEO мовчки падав би на RLS.
--
-- Застосування: psql "$BACKUP_DB_URL" -v ON_ERROR_STOP=1 -f scripts/holidays-editor-access.sql
-- =====================================================================

begin;

drop policy if exists "ua_workday_exceptions_write" on tosho.ua_workday_exceptions;
create policy "ua_workday_exceptions_write"
on tosho.ua_workday_exceptions
for all
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = ua_workday_exceptions.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) in ('owner', 'admin')
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
)
with check (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = ua_workday_exceptions.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) in ('owner', 'admin')
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

commit;
