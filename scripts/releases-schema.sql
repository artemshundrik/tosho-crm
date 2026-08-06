-- Історія релізів: скільки роботи насправді зроблено.
--
-- НАВІЩО ОКРЕМО ВІД product_updates: стрічка «Що нового» навмисно фільтрована —
-- туди йде лише те, що помітить людина, і більшість дрібних правок туди НЕ
-- потрапляє. Тому за нею неможливо судити про обсяг роботи: вона показує
-- видиме, а не зроблене.
--
-- Джерело правди — git. Кожен пуш у main = деплой = реліз; коміти між
-- попереднім і поточним записом розбираються за конвенцією `type(scope):`.
--
-- Видно лише власнику й SEO: решті команди цифри про обсяг робіт нічого не
-- дають, а ось стрічка — дає.

create table if not exists tosho.releases (
  id           uuid        primary key default gen_random_uuid(),
  released_at  timestamptz not null default now(),
  /** SHA голови на момент релізу — від нього рахуємо наступний. */
  commit_ref   text        not null unique,
  /** Людський підпис релізу, якщо його вартий. */
  title        text,
  /**
   * Зміни як масив обʼєктів {sha, type, scope, subject}.
   * Окрема таблиця тут зайва: список незмінний і читається лише цілком.
   */
  changes      jsonb       not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists releases_released_at_idx
  on tosho.releases (released_at desc);

alter table tosho.releases enable row level security;

-- Той самий предикат, що й для зрізу використання: власник або SEO.
drop policy if exists releases_privileged_read on tosho.releases;
create policy releases_privileged_read on tosho.releases
  for select using (tosho.can_read_all_feature_adoption());

revoke all on tosho.releases from anon;
grant select on tosho.releases to authenticated;
