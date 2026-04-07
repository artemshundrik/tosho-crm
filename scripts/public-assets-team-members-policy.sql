do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_assets_upload_team_admin 1qcqrtz_0'
  ) then
    drop policy "public_assets_upload_team_admin 1qcqrtz_0" on storage.objects;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_assets_update_team_admin 1qcqrtz_0'
  ) then
    drop policy "public_assets_update_team_admin 1qcqrtz_0" on storage.objects;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_assets_update_team_admin 1qcqrtz_1'
  ) then
    drop policy "public_assets_update_team_admin 1qcqrtz_1" on storage.objects;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_assets_delete_team_admin 1qcqrtz_0'
  ) then
    drop policy "public_assets_delete_team_admin 1qcqrtz_0" on storage.objects;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_assets_delete_team_admin 1qcqrtz_1'
  ) then
    drop policy "public_assets_delete_team_admin 1qcqrtz_1" on storage.objects;
  end if;
end $$;

create policy public_assets_upload_team_member
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'public-assets'
  and exists (
    select 1
    from public.team_members tm
    where tm.user_id = auth.uid()
      and objects.name like ('teams/' || tm.team_id::text || '/%')
  )
);

create policy public_assets_update_team_member_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'public-assets'
  and exists (
    select 1
    from public.team_members tm
    where tm.user_id = auth.uid()
      and objects.name like ('teams/' || tm.team_id::text || '/%')
  )
);

create policy public_assets_update_team_member
on storage.objects
for update
to authenticated
using (
  bucket_id = 'public-assets'
  and exists (
    select 1
    from public.team_members tm
    where tm.user_id = auth.uid()
      and objects.name like ('teams/' || tm.team_id::text || '/%')
  )
)
with check (
  bucket_id = 'public-assets'
  and exists (
    select 1
    from public.team_members tm
    where tm.user_id = auth.uid()
      and objects.name like ('teams/' || tm.team_id::text || '/%')
  )
);

create policy public_assets_delete_team_member_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'public-assets'
  and exists (
    select 1
    from public.team_members tm
    where tm.user_id = auth.uid()
      and objects.name like ('teams/' || tm.team_id::text || '/%')
  )
);

create policy public_assets_delete_team_member
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'public-assets'
  and exists (
    select 1
    from public.team_members tm
    where tm.user_id = auth.uid()
      and objects.name like ('teams/' || tm.team_id::text || '/%')
  )
);
