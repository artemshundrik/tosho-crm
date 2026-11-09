-- Фото людини може змінити чи видалити лише вона сама, власник або SEO.
--
-- ЩО ТУТ. Три політики бакета avatars називались *_own, але перевіряли лише бакет,
-- а видалення до того ж було виписане на роль public, тобто дозволене без входу.
-- Тепер умова та сама, що в кнопки «змінити фото» в картці людини
-- (PersonProfilePage, canEditPerson): своя папка avatars/<user_id>/ для учасника
-- команди, будь-яка папка для tosho.is_owner_or_seo().
--
-- ЧОГО НЕ ЧІПАЄ. Читання: воно лишається відкритим, як і було.
-- Правило «SEO не змінює фото власника» лишається в інтерфейсі, як і було.
--
-- ХТО ВТРАЧАЄ ДОСТУП (заміряно 09.11.2026). Анонім, акаунти поза командою й
-- учасники, що чіпали б чужу папку: інтерфейсу для цього немає, у сховищі таких
-- завантажень теж немає (чужі папки писав лише власник).
--
-- ВІДКАТ:
--   create policy "avatars_upload_own 1oj01fe_0" on storage.objects
--     for insert to authenticated with check (bucket_id = 'avatars');
--   create policy "avatars_update_own 1oj01fe_0" on storage.objects
--     for update to authenticated using (bucket_id = 'avatars');
--   create policy "avatars_delete_own 1oj01fe_0" on storage.objects
--     for delete to public using (bucket_id = 'avatars');
--   drop policy avatars_insert_self_or_hr on storage.objects;
--   drop policy avatars_update_self_or_hr on storage.objects;
--   drop policy avatars_delete_self_or_hr on storage.objects;
--
-- БЕЗПЕЧНО ЗАСТОСОВУВАТИ ПОВТОРНО.

-- Спершу нові дозволи, потім прибирання старих: проміжку без доступу немає.
drop policy if exists avatars_insert_self_or_hr on storage.objects;
create policy avatars_insert_self_or_hr on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and objects.name like 'avatars/%'
    and (
      tosho.is_owner_or_seo()
      or (
        split_part(objects.name, '/', 2) = auth.uid()::text
        and exists (select 1 from public.team_members tm where tm.user_id = auth.uid())
      )
    )
  );

drop policy if exists avatars_update_self_or_hr on storage.objects;
create policy avatars_update_self_or_hr on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and objects.name like 'avatars/%'
    and (
      tosho.is_owner_or_seo()
      or (
        split_part(objects.name, '/', 2) = auth.uid()::text
        and exists (select 1 from public.team_members tm where tm.user_id = auth.uid())
      )
    )
  )
  with check (
    bucket_id = 'avatars'
    and objects.name like 'avatars/%'
    and (
      tosho.is_owner_or_seo()
      or (
        split_part(objects.name, '/', 2) = auth.uid()::text
        and exists (select 1 from public.team_members tm where tm.user_id = auth.uid())
      )
    )
  );

drop policy if exists avatars_delete_self_or_hr on storage.objects;
create policy avatars_delete_self_or_hr on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and objects.name like 'avatars/%'
    and (
      tosho.is_owner_or_seo()
      or (
        split_part(objects.name, '/', 2) = auth.uid()::text
        and exists (select 1 from public.team_members tm where tm.user_id = auth.uid())
      )
    )
  );

drop policy if exists "avatars_upload_own 1oj01fe_0" on storage.objects;
drop policy if exists "avatars_update_own 1oj01fe_0" on storage.objects;
drop policy if exists "avatars_delete_own 1oj01fe_0" on storage.objects;
