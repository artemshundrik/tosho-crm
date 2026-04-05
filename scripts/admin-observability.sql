create schema if not exists tosho;

create table if not exists tosho.admin_observability_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  captured_at timestamptz not null default timezone('utc', now()),
  captured_for_date date not null,
  captured_by uuid null,
  database_size_bytes bigint not null default 0,
  attachments_bucket_bytes bigint not null default 0,
  avatars_bucket_bytes bigint not null default 0,
  storage_today_bytes bigint not null default 0,
  storage_today_objects integer not null default 0,
  quote_attachments_today integer not null default 0,
  design_tasks_today integer not null default 0,
  design_task_attachments_today integer not null default 0,
  design_output_selection_today integer not null default 0,
  attachment_possible_orphan_original_count integer not null default 0,
  attachment_possible_orphan_original_bytes bigint not null default 0,
  attachment_missing_variants_count integer not null default 0,
  attachment_safe_reclaimable_count integer not null default 0,
  attachment_safe_reclaimable_bytes bigint not null default 0,
  database_stats jsonb not null default '{}'::jsonb,
  top_tables jsonb not null default '[]'::jsonb,
  dead_tuple_tables jsonb not null default '[]'::jsonb,
  bucket_sizes jsonb not null default '[]'::jsonb,
  storage_today_breakdown jsonb not null default '[]'::jsonb,
  attachment_orphan_top_folders jsonb not null default '[]'::jsonb,
  attachment_orphan_by_extension jsonb not null default '[]'::jsonb,
  top_activity_log_queries jsonb not null default '[]'::jsonb,
  top_quote_attachment_queries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (team_id, captured_for_date)
);

create index if not exists admin_observability_snapshots_team_captured_idx
  on tosho.admin_observability_snapshots (team_id, captured_for_date desc);

alter table tosho.admin_observability_snapshots
  add column if not exists attachment_possible_orphan_original_count integer not null default 0,
  add column if not exists attachment_possible_orphan_original_bytes bigint not null default 0,
  add column if not exists attachment_missing_variants_count integer not null default 0,
  add column if not exists attachment_safe_reclaimable_count integer not null default 0,
  add column if not exists attachment_safe_reclaimable_bytes bigint not null default 0,
  add column if not exists attachment_orphan_top_folders jsonb not null default '[]'::jsonb,
  add column if not exists attachment_orphan_by_extension jsonb not null default '[]'::jsonb;

alter table tosho.admin_observability_snapshots enable row level security;

drop policy if exists admin_observability_snapshots_select on tosho.admin_observability_snapshots;
create policy admin_observability_snapshots_select
  on tosho.admin_observability_snapshots
  for select
  using (
    exists (
      select 1
      from tosho.memberships_view mv
      where mv.workspace_id = admin_observability_snapshots.team_id
        and mv.user_id = auth.uid()
        and mv.access_role::text in ('owner', 'admin')
    )
  );

