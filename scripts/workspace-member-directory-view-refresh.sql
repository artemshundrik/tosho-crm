-- workspace-member-directory-view-refresh.sql
-- Rebuilds the unified workspace member directory view so the frontend
-- can read manager_user_id and module_access without extra fallback queries.
-- Run in Supabase SQL Editor.

begin;

do $$
declare
  memberships_has_email boolean;
  memberships_has_full_name boolean;
  memberships_has_avatar_url boolean;
  memberships_has_access_role boolean;
  memberships_has_job_role boolean;
  email_expr text;
  full_name_expr text;
  avatar_expr text;
  access_role_expr text;
  job_role_expr text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'tosho' and table_name = 'memberships_view' and column_name = 'email'
  ) into memberships_has_email;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'tosho' and table_name = 'memberships_view' and column_name = 'full_name'
  ) into memberships_has_full_name;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'tosho' and table_name = 'memberships_view' and column_name = 'avatar_url'
  ) into memberships_has_avatar_url;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'tosho' and table_name = 'memberships_view' and column_name = 'access_role'
  ) into memberships_has_access_role;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'tosho' and table_name = 'memberships_view' and column_name = 'job_role'
  ) into memberships_has_job_role;

  email_expr := case
    when memberships_has_email then 'coalesce(nullif(trim(mv.email), ''''), nullif(trim(u.email), ''''))'
    else 'nullif(trim(u.email), '''')'
  end;

  full_name_expr := case
    when memberships_has_full_name then
      'coalesce(nullif(trim(p.full_name), ''''), nullif(trim(concat_ws('' '', p.first_name, p.last_name)), ''''), nullif(trim(mv.full_name), ''''), nullif(trim(u.raw_user_meta_data ->> ''full_name''), ''''), nullif(trim(concat_ws('' '', u.raw_user_meta_data ->> ''first_name'', u.raw_user_meta_data ->> ''last_name'')), ''''))'
    else
      'coalesce(nullif(trim(p.full_name), ''''), nullif(trim(concat_ws('' '', p.first_name, p.last_name)), ''''), nullif(trim(u.raw_user_meta_data ->> ''full_name''), ''''), nullif(trim(concat_ws('' '', u.raw_user_meta_data ->> ''first_name'', u.raw_user_meta_data ->> ''last_name'')), ''''))'
  end;

  avatar_expr := case
    when memberships_has_avatar_url then
      'coalesce(nullif(trim(p.avatar_url), ''''), nullif(trim(mv.avatar_url), ''''), nullif(trim(u.raw_user_meta_data ->> ''avatar_url''), ''''))'
    else
      'coalesce(nullif(trim(p.avatar_url), ''''), nullif(trim(u.raw_user_meta_data ->> ''avatar_url''), ''''))'
  end;

  access_role_expr := case when memberships_has_access_role then 'mv.access_role' else 'null::text' end;
  job_role_expr := case when memberships_has_job_role then 'mv.job_role' else 'null::text' end;

  execute 'drop view if exists tosho.workspace_member_directory';

  execute format($view$
    create view tosho.workspace_member_directory as
    select
      mv.workspace_id,
      mv.user_id,
      %1$s as email,
      nullif(trim(p.first_name), '') as first_name,
      nullif(trim(p.last_name), '') as last_name,
      %2$s as full_name,
      %3$s as avatar_url,
      nullif(trim(p.avatar_path), '') as avatar_path,
      %4$s as access_role,
      %5$s as job_role,
      p.birth_date,
      p.phone,
      coalesce(nullif(trim(p.availability_status), ''), 'available') as availability_status,
      p.start_date,
      p.probation_end_date,
      p.employment_status,
      p.probation_review_notified_at,
      p.probation_reviewed_at,
      p.probation_reviewed_by,
      p.probation_extension_count,
      p.manager_user_id,
      p.module_access,
      p.availability_start_date,
      p.availability_end_date
    from tosho.memberships_view mv
    left join tosho.team_member_profiles p
      on p.workspace_id = mv.workspace_id
     and p.user_id = mv.user_id
    left join auth.users u
      on u.id = mv.user_id
  $view$, email_expr, full_name_expr, avatar_expr, access_role_expr, job_role_expr);
end $$;

grant select on tosho.workspace_member_directory to authenticated;

notify pgrst, 'reload schema';

commit;
