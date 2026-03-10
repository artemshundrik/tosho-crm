-- team-members-role-columns.sql
-- Normalizes role storage so role updates do not depend on schema-specific fallbacks.
-- Run in Supabase SQL Editor.

-- 1) Ensure all supported job roles exist in the enum (if enum exists).
do $$
begin
  if to_regtype('public.crm_job_role') is not null then
    begin
      execute 'alter type public.crm_job_role add value if not exists ''printer''';
      execute 'alter type public.crm_job_role add value if not exists ''head_of_logistics''';
      execute 'alter type public.crm_job_role add value if not exists ''head_of_production''';
      execute 'alter type public.crm_job_role add value if not exists ''packer''';
      execute 'alter type public.crm_job_role add value if not exists ''pm''';
      execute 'alter type public.crm_job_role add value if not exists ''sales_manager''';
      execute 'alter type public.crm_job_role add value if not exists ''top_manager''';
      execute 'alter type public.crm_job_role add value if not exists ''junior_sales_manager''';
      execute 'alter type public.crm_job_role add value if not exists ''office_manager''';
      execute 'alter type public.crm_job_role add value if not exists ''chief_accountant''';
      execute 'alter type public.crm_job_role add value if not exists ''marketer''';
      execute 'alter type public.crm_job_role add value if not exists ''smm''';
      execute 'alter type public.crm_job_role add value if not exists ''seo''';
    exception
      when duplicate_object then null;
    end;
  end if;
  if to_regtype('tosho.crm_job_role') is not null then
    begin
      execute 'alter type tosho.crm_job_role add value if not exists ''printer''';
      execute 'alter type tosho.crm_job_role add value if not exists ''head_of_logistics''';
      execute 'alter type tosho.crm_job_role add value if not exists ''head_of_production''';
      execute 'alter type tosho.crm_job_role add value if not exists ''packer''';
      execute 'alter type tosho.crm_job_role add value if not exists ''pm''';
      execute 'alter type tosho.crm_job_role add value if not exists ''sales_manager''';
      execute 'alter type tosho.crm_job_role add value if not exists ''top_manager''';
      execute 'alter type tosho.crm_job_role add value if not exists ''junior_sales_manager''';
      execute 'alter type tosho.crm_job_role add value if not exists ''office_manager''';
      execute 'alter type tosho.crm_job_role add value if not exists ''chief_accountant''';
      execute 'alter type tosho.crm_job_role add value if not exists ''marketer''';
      execute 'alter type tosho.crm_job_role add value if not exists ''smm''';
      execute 'alter type tosho.crm_job_role add value if not exists ''seo''';
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

commit;

begin;

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
            when 'printer' then 'printer'
            when 'head_of_logistics' then 'head_of_logistics'
            when 'head_of_production' then 'head_of_production'
            when 'designer' then 'designer'
            when 'logistics' then 'logistics'
            when 'packer' then 'packer'
            when 'pm' then 'pm'
            when 'sales_manager' then 'sales_manager'
            when 'top_manager' then 'top_manager'
            when 'junior_sales_manager' then 'junior_sales_manager'
            when 'office_manager' then 'office_manager'
            when 'accountant' then 'accountant'
            when 'chief_accountant' then 'chief_accountant'
            when 'marketer' then 'marketer'
            when 'smm' then 'smm'
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
            when 'printer' then 'printer'::%s
            when 'head_of_logistics' then 'head_of_logistics'::%s
            when 'head_of_production' then 'head_of_production'::%s
            when 'designer' then 'designer'::%s
            when 'logistics' then 'logistics'::%s
            when 'packer' then 'packer'::%s
            when 'pm' then 'pm'::%s
            when 'sales_manager' then 'sales_manager'::%s
            when 'top_manager' then 'top_manager'::%s
            when 'junior_sales_manager' then 'junior_sales_manager'::%s
            when 'office_manager' then 'office_manager'::%s
            when 'accountant' then 'accountant'::%s
            when 'chief_accountant' then 'chief_accountant'::%s
            when 'marketer' then 'marketer'::%s
            when 'smm' then 'smm'::%s
            when 'seo' then 'seo'::%s
            else null::%s
          end
          where job_role is null
        $sql$, target.schema_name, target.table_name, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type, job_role_type);
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
        'alter table %I.%I add constraint team_members_job_role_check check (job_role in (''manager'', ''printer'', ''head_of_logistics'', ''head_of_production'', ''designer'', ''logistics'', ''packer'', ''pm'', ''sales_manager'', ''top_manager'', ''junior_sales_manager'', ''office_manager'', ''accountant'', ''chief_accountant'', ''marketer'', ''smm'', ''seo'') or job_role is null)',
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
