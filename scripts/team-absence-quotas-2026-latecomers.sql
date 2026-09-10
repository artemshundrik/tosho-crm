-- =====================================================================
-- Квоти day-off на 2026 для тих, кого додали в CRM після серпневого бекфілу
--
-- ЩО НЕ ТАК. 03.08.2026 разовий insert зі scripts/ua-holidays-and-calendar-
-- quotas.sql проставив рядок 24/3/10 усім, хто ТОДІ був у команді: day-off
-- запровадили в серпні, тож на залишок року дається 3, а не річні 5.
-- Рядок отримав знімок команди на той день — і більше ніхто. Хто з'явився
-- пізніше (Ангеліна Желдак, Юлія Кубенко, Денис Зологін, Тетяна Карандюк,
-- Діана Побігун), рядка не має, і `team_absence_balances` віддає йому
-- дефолт `coalesce(q.day_off_days, 5)` — п'ять днів проти трьох у решти.
-- На сторінці «Команда» це видно як «5 / 5 day-off» в одній картці серед
-- «3 / 3» у всіх сусідніх.
--
-- ЩО РОБИМО. Дописуємо рядок 24/3/10 усім активним без рядка на 2026.
-- `do nothing`, а не `do update`: у наявні рядки не лізем, бо їх могли
-- правити руками в редакторі квот. Звільнених не чіпаємо — їх і початковий
-- бекфіл виключав.
--
-- Застосування: npm run db:apply scripts/team-absence-quotas-2026-latecomers.sql
-- =====================================================================

begin;

insert into tosho.team_absence_quotas (workspace_id, user_id, year, vacation_days, day_off_days, sick_days)
select mv.workspace_id, mv.user_id, 2026, 24, 3, 10
from tosho.memberships_view mv
left join tosho.team_member_profiles p
  on p.workspace_id = mv.workspace_id and p.user_id = mv.user_id
where coalesce(p.employment_status, 'active') not in ('inactive', 'rejected')
on conflict (workspace_id, user_id, year) do nothing;

commit;
