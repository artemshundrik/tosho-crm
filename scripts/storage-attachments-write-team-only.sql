-- Завантажувати, перезаписувати й видаляти файли бакета attachments можуть лише
-- учасники команди.
--
-- ЩО ТУТ. Прибирає три політики з умовою лише на бакет
-- (attachments_insert/update/delete_authenticated): вони дозволяли це кожному,
-- хто має акаунт. Пара до storage-attachments-read-team-only.sql.
--
-- ЧОМУ НЕ ПРОСТО DROP. Завантаження в CRM іде з upsert: true, а для цього потрібен
-- дозвіл на update, якого в команди не було. Наявний командний delete дозволяє
-- видаляти лише свої файли або менеджеру, тоді як 1 571 файл узагалі без власника.
--
-- ЧОМУ БЕЗ РОЛЕЙ. Учасники з роллю viewer теж вантажать файли щодня, тож межа тут
-- одна: учасник команди, шлях teams/<його команда>/. Хто саме може видаляти всередині
-- команди, вирішує інтерфейс, як і раніше. Стара attachments_delete_team тепер
-- перекрита новою і нічого не обмежує.
--
-- ХТО ВТРАЧАЄ ДОСТУП (заміряно 09.11.2026). Лише 3 акаунти поза team_members.
-- Функції й скрипти працюють через service-role і RLS не проходять.
--
-- ВІДКАТ:
--   create policy attachments_insert_authenticated on storage.objects
--     for insert to authenticated with check (bucket_id = 'attachments');
--   create policy attachments_update_authenticated on storage.objects
--     for update to authenticated using (bucket_id = 'attachments')
--     with check (bucket_id = 'attachments');
--   create policy attachments_delete_authenticated on storage.objects
--     for delete to authenticated using (bucket_id = 'attachments');
--   drop policy attachments_update_team_member on storage.objects;
--   drop policy attachments_delete_team_member on storage.objects;
--
-- БЕЗПЕЧНО ЗАСТОСОВУВАТИ ПОВТОРНО.

-- Спершу нові дозволи, потім прибирання старих: проміжку без доступу немає.
drop policy if exists attachments_update_team_member on storage.objects;
create policy attachments_update_team_member on storage.objects
  for update to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.team_members tm
      where tm.user_id = auth.uid()
        and objects.name like 'teams/' || tm.team_id::text || '/%'
    )
  )
  with check (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.team_members tm
      where tm.user_id = auth.uid()
        and objects.name like 'teams/' || tm.team_id::text || '/%'
    )
  );

drop policy if exists attachments_delete_team_member on storage.objects;
create policy attachments_delete_team_member on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.team_members tm
      where tm.user_id = auth.uid()
        and objects.name like 'teams/' || tm.team_id::text || '/%'
    )
  );

drop policy if exists attachments_insert_authenticated on storage.objects;
drop policy if exists attachments_update_authenticated on storage.objects;
drop policy if exists attachments_delete_authenticated on storage.objects;