create or replace function tosho.capture_admin_observability_snapshot(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = tosho, public, extensions
set statement_timeout = '60s'
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  effective_team_id uuid;
  stats_record record;
  db_size_bytes bigint := 0;
  attachments_bytes bigint := 0;
  avatars_bytes bigint := 0;
  storage_today_bytes_value bigint := 0;
  storage_today_objects_value integer := 0;
  quote_attachments_today_value integer := 0;
  design_tasks_today_value integer := 0;
  design_task_attachments_today_value integer := 0;
  design_output_selection_today_value integer := 0;
  attachment_possible_orphan_original_count_value integer := 0;
  attachment_possible_orphan_original_bytes_value bigint := 0;
  attachment_missing_variants_count_value integer := 0;
  attachment_safe_reclaimable_count_value integer := 0;
  attachment_safe_reclaimable_bytes_value bigint := 0;
  top_tables_json jsonb := '[]'::jsonb;
  dead_tuple_tables_json jsonb := '[]'::jsonb;
  bucket_sizes_json jsonb := '[]'::jsonb;
  storage_today_breakdown_json jsonb := '[]'::jsonb;
  attachment_orphan_top_folders_json jsonb := '[]'::jsonb;
  attachment_orphan_by_extension_json jsonb := '[]'::jsonb;
  top_activity_log_queries_json jsonb := '[]'::jsonb;
  top_quote_attachment_queries_json jsonb := '[]'::jsonb;
  snapshot_row tosho.admin_observability_snapshots;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select mv.access_role
  into actor_role
  from tosho.memberships_view mv
  where mv.workspace_id = p_team_id
    and mv.user_id = actor_id
  limit 1;

  if coalesce(actor_role, '') not in ('owner', 'admin') then
    raise exception 'Only workspace owners or admins can capture observability snapshots';
  end if;

  select tm.team_id
  into effective_team_id
  from public.team_members tm
  join tosho.memberships_view mv on mv.user_id = tm.user_id
  where mv.workspace_id = p_team_id
  limit 1;

  if effective_team_id is null then
    effective_team_id := p_team_id;
  end if;

  select pg_database_size(current_database()) into db_size_bytes;

  select
    numbackends,
    xact_commit,
    xact_rollback,
    blks_read,
    blks_hit,
    tup_returned,
    tup_fetched,
    tup_inserted,
    tup_updated,
    tup_deleted,
    conflicts,
    temp_files,
    temp_bytes,
    deadlocks
  into stats_record
  from pg_stat_database
  where datname = current_database();

  select coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0)
  into attachments_bytes
  from storage.objects o
  where o.bucket_id = 'attachments';

  select coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0)
  into avatars_bytes
  from storage.objects o
  where o.bucket_id = 'avatars';

  select
    coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0),
    count(*)
  into storage_today_bytes_value, storage_today_objects_value
  from storage.objects o
  where o.created_at >= current_date
    and o.created_at < current_date + interval '1 day';

  select coalesce(jsonb_agg(row_to_json(bucket_row) order by bucket_row.bytes desc), '[]'::jsonb)
  into bucket_sizes_json
  from (
    select
      o.bucket_id,
      coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0) as bytes,
      count(*)::integer as object_count
    from storage.objects o
    group by o.bucket_id
  ) as bucket_row;

  select coalesce(jsonb_agg(row_to_json(day_row) order by day_row.bytes desc), '[]'::jsonb)
  into storage_today_breakdown_json
  from (
    select
      o.bucket_id,
      coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0) as bytes,
      count(*)::integer as object_count
    from storage.objects o
    where o.created_at >= current_date
      and o.created_at < current_date + interval '1 day'
    group by o.bucket_id
  ) as day_row;

  select count(*)::integer
  into quote_attachments_today_value
  from tosho.quote_attachments qa
  where qa.team_id = effective_team_id
    and qa.created_at >= current_date
    and qa.created_at < current_date + interval '1 day';

  select count(*)::integer
  into design_tasks_today_value
  from public.activity_log al
  where al.team_id = effective_team_id
    and al.action = 'design_task_created'
    and al.created_at >= current_date
    and al.created_at < current_date + interval '1 day';

  select count(*)::integer
  into design_task_attachments_today_value
  from public.activity_log al
  where al.team_id = effective_team_id
    and al.action = 'design_task_attachment_added'
    and al.created_at >= current_date
    and al.created_at < current_date + interval '1 day';

  select count(*)::integer
  into design_output_selection_today_value
  from public.activity_log al
  where al.team_id = effective_team_id
    and al.action = 'design_output_selection_updated'
    and al.created_at >= current_date
    and al.created_at < current_date + interval '1 day';

  with referenced_from_quotes as (
    select
      case
        when qa.storage_path like 'teams/%' then qa.storage_path
        when qa.storage_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then 'teams/' || qa.storage_path
        else qa.storage_path
      end as storage_path,
      qa.file_name,
      qa.mime_type
    from tosho.quote_attachments qa
    where qa.storage_bucket = 'attachments'
      and qa.team_id = effective_team_id
      and qa.storage_path is not null
      and lower(qa.storage_path) not like '%__thumb.%'
      and lower(qa.storage_path) not like '%__preview.%'
  ),
  referenced_from_activity_array as (
    select
      case
        when elem->>'storage_path' like 'teams/%' then elem->>'storage_path'
        when elem->>'storage_path' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then 'teams/' || (elem->>'storage_path')
        else elem->>'storage_path'
      end as storage_path,
      elem->>'file_name' as file_name,
      elem->>'mime_type' as mime_type
    from public.activity_log al
    cross join lateral jsonb_array_elements(
      coalesce(al.metadata->'standalone_brief_files', '[]'::jsonb) ||
      coalesce(al.metadata->'design_output_files', '[]'::jsonb)
    ) as elem
    where al.team_id = effective_team_id
      and al.action = 'design_task'
      and coalesce(elem->>'storage_bucket', '') = 'attachments'
  ),
  referenced_from_activity_selected as (
    select
      case
        when storage_path like 'teams/%' then storage_path
        when storage_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then 'teams/' || storage_path
        else storage_path
      end as storage_path,
      file_name,
      mime_type
    from (
      select
        al.metadata->>'selected_design_output_storage_path' as storage_path,
        al.metadata->>'selected_design_output_file_name' as file_name,
        al.metadata->>'selected_design_output_mime_type' as mime_type,
        al.metadata->>'selected_design_output_storage_bucket' as storage_bucket
      from public.activity_log al
      where al.team_id = effective_team_id
        and al.action = 'design_task'
      union all
      select
        al.metadata->>'selected_visual_output_storage_path',
        al.metadata->>'selected_visual_output_file_name',
        al.metadata->>'selected_visual_output_mime_type',
        al.metadata->>'selected_visual_output_storage_bucket'
      from public.activity_log al
      where al.team_id = effective_team_id
        and al.action = 'design_task'
      union all
      select
        al.metadata->>'selected_layout_output_storage_path',
        al.metadata->>'selected_layout_output_file_name',
        al.metadata->>'selected_layout_output_mime_type',
        al.metadata->>'selected_layout_output_storage_bucket'
      from public.activity_log al
      where al.team_id = effective_team_id
        and al.action = 'design_task'
    ) selected_refs
    where coalesce(storage_bucket, '') = 'attachments'
      and coalesce(storage_path, '') <> ''
  ),
  referenced_originals as (
    select distinct storage_path, file_name, mime_type
    from (
      select * from referenced_from_quotes
      union all
      select * from referenced_from_activity_array
      union all
      select * from referenced_from_activity_selected
    ) refs
    where coalesce(storage_path, '') <> ''
  ),
  previewable_originals as (
    select distinct storage_path
    from referenced_originals
    where
      lower(storage_path) ~ '\.(pdf|tif|tiff|png|jpg|jpeg|webp|gif|bmp)$'
      or lower(coalesce(file_name, '')) ~ '\.(pdf|tif|tiff|png|jpg|jpeg|webp|gif|bmp)$'
      or lower(coalesce(mime_type, '')) in (
        'application/pdf',
        'image/tiff',
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif',
        'image/bmp'
      )
  ),
  attachment_objects as (
    select
      o.name,
      coalesce((o.metadata->>'size')::bigint, 0) as size_bytes
    from storage.objects o
    where o.bucket_id = 'attachments'
      and o.name like 'teams/' || effective_team_id::text || '/%'
  ),
  orphan_originals as (
    select
      ao.name,
      ao.size_bytes,
      case
        when regexp_replace(ao.name, '^teams/[^/]+/', '') = '' then '(root)'
        else split_part(regexp_replace(ao.name, '^teams/[^/]+/', ''), '/', 1) ||
          case
            when split_part(regexp_replace(ao.name, '^teams/[^/]+/', ''), '/', 2) <> '' then '/' || split_part(regexp_replace(ao.name, '^teams/[^/]+/', ''), '/', 2)
            else ''
          end
      end as top_folder,
      coalesce(nullif(lower(substring(ao.name from '\.([^.]+)$')), ''), '(no-ext)') as extension
    from attachment_objects ao
    where lower(ao.name) not like '%__thumb.%'
      and lower(ao.name) not like '%__preview.%'
      and not exists (
        select 1
        from referenced_originals ro
        where ro.storage_path = ao.name
      )
  ),
  expected_derivatives as (
    select regexp_replace(po.storage_path, '(\.[^.]+)?$', '') || '__thumb.webp' as path from previewable_originals po
    union all
    select regexp_replace(po.storage_path, '(\.[^.]+)?$', '') || '__thumb.png' as path from previewable_originals po
    union all
    select regexp_replace(po.storage_path, '(\.[^.]+)?$', '') || '__preview.webp' as path from previewable_originals po
    union all
    select regexp_replace(po.storage_path, '(\.[^.]+)?$', '') || '__preview.png' as path from previewable_originals po
  ),
  orphan_derivatives as (
    select ao.name, ao.size_bytes
    from attachment_objects ao
    where (lower(ao.name) like '%__thumb.%' or lower(ao.name) like '%__preview.%')
      and not exists (
        select 1
        from expected_derivatives ed
        where ed.path = ao.name
      )
  ),
  missing_variants as (
    select po.storage_path, variant_name.variant
    from previewable_originals po
    cross join (values ('thumb'), ('preview')) as variant_name(variant)
    where not exists (
      select 1
      from attachment_objects ao
      where ao.name in (
        regexp_replace(po.storage_path, '(\.[^.]+)?$', '') || '__' || variant_name.variant || '.webp',
        regexp_replace(po.storage_path, '(\.[^.]+)?$', '') || '__' || variant_name.variant || '.png'
      )
    )
  )
  select
    (select count(*)::integer from orphan_originals),
    (select coalesce(sum(size_bytes), 0) from orphan_originals),
    (select count(*)::integer from orphan_derivatives),
    (select coalesce(sum(size_bytes), 0) from orphan_derivatives),
    (select count(*)::integer from missing_variants),
    (
      select coalesce(jsonb_agg(row_to_json(folder_row) order by folder_row.bytes desc), '[]'::jsonb)
      from (
        select
          top_folder as key,
          count(*)::integer as count,
          coalesce(sum(size_bytes), 0) as bytes
        from orphan_originals
        group by top_folder
        order by sum(size_bytes) desc
        limit 10
      ) as folder_row
    ),
    (
      select coalesce(jsonb_agg(row_to_json(extension_row) order by extension_row.bytes desc), '[]'::jsonb)
      from (
        select
          extension as key,
          count(*)::integer as count,
          coalesce(sum(size_bytes), 0) as bytes
        from orphan_originals
        group by extension
        order by sum(size_bytes) desc
        limit 10
      ) as extension_row
    )
  into
    attachment_possible_orphan_original_count_value,
    attachment_possible_orphan_original_bytes_value,
    attachment_safe_reclaimable_count_value,
    attachment_safe_reclaimable_bytes_value,
    attachment_missing_variants_count_value,
    attachment_orphan_top_folders_json,
    attachment_orphan_by_extension_json;

  select coalesce(jsonb_agg(row_to_json(size_row) order by size_row.total_bytes desc), '[]'::jsonb)
  into top_tables_json
  from (
    select
      ns.nspname as schema_name,
      cls.relname as table_name,
      pg_total_relation_size(cls.oid) as total_bytes,
      pg_size_pretty(pg_total_relation_size(cls.oid)) as pretty_size,
      stat.n_live_tup::bigint as live_rows
    from pg_class cls
    join pg_namespace ns on ns.oid = cls.relnamespace
    left join pg_stat_user_tables stat on stat.relid = cls.oid
    where cls.relkind = 'r'
      and ns.nspname not in ('pg_catalog', 'information_schema')
    order by pg_total_relation_size(cls.oid) desc
    limit 8
  ) as size_row;

  select coalesce(jsonb_agg(row_to_json(dead_row) order by dead_row.dead_rows desc), '[]'::jsonb)
  into dead_tuple_tables_json
  from (
    select
      stat.schemaname as schema_name,
      stat.relname as table_name,
      stat.n_live_tup::bigint as live_rows,
      stat.n_dead_tup::bigint as dead_rows,
      case
        when coalesce(stat.n_live_tup, 0) + coalesce(stat.n_dead_tup, 0) = 0 then 0
        else round((stat.n_dead_tup::numeric / (stat.n_live_tup + stat.n_dead_tup)::numeric) * 100, 2)
      end as dead_ratio
    from pg_stat_user_tables stat
    order by stat.n_dead_tup desc
    limit 8
  ) as dead_row;

  if exists (select 1 from pg_extension where extname = 'pg_stat_statements') then
    select coalesce(jsonb_agg(row_to_json(query_row) order by query_row.total_exec_time_ms desc), '[]'::jsonb)
    into top_activity_log_queries_json
    from (
      select
        left(regexp_replace(query, '\s+', ' ', 'g'), 180) as query_text,
        calls::bigint as calls,
        round(total_exec_time::numeric, 2) as total_exec_time_ms,
        round(mean_exec_time::numeric, 2) as mean_exec_time_ms
      from pg_stat_statements
      where lower(query) like '%activity_log%'
      order by total_exec_time desc
      limit 6
    ) as query_row;

    select coalesce(jsonb_agg(row_to_json(query_row) order by query_row.total_exec_time_ms desc), '[]'::jsonb)
    into top_quote_attachment_queries_json
    from (
      select
        left(regexp_replace(query, '\s+', ' ', 'g'), 180) as query_text,
        calls::bigint as calls,
        round(total_exec_time::numeric, 2) as total_exec_time_ms,
        round(mean_exec_time::numeric, 2) as mean_exec_time_ms
      from pg_stat_statements
      where lower(query) like '%quote_attachments%'
      order by total_exec_time desc
      limit 6
    ) as query_row;
  end if;

  insert into tosho.admin_observability_snapshots (
    team_id,
    captured_at,
    captured_for_date,
    captured_by,
    database_size_bytes,
    attachments_bucket_bytes,
    avatars_bucket_bytes,
    storage_today_bytes,
    storage_today_objects,
    quote_attachments_today,
    design_tasks_today,
    design_task_attachments_today,
    design_output_selection_today,
    attachment_possible_orphan_original_count,
    attachment_possible_orphan_original_bytes,
    attachment_missing_variants_count,
    attachment_safe_reclaimable_count,
    attachment_safe_reclaimable_bytes,
    database_stats,
    top_tables,
    dead_tuple_tables,
    bucket_sizes,
    storage_today_breakdown,
    attachment_orphan_top_folders,
    attachment_orphan_by_extension,
    top_activity_log_queries,
    top_quote_attachment_queries,
    updated_at
  ) values (
    p_team_id,
    timezone('utc', now()),
    current_date,
    actor_id,
    coalesce(db_size_bytes, 0),
    coalesce(attachments_bytes, 0),
    coalesce(avatars_bytes, 0),
    coalesce(storage_today_bytes_value, 0),
    coalesce(storage_today_objects_value, 0),
    coalesce(quote_attachments_today_value, 0),
    coalesce(design_tasks_today_value, 0),
    coalesce(design_task_attachments_today_value, 0),
    coalesce(design_output_selection_today_value, 0),
    coalesce(attachment_possible_orphan_original_count_value, 0),
    coalesce(attachment_possible_orphan_original_bytes_value, 0),
    coalesce(attachment_missing_variants_count_value, 0),
    coalesce(attachment_safe_reclaimable_count_value, 0),
    coalesce(attachment_safe_reclaimable_bytes_value, 0),
    jsonb_build_object(
      'numbackends', coalesce(stats_record.numbackends, 0),
      'xact_commit', coalesce(stats_record.xact_commit, 0),
      'xact_rollback', coalesce(stats_record.xact_rollback, 0),
      'blks_read', coalesce(stats_record.blks_read, 0),
      'blks_hit', coalesce(stats_record.blks_hit, 0),
      'tup_returned', coalesce(stats_record.tup_returned, 0),
      'tup_fetched', coalesce(stats_record.tup_fetched, 0),
      'tup_inserted', coalesce(stats_record.tup_inserted, 0),
      'tup_updated', coalesce(stats_record.tup_updated, 0),
      'tup_deleted', coalesce(stats_record.tup_deleted, 0),
      'conflicts', coalesce(stats_record.conflicts, 0),
      'temp_files', coalesce(stats_record.temp_files, 0),
      'temp_bytes', coalesce(stats_record.temp_bytes, 0),
      'deadlocks', coalesce(stats_record.deadlocks, 0)
    ),
    top_tables_json,
    dead_tuple_tables_json,
    bucket_sizes_json,
    storage_today_breakdown_json,
    attachment_orphan_top_folders_json,
    attachment_orphan_by_extension_json,
    top_activity_log_queries_json,
    top_quote_attachment_queries_json,
    timezone('utc', now())
  )
  on conflict (team_id, captured_for_date)
  do update set
    captured_at = excluded.captured_at,
    captured_by = excluded.captured_by,
    database_size_bytes = excluded.database_size_bytes,
    attachments_bucket_bytes = excluded.attachments_bucket_bytes,
    avatars_bucket_bytes = excluded.avatars_bucket_bytes,
    storage_today_bytes = excluded.storage_today_bytes,
    storage_today_objects = excluded.storage_today_objects,
    quote_attachments_today = excluded.quote_attachments_today,
    design_tasks_today = excluded.design_tasks_today,
    design_task_attachments_today = excluded.design_task_attachments_today,
    design_output_selection_today = excluded.design_output_selection_today,
    attachment_possible_orphan_original_count = excluded.attachment_possible_orphan_original_count,
    attachment_possible_orphan_original_bytes = excluded.attachment_possible_orphan_original_bytes,
    attachment_missing_variants_count = excluded.attachment_missing_variants_count,
    attachment_safe_reclaimable_count = excluded.attachment_safe_reclaimable_count,
    attachment_safe_reclaimable_bytes = excluded.attachment_safe_reclaimable_bytes,
    database_stats = excluded.database_stats,
    top_tables = excluded.top_tables,
    dead_tuple_tables = excluded.dead_tuple_tables,
    bucket_sizes = excluded.bucket_sizes,
    storage_today_breakdown = excluded.storage_today_breakdown,
    attachment_orphan_top_folders = excluded.attachment_orphan_top_folders,
    attachment_orphan_by_extension = excluded.attachment_orphan_by_extension,
    top_activity_log_queries = excluded.top_activity_log_queries,
    top_quote_attachment_queries = excluded.top_quote_attachment_queries,
    updated_at = timezone('utc', now())
  returning * into snapshot_row;

  return jsonb_build_object(
    'id', snapshot_row.id,
    'team_id', snapshot_row.team_id,
    'captured_for_date', snapshot_row.captured_for_date,
    'captured_at', snapshot_row.captured_at
  );
