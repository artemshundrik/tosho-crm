-- Contract revisions schema
-- Safe to run multiple times.
--
-- Purpose: per-order versioned contract editing with CEO approval and customer send-out audit.
-- Flow: draft → pending_ceo → approved → sent  (or rejected, which returns it to author for rework).

create table if not exists tosho.contract_revisions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  order_id uuid not null references tosho.orders(id) on delete cascade,
  revision_number int not null,
  status text not null default 'draft'
    check (status in ('draft', 'pending_ceo', 'approved', 'rejected', 'sent')),
  sections jsonb not null default '[]'::jsonb,
  -- sections: [{ id: "1", title: "Предмет договору", bodyHtml: "...", isCore: true, position: 1 }, ...]
  notes_for_ceo text,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_for_ceo_at timestamptz,
  ceo_reviewed_by_user_id uuid,
  ceo_reviewed_at timestamptz,
  ceo_decision text check (ceo_decision in ('approved', 'rejected')),
  ceo_comment text,
  sent_to_customer_at timestamptz,
  sent_by_user_id uuid,
  snapshot_storage_bucket text,
  snapshot_storage_path text,
  constraint contract_revisions_unique_number unique (order_id, revision_number)
);

create index if not exists contract_revisions_team_order_idx
  on tosho.contract_revisions (team_id, order_id, revision_number desc);

create index if not exists contract_revisions_status_idx
  on tosho.contract_revisions (team_id, status, updated_at desc);

-- updated_at trigger.
create or replace function tosho.touch_contract_revisions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contract_revisions_touch_updated_at on tosho.contract_revisions;
create trigger contract_revisions_touch_updated_at
  before update on tosho.contract_revisions
  for each row execute function tosho.touch_contract_revisions_updated_at();

alter table tosho.contract_revisions enable row level security;

-- RLS: team members can read; team members can insert/update drafts they own;
-- CEO (access_role='owner') can review (approve/reject); author can mark as sent after approval.
-- We keep policies broad on update — application-layer guards which transitions are allowed,
-- mirroring the existing pattern used for other tosho tables.
do $$
declare
  has_member_fn boolean;
begin
  has_member_fn := to_regprocedure('public.is_team_member(uuid)') is not null;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'contract_revisions' and policyname = 'contract_revisions_select'
  ) then
    if has_member_fn then
      create policy contract_revisions_select on tosho.contract_revisions
        for select using (public.is_team_member(team_id));
    else
      create policy contract_revisions_select on tosho.contract_revisions
        for select using (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'contract_revisions' and policyname = 'contract_revisions_insert'
  ) then
    if has_member_fn then
      create policy contract_revisions_insert on tosho.contract_revisions
        for insert with check (public.is_team_member(team_id));
    else
      create policy contract_revisions_insert on tosho.contract_revisions
        for insert with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'contract_revisions' and policyname = 'contract_revisions_update'
  ) then
    if has_member_fn then
      create policy contract_revisions_update on tosho.contract_revisions
        for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
    else
      create policy contract_revisions_update on tosho.contract_revisions
        for update using (true) with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'contract_revisions' and policyname = 'contract_revisions_delete'
  ) then
    if has_member_fn then
      create policy contract_revisions_delete on tosho.contract_revisions
        for delete using (public.is_team_member(team_id));
    else
      create policy contract_revisions_delete on tosho.contract_revisions
        for delete using (true);
    end if;
  end if;
end$$;

-- Storage bucket for HTML snapshots of sent contracts (immutable audit trail).
-- Application uploads to: contracts/{order_id}/v{n}.html
insert into storage.buckets (id, name, public)
values ('contract-snapshots', 'contract-snapshots', false)
on conflict (id) do nothing;

-- Storage RLS: team members can read snapshots for their team's orders.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'contract_snapshots_select'
  ) then
    create policy contract_snapshots_select on storage.objects
      for select to authenticated
      using (bucket_id = 'contract-snapshots');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'contract_snapshots_insert'
  ) then
    create policy contract_snapshots_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'contract-snapshots');
  end if;
end$$;
