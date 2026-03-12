-- avatar-backfill.sql
-- Normalizes avatar ownership so every workspace user points to one canonical avatar record.
-- Current canonical bucket in this project: avatars
-- Current canonical path format: avatars/<user_id>/current.png
-- Run after scripts/workspace-member-directory.sql

begin;

alter table tosho.team_member_profiles
  add column if not exists avatar_url text,
  add column if not exists avatar_path text;

do $$
declare
  memberships_has_avatar_url boolean;
  memberships_has_full_name boolean;
  source_full_name_expr text;
  source_avatar_expr text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'tosho'
      and table_name = 'memberships_view'
      and column_name = 'avatar_url'
  ) into memberships_has_avatar_url;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'tosho'
      and table_name = 'memberships_view'
      and column_name = 'full_name'
  ) into memberships_has_full_name;

  source_full_name_expr := case
    when memberships_has_full_name
      then 'coalesce(mv.full_name, u.raw_user_meta_data ->> ''full_name'')'
    else 'u.raw_user_meta_data ->> ''full_name'''
  end;

  source_avatar_expr := case
    when memberships_has_avatar_url
      then 'coalesce(mv.avatar_url, u.raw_user_meta_data ->> ''avatar_url'')'
    else 'u.raw_user_meta_data ->> ''avatar_url'''
  end;

  execute format($sql$
    insert into tosho.team_member_profiles (
      workspace_id,
      user_id,
      full_name,
      avatar_url,
      avatar_path
    )
    select
      mv.workspace_id,
      mv.user_id,
      nullif(trim(%1$s), ''),
      nullif(trim(%2$s), ''),
      coalesce(
        nullif(
          substring(
            %2$s
            from '/storage/v1/object/(?:public|sign)/[^/]+/(avatars/[^?]+)'
          ),
          ''
        ),
        case
          when %2$s ilike '%%/avatars/' || mv.user_id::text || '/%%'
            then 'avatars/' || mv.user_id::text || '/current.png'
          else null
        end
      )
    from tosho.memberships_view mv
    left join auth.users u on u.id = mv.user_id
    on conflict (workspace_id, user_id) do update
    set
      avatar_url = coalesce(tosho.team_member_profiles.avatar_url, excluded.avatar_url),
      avatar_path = coalesce(tosho.team_member_profiles.avatar_path, excluded.avatar_path),
      full_name = coalesce(tosho.team_member_profiles.full_name, excluded.full_name)
  $sql$, source_full_name_expr, source_avatar_expr);
end $$;

update tosho.team_member_profiles p
set avatar_path = 'avatars/' || p.user_id::text || '/current.png'
where p.user_id is not null
  and p.avatar_path is null
  and p.avatar_url ilike '%/avatars/' || p.user_id::text || '/%';

update tosho.team_member_profiles p
set avatar_url = 'avatars/' || p.user_id::text || '/current.png'
where p.avatar_path = 'avatars/' || p.user_id::text || '/current.png'
  and (p.avatar_url is null or trim(p.avatar_url) = '');

notify pgrst, 'reload schema';

commit;
