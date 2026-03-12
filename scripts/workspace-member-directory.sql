-- workspace-member-directory.sql
-- Canonical workspace member profile store + unified read view.
-- Run in Supabase SQL Editor.

begin;

create table if not exists tosho.team_member_profiles (
  workspace_id uuid not null,
  user_id uuid not null,
  first_name text,
  last_name text,
  full_name text,
  birth_date date,
  phone text,
  availability_status text not null default 'available',
  start_date date,
  probation_end_date date,
  manager_user_id uuid,
  module_access jsonb not null default '{"overview": true, "orders": true, "finance": false, "design": true, "logistics": false, "catalog": false}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid,
  primary key (workspace_id, user_id)
);

alter table tosho.team_member_profiles
  add column if not exists avatar_url text,
  add column if not exists avatar_path text;

update tosho.team_member_profiles p
set
  full_name = coalesce(
    nullif(trim(p.full_name), ''),
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    p.full_name
  )
where p.full_name is null
   or trim(p.full_name) = '';

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

  if memberships_has_avatar_url then
    execute $sql$
      update tosho.team_member_profiles p
      set avatar_url = coalesce(
        nullif(trim(p.avatar_url), ''),
        nullif(trim(mv.avatar_url), ''),
        nullif(trim(u.raw_user_meta_data ->> 'avatar_url'), '')
      )
      from tosho.memberships_view mv
      join auth.users u on u.id = mv.user_id
      where mv.workspace_id = p.workspace_id
        and mv.user_id = p.user_id
        and (p.avatar_url is null or trim(p.avatar_url) = '')
    $sql$;
  else
    execute $sql$
      update tosho.team_member_profiles p
      set avatar_url = coalesce(
        nullif(trim(p.avatar_url), ''),
        nullif(trim(u.raw_user_meta_data ->> 'avatar_url'), '')
      )
      from auth.users u
      where u.id = p.user_id
        and (p.avatar_url is null or trim(p.avatar_url) = '')
    $sql$;
  end if;

  execute format($view$
    create or replace view tosho.workspace_member_directory as
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
      p.manager_user_id,
      p.module_access
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
