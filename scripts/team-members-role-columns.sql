-- team-members-role-columns.sql
-- Normalizes role storage so role updates do not depend on schema-specific fallbacks.
-- Run in Supabase SQL Editor.

begin;

-- 1) Ensure SEO exists in job role enum (if enum exists).
do $$
begin
  if to_regtype('public.crm_job_role') is not null then
    begin
      execute 'alter type public.crm_job_role add value if not exists ''seo''';
    exception
      when duplicate_object then null;
    end;
  end if;
  if to_regtype('tosho.crm_job_role') is not null then
    begin
      execute 'alter type tosho.crm_job_role add value if not exists ''seo''';
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

-- 2) Add normalized access/job role columns to team_members (public/tosho if present),
--    and backfill values from legacy role.
do $$
declare
  target record;
  access_role_type text;
  job_role_type text;
begin
  access_role_type := coalesce(
    nullif(to_regtype('public.crm_access_role')::text, ''),
    nullif(to_regtype('tosho.crm_access_role')::text, ''),
    'text'
  );
  job_role_type := coalesce(
    nullif(to_regtype('public.crm_job_role')::text, ''),
    nullif(to_regtype('tosho.crm_job_role')::text, ''),
    'text'
  );

  for target in
    select * from (
      values
        ('public', 'team_members'),
        ('tosho', 'team_members')
    ) as x(schema_name, table_name)
  loop
    if to_regclass(format('%I.%I', target.schema_name, target.table_name)) is null then
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = target.schema_name
        and table_name = target.table_name
        and column_name = 'access_role'
    ) then
      execute format(
        'alter table %I.%I add column access_role %s',
        target.schema_name, target.table_name, access_role_type
      );
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = target.schema_name
        and table_name = target.table_name
        and column_name = 'job_role'
    ) then
      execute format(
        'alter table %I.%I add column job_role %s',
        target.schema_name, target.table_name, job_role_type
      );
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = target.schema_name
        and table_name = target.table_name
        and column_name = 'role'
    ) then
      if access_role_type = 'text' then
        execute format($sql$
          update %I.%I
          set access_role = case lower(role::text)
            when 'owner' then 'owner'
            when 'admin' then 'admin'
            else null
          end
          where access_role is null
        $sql$, target.schema_name, target.table_name);
      else
        execute format($sql$
          update %I.%I
          set access_role = case lower(role::text)
            when 'owner' then 'owner'::%s
            when 'admin' then 'admin'::%s
            else null::%s
          end
          where access_role is null
        $sql$, target.schema_name, target.table_name, access_role_type, access_role_type, access_role_type);
      end if;

      if job_role_type = 'text' then
        execute format($sql$
          update %I.%I
          set job_role = case lower(role::text)
            when 'manager' then 'manager'
            when 'designer' then 'designer'
            when 'logistics' then 'logistics'
            when 'accountant' then 'accountant'
            when 'seo' then 'seo'
            else null
          end
          where job_role is null
        $sql$, target.schema_name, target.table_name);
      else
        execute format($sql$
          update %I.%I
          set job_role = case lower(role::text)
            when 'manager' then 'manager'::%s
            when 'designer' then 'designer'::%s
            when 'logistics' then 'logistics'::%s
            when 'accountant' then 'accountant'::%s
            when 'seo' then 'seo'::%s
            else null::%s
          end
          where job_role is null
        $sql$, target.schema_name, target.table_name, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type);
      end if;
    end if;

    -- If enum types are absent and we use text columns, enforce allowed values with checks.
    if access_role_type = 'text' then
      execute format(
        'alter table %I.%I drop constraint if exists team_members_access_role_check',
        target.schema_name, target.table_name
      );
      execute format(
        'alter table %I.%I add constraint team_members_access_role_check check (access_role in (''owner'', ''admin'') or access_role is null)',
        target.schema_name, target.table_name
      );
    end if;

    if job_role_type = 'text' then
      execute format(
        'alter table %I.%I drop constraint if exists team_members_job_role_check',
        target.schema_name, target.table_name
      );
      execute format(
        'alter table %I.%I add constraint team_members_job_role_check check (job_role in (''manager'', ''designer'', ''logistics'', ''accountant'', ''seo'') or job_role is null)',
        target.schema_name, target.table_name
      );
    end if;
  end loop;
end $$;

-- 3) Helpful indexes (if table exists).
do $$
begin
  if to_regclass('public.team_members') is not null then
    execute 'create index if not exists team_members_team_user_idx on public.team_members(team_id, user_id)';
    execute 'create index if not exists team_members_team_access_role_idx on public.team_members(team_id, access_role)';
    execute 'create index if not exists team_members_team_job_role_idx on public.team_members(team_id, job_role)';
  end if;
end $$;

-- 4) Refresh PostgREST schema cache.
notify pgrst, 'reload schema';

commit;
