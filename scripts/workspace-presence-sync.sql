-- Overwrite stale presence names/avatars with canonical workspace member data.
-- Safe to run multiple times.

begin;

with member_directory as (
  select
    md.workspace_id,
    md.user_id,
    coalesce(
      nullif(trim(concat_ws(' ', md.first_name, case when nullif(trim(md.last_name), '') is not null then left(trim(md.last_name), 1) || '.' end)), ''),
      nullif(trim(md.full_name), ''),
      nullif(trim(split_part(md.email, '@', 1)), ''),
      up.display_name,
      'Користувач'
    ) as canonical_display_name,
    coalesce(nullif(trim(md.avatar_url), ''), up.avatar_url) as canonical_avatar_url
  from public.user_presence up
  join tosho.workspace_member_directory md
    on md.workspace_id = up.team_id
   and md.user_id = up.user_id
)
update public.user_presence up
set
  display_name = md.canonical_display_name,
  avatar_url = md.canonical_avatar_url,
  updated_at = now()
from member_directory md
where up.team_id = md.workspace_id
  and up.user_id = md.user_id
  and (
    up.display_name is distinct from md.canonical_display_name
    or up.avatar_url is distinct from md.canonical_avatar_url
  );

commit;
