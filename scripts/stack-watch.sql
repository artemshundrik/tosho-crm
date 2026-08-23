-- ---------------------------------------------------------------------------
-- Спостереження за чужими умовами — коли можна зрушити те, що зараз заблоковано.
--
-- ПЕРШИЙ І ПОКИ ЄДИНИЙ ВИПАДОК: TypeScript 7. Він утричі швидший (заміряно:
-- 17,5 с із 24,3 на збірку), але взяти його не можна — typescript-eslint не
-- працює на новому компіляторі й у peerDependencies тримає межу «<6.1.0».
-- Щойно межа підніметься до сімки, оновлення стане можливим.
--
-- ПРОБЛЕМА, ЯКУ ЦЕ РОЗВʼЯЗУЄ. Про такий момент ніхто не дізнається сам: треба
-- памʼятати й час від часу перевіряти руками, а такі перевірки завжди
-- забуваються. Щоденний крон стеків і так ходить у npm — хай заразом дивиться
-- сюди й скаже, коли час настане.
--
-- ЧОМУ ОКРЕМА ТАБЛИЦЯ, А НЕ КОЛОНКА В stack_versions: там рядок на пакет, а це
-- не властивість пакета, а зовнішня умова. Наступне таке спостереження ляже
-- сюди ж, без нової міграції.
--
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/stack-watch.sql
-- ---------------------------------------------------------------------------

create table if not exists tosho.stack_watch (
  /** Що саме спостерігаємо. Напр. 'typescript_eslint_peer'. */
  key         text primary key,
  /** Останнє побачене значення — як є, рядком. */
  value       text,
  /** Чи означає поточне значення «уже можна». */
  ready       boolean not null default false,
  checked_at  timestamptz not null default now()
);

comment on table tosho.stack_watch is
  'Зовнішні умови, які блокують оновлення. Пише крон stack-versions, читає сигнал здоровʼя системи.';

alter table tosho.stack_watch enable row level security;

drop policy if exists stack_watch_privileged_read on tosho.stack_watch;
create policy stack_watch_privileged_read on tosho.stack_watch
  for select using (tosho.can_read_all_feature_adoption());

revoke all on tosho.stack_watch from anon;
grant select on tosho.stack_watch to authenticated;

-- ---------------------------------------------------------------------------
-- Перевірка: select * from tosho.stack_watch;
-- ---------------------------------------------------------------------------