end;
$$;

grant select on tosho.admin_observability_snapshots to authenticated;
grant execute on function tosho.capture_admin_observability_snapshot(uuid) to authenticated;

create or replace function tosho.get_admin_attachment_audit(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = tosho, public, extensions
set statement_timeout = '60s'
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  effective_team_id uuid;
  rows_json jsonb := '[]'::jsonb;
  total_bytes_value bigint := 0;
  total_count_value integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select mv.access_role
  into actor_role
  from tosho.memberships_view mv
  where mv.workspace_id = p_workspace_id
    and mv.user_id = actor_id
  limit 1;

  if coalesce(actor_role, '') not in ('owner', 'admin') then
    raise exception 'Only workspace owners or admins can view attachment audit';
  end if;

  select tm.team_id
  into effective_team_id
  from public.team_members tm
  join tosho.memberships_view mv on mv.user_id = tm.user_id
  where mv.workspace_id = p_workspace_id
  limit 1;

  if effective_team_id is null then
    effective_team_id := p_workspace_id;
  end if;

  with referenced_from_quotes as (
    select distinct
      case
        when qa.storage_path like 'teams/%' then qa.storage_path
        when qa.storage_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then 'teams/' || qa.storage_path
        else qa.storage_path
      end as storage_path
    from tosho.quote_attachments qa
    where qa.storage_bucket = 'attachments'
      and qa.team_id = effective_team_id
      and qa.storage_path is not null
      and lower(qa.storage_path) not like '%__thumb.%'
      and lower(qa.storage_path) not like '%__preview.%'
  ),
  referenced_from_activity_array as (
    select distinct
      case
        when elem->>'storage_path' like 'teams/%' then elem->>'storage_path'
        when elem->>'storage_path' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then 'teams/' || (elem->>'storage_path')
        else elem->>'storage_path'
      end as storage_path
    from public.activity_log al
    cross join lateral jsonb_array_elements(
      coalesce(al.metadata->'standalone_brief_files', '[]'::jsonb) ||
      coalesce(al.metadata->'design_output_files', '[]'::jsonb)
    ) as elem
    where al.team_id = effective_team_id
      and al.action = 'design_task'
      and coalesce(elem->>'storage_bucket', '') = 'attachments'
      and coalesce(elem->>'storage_path', '') <> ''
  ),
  referenced_from_activity_selected as (
    select distinct
      case
        when storage_path like 'teams/%' then storage_path
        when storage_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then 'teams/' || storage_path
        else storage_path
      end as storage_path
    from (
      select
        al.metadata->>'selected_design_output_storage_path' as storage_path,
        al.metadata->>'selected_design_output_file_name' as file_name,
        al.metadata->>'selected_design_output_mime_type' as mime_type,
        al.metadata->>'selected_design_output_storage_bucket' as storage_bucket
      from public.activity_log al
      where al.team_id = effective_team_id
        and al.action = 'design_task'
      union all
      select
        al.metadata->>'selected_visual_output_storage_path',
        al.metadata->>'selected_visual_output_file_name',
        al.metadata->>'selected_visual_output_mime_type',
        al.metadata->>'selected_visual_output_storage_bucket'
      from public.activity_log al
      where al.team_id = effective_team_id
        and al.action = 'design_task'
      union all
      select
        al.metadata->>'selected_layout_output_storage_path',
        al.metadata->>'selected_layout_output_file_name',
        al.metadata->>'selected_layout_output_mime_type',
        al.metadata->>'selected_layout_output_storage_bucket'
      from public.activity_log al
      where al.team_id = effective_team_id
        and al.action = 'design_task'
    ) s
    where coalesce(storage_bucket, '') = 'attachments'
      and coalesce(storage_path, '') <> ''
  ),
  referenced_originals as (
    select distinct storage_path
    from (
      select storage_path from referenced_from_quotes
      union all
      select storage_path from referenced_from_activity_array
      union all
      select storage_path from referenced_from_activity_selected
    ) refs
    where coalesce(storage_path, '') <> ''
  ),
  attachment_objects as (
    select
      o.name,
      coalesce((o.metadata->>'size')::bigint, 0) as size_bytes,
      o.created_at
    from storage.objects o
    where o.bucket_id = 'attachments'
      and o.name like 'teams/' || effective_team_id::text || '/%'
      and lower(o.name) not like '%__thumb.%'
      and lower(o.name) not like '%__preview.%'
  ),
  orphan_originals as (
    select
      ao.name as path,
      ao.size_bytes,
      ao.created_at,
      regexp_replace(ao.name, '^.*/', '') as file_name,
      nullif(lower(substring(ao.name from '\.([^.]+)$')), '') as extension,
      (lower(ao.name) ~ '\.(pdf|tif|tiff|png|jpg|jpeg|webp|gif|bmp)$') as previewable,
      case
        when split_part(regexp_replace(ao.name, '^teams/[^/]+/', ''), '/', 1) = 'quote-attachments' then 'quote'
        when split_part(regexp_replace(ao.name, '^teams/[^/]+/', ''), '/', 1) in ('design-briefs', 'design-brief-files', 'design-outputs') then 'design_task'
        else 'unknown'
      end as entity_kind,
      case
        when split_part(regexp_replace(ao.name, '^teams/[^/]+/', ''), '/', 1) = 'quote-attachments'
          then nullif(split_part(regexp_replace(ao.name, '^teams/[^/]+/', ''), '/', 2), '')
        when split_part(regexp_replace(ao.name, '^teams/[^/]+/', ''), '/', 1) in ('design-briefs', 'design-brief-files', 'design-outputs')
          then nullif(regexp_replace(split_part(regexp_replace(ao.name, '^teams/[^/]+/', ''), '/', 2), '^standalone-', ''), '')
        else null
      end as entity_id
    from attachment_objects ao
    where not exists (
      select 1
      from referenced_originals ro
      where ro.storage_path = ao.name
    )
  ),
  orphan_with_status as (
    select
      oo.*,
      case
        when oo.entity_kind = 'quote' then exists (
          select 1 from tosho.quotes q where q.id::text = oo.entity_id and q.team_id = effective_team_id
        )
        when oo.entity_kind = 'design_task' then exists (
          select 1 from public.activity_log al where al.id::text = oo.entity_id and al.team_id = effective_team_id and al.action = 'design_task'
        )
        else false
      end as entity_exists,
      case
        when oo.entity_kind = 'quote' and oo.entity_id is not null then '/orders/estimates/' || oo.entity_id
        when oo.entity_kind = 'design_task' and oo.entity_id is not null then '/design/' || oo.entity_id
        else null
      end as route,
      case
        when oo.entity_kind = 'design_task' then coalesce(dt.metadata->>'design_task_number', dt.id::text)
        when oo.entity_kind = 'quote' then coalesce(q.number, q.id::text)
        else null
      end as entity_label,
      case
        when oo.entity_kind = 'design_task' then dt.title
        when oo.entity_kind = 'quote' then q.title
        else null
      end as entity_title,
      case
        when oo.entity_kind = 'design_task' then coalesce(dt.metadata->>'customer_name', null)
        when oo.entity_kind = 'quote' then q.customer_name
        else null
      end as customer_name,
      case
        when oo.entity_kind = 'design_task' then coalesce(dt.metadata->>'manager_label', null)
        else null
      end as manager_label,
      case
        when oo.entity_kind = 'design_task' then coalesce(dt.metadata->>'assignee_label', null)
        else null
      end as assignee_label,
      case
        when oo.entity_kind = 'unknown' then 'Тип джерела не розпізнано.'
        when (
          case
            when oo.entity_kind = 'quote' then exists (
              select 1 from tosho.quotes q where q.id::text = oo.entity_id and q.team_id = effective_team_id
            )
            when oo.entity_kind = 'design_task' then exists (
              select 1 from public.activity_log al where al.id::text = oo.entity_id and al.team_id = effective_team_id and al.action = 'design_task'
            )
            else false
          end
        ) then 'Сутність ще існує. Потрібна ручна перевірка.'
        else 'Сутність не знайдена. Кандидат на видалення після перевірки.'
      end as hint
    from orphan_originals oo
    left join public.activity_log dt
      on oo.entity_kind = 'design_task'
     and dt.id::text = oo.entity_id
     and dt.team_id = effective_team_id
     and dt.action = 'design_task'
    left join tosho.quotes q
      on oo.entity_kind = 'quote'
     and q.id::text = oo.entity_id
     and q.team_id = effective_team_id
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'path', ows.path,
        'sizeBytes', ows.size_bytes,
        'createdAt', ows.created_at,
        'fileName', ows.file_name,
        'extension', ows.extension,
        'previewable', ows.previewable,
        'entityKind', ows.entity_kind,
        'entityId', ows.entity_id,
        'entityExists', ows.entity_exists,
        'route', ows.route,
        'entityLabel', ows.entity_label,
        'entityTitle', ows.entity_title,
        'customerName', ows.customer_name,
        'managerLabel', ows.manager_label,
        'assigneeLabel', ows.assignee_label,
        'hint', ows.hint
      )
      order by ows.size_bytes desc
    ), '[]'::jsonb),
    coalesce(sum(ows.size_bytes), 0),
    count(*)::integer
  into rows_json, total_bytes_value, total_count_value
  from orphan_with_status ows;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'effectiveTeamId', effective_team_id,
    'count', total_count_value,
    'totalBytes', total_bytes_value,
    'rows', rows_json
  );
end;
$$;

grant execute on function tosho.get_admin_attachment_audit(uuid) to authenticated;
