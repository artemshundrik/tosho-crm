-- Дії з повідомленням: відповідь і видалення. Safe to run multiple times.
--
-- Видалення НЕ стирає рядок: інакше з розмови зникає контекст і відповіді
-- висять самі по собі. Ставимо позначку, а інтерфейс показує «видалено».

begin;

alter table tosho.quote_comments
  add column if not exists reply_to   uuid references tosho.quote_comments(id) on delete set null,
  add column if not exists deleted_at timestamptz;

create index if not exists quote_comments_reply_to_idx
  on tosho.quote_comments (reply_to) where reply_to is not null;

-- Видаляє автор або керівник — та сама умова, що вже діє для DELETE.
drop policy if exists quote_comments_update on tosho.quote_comments;
create policy quote_comments_update on tosho.quote_comments
  for update using (
    is_team_member(team_id)
    and (created_by = auth.uid() or has_team_role(team_id, array['super_admin', 'manager']))
  )
  with check (is_team_member(team_id));

grant update on tosho.quote_comments to authenticated;

commit;
