-- Відкат політик до стану ДО task-chat-schema.sql (знято з проду 2026-08-02).
-- Колонки й таблицю thread_reads навмисно НЕ видаляє: вони адитивні й нікому
-- не заважають, а видалення даних робимо лише за прямою командою.

begin;

drop policy if exists quote_comments_select on tosho.quote_comments;
create policy quote_comments_select on tosho.quote_comments
  for select using (is_team_member(team_id));

drop policy if exists quote_comments_insert on tosho.quote_comments;
create policy quote_comments_insert on tosho.quote_comments
  for insert with check (is_team_member(team_id));

-- Політика delete не змінювалась:
--   using (has_team_role(team_id, array['super_admin','manager']) or created_by = auth.uid())

commit;
