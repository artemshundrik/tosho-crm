create schema if not exists tosho;

create table if not exists tosho.backup_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  section text not null check (section in ('storage', 'database')),
  status text not null check (status in ('success', 'failed')),
  schedule text not null default 'manual',
  started_at timestamptz not null,
  finished_at timestamptz not null,
  archive_name text null,
  archive_size_bytes bigint null default 0,
  dropbox_path text null,
  error_message text null,
  machine_name text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists backup_runs_workspace_section_finished_idx
  on tosho.backup_runs (workspace_id, section, finished_at desc);

alter table tosho.backup_runs enable row level security;

drop policy if exists backup_runs_select on tosho.backup_runs;
create policy backup_runs_select
  on tosho.backup_runs
  for select
  using (
    exists (
      select 1
      from tosho.memberships_view mv
      where mv.workspace_id = backup_runs.workspace_id
        and mv.user_id = auth.uid()
        and mv.access_role::text in ('owner', 'admin')
    )
  );

grant select on tosho.backup_runs to authenticated;
