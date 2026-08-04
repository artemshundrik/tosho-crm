-- =====================================================================
-- Гард від дубля відсутності (інцидент 2026-08-04).
--
-- Ілля подав ту саму відпустку 17.08–21.08 двічі з різницею 32 секунди:
-- SEO отримав дві однакові заявки, у списку «На погодженні» два ідентичні
-- рядки. Подвійним кліком це не пояснити — кнопка блокується на час запиту.
-- Людина просто не побачила, що заявка вже подана, і повторила.
--
-- Тригер, а не унікальний індекс, СВІДОМО:
--   1. індекс не створиться, поки в журналі лежить наявний дубль, а чистити
--      робочі дані заради міграції не можна;
--   2. тригер дає людський текст помилки, а не «duplicate key value violates
--      unique constraint …», який довелось би перекладати в кожному
--      з трьох шляхів запису (UI, бот, запис керівництвом).
--
-- Ловимо ТОЧНИЙ збіг (та сама людина + тип + обидві дати) серед ЖИВИХ
-- статусів. Частковий перетин («17–21» і «18–22») навмисно не чіпаємо: це
-- буває при коригуванні дат, і забороняти його — перестаратись. Такі випадки
-- показує підказка в модалці.
--
-- Застосування: psql "$BACKUP_DB_URL" -v ON_ERROR_STOP=1 -f scripts/team-absences-duplicate-guard.sql
-- =====================================================================

begin;

create or replace function tosho.guard_team_absence_duplicate()
returns trigger
language plpgsql
security definer
set search_path to 'tosho', 'public'
as $$
begin
  -- Скасовану чи відхилену заявку можна подати знову — це нормальний шлях
  -- «передумав / попросив ще раз».
  if new.status not in ('pending', 'approved') then
    return new;
  end if;

  -- Серіалізуємо пару (воркспейс, людина): без цього дві вкладки, що
  -- надіслали заявку одночасно, обидві прочитають «дубля немає» і обидві
  -- пройдуть. Той самий прийом, що стереже річну квоту лікарняних.
  perform pg_advisory_xact_lock(
    hashtextextended(new.workspace_id::text || ':dup:' || new.user_id::text, 0)
  );

  if exists (
    select 1
    from tosho.team_absences a
    where a.workspace_id = new.workspace_id
      and a.user_id = new.user_id
      and a.kind = new.kind
      and a.start_date = new.start_date
      and a.end_date = new.end_date
      and a.status in ('pending', 'approved')
      and a.id is distinct from new.id
  ) then
    raise exception 'Така відсутність уже є в журналі — перевірте список своїх заявок'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists team_absences_guard_duplicate on tosho.team_absences;
create trigger team_absences_guard_duplicate
before insert or update of start_date, end_date, kind, status on tosho.team_absences
for each row execute function tosho.guard_team_absence_duplicate();

commit;
