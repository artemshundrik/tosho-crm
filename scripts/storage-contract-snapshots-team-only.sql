-- Знімки договорів може читати й додавати лише команда замовлення.
--
-- ЩО ТУТ. Політики бакета contract-snapshots перевіряли лише бакет, тож читати й
-- додавати файли міг кожен, хто має акаунт. Шлях знімка <order_id>/v<N>.html не
-- містить команди, тому умова дивиться на саме замовлення: воно має існувати, а
-- людина бути учасником його команди, як у правилах таблиць orders і
-- contract_revisions.
--
-- ЧОМУ ТІ САМІ НАЗВИ. contract-revisions-schema.sql створює ці політики лише тоді,
-- коли їх немає. Нові назви означали б, що його повторний прогін знову відкриє бакет.
--
-- ХТО ВТРАЧАЄ ДОСТУП (заміряно 09.11.2026). Лише акаунти поза командою. Обидва
-- наявні знімки завантажили учасники команди, їхні замовлення існують.
--
-- ВІДКАТ:
--   drop policy contract_snapshots_select on storage.objects;
--   create policy contract_snapshots_select on storage.objects
--     for select to authenticated using (bucket_id = 'contract-snapshots');
--   drop policy contract_snapshots_insert on storage.objects;
--   create policy contract_snapshots_insert on storage.objects
--     for insert to authenticated with check (bucket_id = 'contract-snapshots');
--
-- БЕЗПЕЧНО ЗАСТОСОВУВАТИ ПОВТОРНО.

drop policy if exists contract_snapshots_select on storage.objects;
create policy contract_snapshots_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contract-snapshots'
    and exists (
      select 1 from tosho.orders o
      where o.id::text = split_part(objects.name, '/', 1)
        and public.is_team_member(o.team_id)
    )
  );

drop policy if exists contract_snapshots_insert on storage.objects;
create policy contract_snapshots_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contract-snapshots'
    and exists (
      select 1 from tosho.orders o
      where o.id::text = split_part(objects.name, '/', 1)
        and public.is_team_member(o.team_id)
    )
  );
