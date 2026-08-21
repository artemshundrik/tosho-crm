-- Журнал помилок браузера: полагодити читання.
--
-- ЩО БУЛО ЗЛАМАНО
--
-- Політика на запис і політика на читання порівнювали РІЗНІ ідентифікатори:
--
--   INSERT: (user_id = auth.uid()) AND is_team_member(team_id)
--   SELECT: memberships_view.workspace_id = runtime_errors.team_id
--
-- У колонці team_id лежить team_id із public.team_members (наприклад
-- 389719a7-…), а memberships_view.workspace_id — це workspace_id
-- (dd80eefa-…). Це різні сутності, вони не збігаються ніколи.
--
-- Наслідок: запис проходив, читання не проходило НІКОЛИ й НІ В КОГО. За
-- 21.08.2026 у таблиці лежало 1274 записи з 27.03.2026, серед них помилка,
-- що зачепила 7 людей 337 разів — і жодного разу її ніхто не бачив. Виглядало
-- це не як помилка доступу, а як «падінь не було»: порожній список нічим не
-- відрізняється від успішної відповіді.
--
-- ЯК ЛАГОДИМО
--
-- Приналежність рядка перевіряємо тим самим способом, яким його писали —
-- is_team_member(team_id). Обмеження «лише owner/admin» лишається, але
-- питаємо про нього окремо, за workspace_id того, хто читає.
--
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/runtime-errors-select-policy-fix.sql

begin;

drop policy if exists runtime_errors_select_admin on tosho.runtime_errors;

create policy runtime_errors_select_admin
  on tosho.runtime_errors
  for select
  using (
    public.is_team_member(team_id)
    and tosho.is_workspace_admin(tosho.my_workspace_id())
  );

commit;

-- Перевірка після застосування (має вернути кількість > 0 для owner/admin):
--   select count(*) from tosho.runtime_errors;
