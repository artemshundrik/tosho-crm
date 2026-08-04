# Розділ «Можливості» — Фаза 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дати команді сторінку `/features` з усіма можливостями CRM, відфільтрованими за доступами людини, з особистим станом «користуєшся / ще не пробував» і кнопкою, що веде прямо у фічу.

**Architecture:** Реєстр можливостей — TS-файл за зразком `moduleAccess.ts` (джерело правди для підписів, описів, кроків і аудиторії). Стан використання рахує нічна SQL-функція в таблицю `tosho.feature_adoption` — живих проб не робимо, бо їх ~20 по різних таблицях, а стеля RPC для ролі `authenticated` — 8 с. Сторінка читає обидва джерела через React Query.

**Tech Stack:** React 19 + Vite + TypeScript, Tailwind v4, shadcn/ui, Supabase (схема `tosho`), pg_cron, vitest.

**Спирається на:** [docs/FEATURE_DISCOVERY_DESIGN.md](../../FEATURE_DISCOVERY_DESIGN.md) — там докази, розподіл за напрямками й фази 2–5.

**Обсяг звужено (рішення Артема, 4 серпня):** починаємо з **трьох** можливостей — диктування голосом, обговорення в дизайн-задачі, Telegram-бот. Це ті самі «дрібниці, що економлять час», які потрібні всім. Каркас робимо повний (реєстр, знімок використання, сторінка), решта можливостей додається потім рядком у реєстр + гілкою в SQL — Task 8 відкладено цілком.

**Межі фази 1:** анонсів, модалок, Telegram-розсилки та статистики CEO тут НЕМАЄ — це фази 2–5. Свідомо відкладено також `product_feature_touches` із §5 дизайн-доку (миттєва позначка «відкривав» одразу після кліку «Спробувати»): нічного знімка для першого релізу досить, а окрема таблиця й запис із фронтенду — зайвий обсяг, поки не видно, чи заважає добова затримка.

**Тестування в цьому репо:** vitest у `environment: "node"`, `include: ["src/**/*.test.ts", "netlify/**/*.test.ts"]`. Бібліотек для рендеру компонентів (jsdom, testing-library) НЕМАЄ — тому тестами покриваємо чисту логіку, а сторінку перевіряємо через `npx tsc --noEmit` + `npm run lint`. Не намагайся писати тест на React-компонент: він не запуститься.

**Деплой:** `git push` у цьому репо заборонений без прямої команди Артема (пуш = деплой ≈15 кредитів). Комітимо локально, наприкінці звітуємо пачкою.

---

## Структура файлів

| Файл | Відповідальність |
|---|---|
| `src/lib/featureCatalog.ts` | Реєстр можливостей + правило видимості за доступами |
| `src/lib/featureCatalog.test.ts` | Тести реєстру й видимості |
| `src/lib/featureState.ts` | Виведення стану картки з даних використання |
| `src/lib/featureState.test.ts` | Тести стану |
| `scripts/feature-adoption-schema.sql` | Таблиця, RLS, `refresh_feature_adoption()`, розклад pg_cron |
| `scripts/check-feature-keys.mjs` | Захист від дрейфу ключів TS ↔ SQL |
| `src/features/features/queries.ts` | Читання `feature_adoption` через React Query |
| `src/pages/FeaturesPage.tsx` | Сторінка `/features` |
| `src/App.tsx` | Маршрут |
| `src/components/app/UserMenu.tsx` | Пункт меню «Можливості» |

---

### Task 1: Реєстр можливостей і правило видимості

**Files:**
- Create: `src/lib/featureCatalog.ts`
- Test: `src/lib/featureCatalog.test.ts`

- [ ] **Step 1: Написати падаючий тест**

Створи `src/lib/featureCatalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultModuleAccess } from "./moduleAccess";
import {
  FEATURE_DEFINITIONS,
  FEATURE_KEYS,
  isFeatureVisible,
  visibleFeatures,
} from "./featureCatalog";

const DESIGNER = { accessRole: "member", jobRole: "designer" };
const MARKETER = { accessRole: "member", jobRole: "marketer" };
const OWNER = { accessRole: "owner", jobRole: "it_specialist" };

// Увага: defaultModuleAccess приймає ОБʼЄКТ RoleContext, не два аргументи.
function ctx(role: { accessRole: string; jobRole: string }) {
  return {
    access: defaultModuleAccess(role),
    accessRole: role.accessRole,
    jobRole: role.jobRole,
  };
}

describe("реєстр", () => {
  it("ключі унікальні", () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });

  it("у кожної можливості рівно три кроки й непорожній маршрут", () => {
    for (const def of FEATURE_DEFINITIONS) {
      expect(def.steps).toHaveLength(3);
      expect(def.route.startsWith("/")).toBe(true);
      expect(def.summary.length).toBeGreaterThan(10);
    }
  });
});

describe("видимість", () => {
  it("можливості без модуля бачать усі", () => {
    const telegram = FEATURE_DEFINITIONS.find((d) => d.key === "telegram_bot")!;
    expect(telegram.moduleKey).toBeNull();
    expect(isFeatureVisible(telegram, ctx(DESIGNER))).toBe(true);
    expect(isFeatureVisible(telegram, ctx(MARKETER))).toBe(true);
  });

  it("галерею візуалів дизайнер не бачить, а маркетолог бачить", () => {
    const gallery = FEATURE_DEFINITIONS.find((d) => d.key === "marketing_gallery")!;
    expect(isFeatureVisible(gallery, ctx(DESIGNER))).toBe(false);
    expect(isFeatureVisible(gallery, ctx(MARKETER))).toBe(true);
  });

  it("jobRoles звужує всередині модуля", () => {
    const timer = FEATURE_DEFINITIONS.find((d) => d.key === "design_timer")!;
    expect(isFeatureVisible(timer, ctx(DESIGNER))).toBe(true);
    expect(isFeatureVisible(timer, ctx(MARKETER))).toBe(false);
  });

  it("власник бачить усе", () => {
    expect(visibleFeatures(ctx(OWNER))).toHaveLength(FEATURE_DEFINITIONS.length);
  });
});
```

- [ ] **Step 2: Запустити тест і переконатися, що падає**

Run: `npx vitest run src/lib/featureCatalog.test.ts`
Expected: FAIL — `Failed to resolve import "./featureCatalog"`.

- [ ] **Step 3: Написати реєстр**

Створи `src/lib/featureCatalog.ts`. Спершу типи й логіка (описи доповнимо в Task 8 — тут закладаємо шість штук, щоб тести проходили):

```ts
import { hasModuleAccess, type ModuleAccess, type ModuleKey } from "./moduleAccess";

/**
 * Реєстр можливостей CRM — джерело правди для розділу «Можливості».
 * Живе в коді (а не в БД) свідомо: опис і кроки мають деплоїтися разом
 * із самою фічею, інакше текст розходиться з інтерфейсом.
 *
 * Додаючи можливість: допиши сюди рядок і, якщо її використання можна
 * порахувати, — пробу в scripts/feature-adoption-schema.sql з ТИМ САМИМ
 * ключем. Розбіжність зловить scripts/check-feature-keys.mjs.
 */

export type FeatureKey =
  | "telegram_bot"
  | "voice_dictation"
  | "task_chat"
  | "push_notifications"
  | "absence_request"
  | "support_request"
  | "marketing_gallery"
  | "design_timer";

export type FeatureDefinition = {
  key: FeatureKey;
  label: string;
  summary: string;
  steps: readonly [string, string, string];
  /** Модуль, від якого залежить доступ. null = доступно всім. */
  moduleKey: ModuleKey | null;
  /** Додаткове звуження всередині модуля. Порожньо = весь модуль. */
  jobRoles?: readonly string[];
  route: string;
  /** ISO-дата появи — для фільтра «Нові». */
  since?: string;
  /**
   * Чи є проба використання в SQL. Для деяких можливостей автора зміни
   * в БД не видно (напр. точки доставки в картці клієнта), тож особистий
   * стан для них не показуємо.
   */
  measurable?: boolean;
};

/**
 * Власник і SEO бачать усе — це задум, а не діра в правах.
 * Повторює хелпер ownerOrSeo із moduleAccess.ts.
 */
function isPrivileged(ctx: FeatureViewerContext): boolean {
  const access = (ctx.accessRole ?? "").trim().toLowerCase();
  return access === "owner" || (ctx.jobRole ?? "").trim().toLowerCase() === "seo";
}

export const FEATURE_DEFINITIONS: readonly FeatureDefinition[] = [
  {
    key: "telegram_bot",
    label: "Telegram-бот",
    summary: "Дедлайни, нагадування й події команди приходять у звичайний чат із ботом.",
    steps: [
      "Профіль → «Сповіщення» → «Підключити Telegram»",
      "Натисни кнопку — бот відкриється сам і напише «готово»",
      "Там же обери, про що саме писати, а про що ні",
    ],
    moduleKey: null,
    route: "/profile",
    measurable: true,
  },
  {
    key: "voice_dictation",
    label: "Диктування голосом",
    summary: "Наговори технічне завдання — CRM розшифрує запис і почистить текст.",
    steps: [
      "Постав курсор у поле «Технічне завдання»",
      "Натисни мікрофон праворуч і говори звичайним темпом",
      "Зупини запис — текст зʼявиться вже причесаним",
    ],
    moduleKey: null,
    route: "/design",
    since: "2026-07-01",
    measurable: true,
  },
  {
    key: "task_chat",
    label: "Обговорення в задачі",
    summary: "Чат біля дизайн-задачі: домовленості лишаються там, де робота.",
    steps: [
      "Відкрий дизайн-задачу — чат уже в правій колонці",
      "Пиши як завжди; згадка людини надішле їй сповіщення",
      "Важливе закріпи, щоб не загубилося",
    ],
    moduleKey: null,
    route: "/design",
    measurable: true,
  },
  {
    key: "push_notifications",
    label: "Сповіщення в браузері",
    summary: "Спливають, навіть коли вкладка CRM закрита.",
    steps: [
      "Профіль → «Сповіщення»",
      "Увімкни перемикач сповіщень у браузері",
      "Дозволь показ у вікні, яке запитає браузер",
    ],
    moduleKey: null,
    route: "/profile",
    measurable: true,
  },
  {
    key: "absence_request",
    label: "Заявка на відсутність",
    summary: "Відпустка чи лікарняний — заявка з CRM, погодження приходить керівнику.",
    steps: [
      "Команда → вкладка «Відсутності»",
      "Натисни «Подати заявку» й обери дати",
      "Стежити за рішенням можна там само",
    ],
    moduleKey: "team",
    route: "/team",
    measurable: true,
  },
  {
    key: "support_request",
    label: "Підтримка",
    summary: "Щось зламалось або незрозуміло — заявка прямо з поточної сторінки.",
    steps: [
      "Натисни значок підтримки в шапці",
      "Опиши проблему — сторінка підставиться сама",
      "Відповідь прийде сповіщенням",
    ],
    moduleKey: null,
    route: "/support",
    measurable: true,
  },
  {
    key: "marketing_gallery",
    label: "Галерея візуалів",
    summary: "Усі готові макети з дизайн-задач в одному місці — для соцмереж і сайту.",
    steps: [
      "Відкрий розділ «Маркетинг»",
      "Познач візуали тегами й додай до обраного",
      "Приховуй те, що не піде в публікацію",
    ],
    moduleKey: "marketing",
    route: "/marketing",
    measurable: true,
  },
  {
    key: "design_timer",
    label: "Таймер роботи",
    summary: "Скільки часу реально пішло на візуал чи макет.",
    steps: [
      "Відкрий дизайн-задачу, узяту в роботу",
      "Натисни «Почати» на таймері у шапці задачі",
      "Пауза й зупинка — там само; час пишеться в задачу",
    ],
    moduleKey: "design",
    jobRoles: ["designer", "pm", "head_of_production"],
    route: "/design",
    measurable: true,
  },
] as const;

export const FEATURE_KEYS: FeatureKey[] = FEATURE_DEFINITIONS.map((item) => item.key);

export const MEASURABLE_FEATURE_KEYS: FeatureKey[] = FEATURE_DEFINITIONS.filter(
  (item) => item.measurable
).map((item) => item.key);

export type FeatureViewerContext = {
  access: ModuleAccess;
  accessRole: string | null;
  jobRole: string | null;
};

export function isFeatureVisible(def: FeatureDefinition, ctx: FeatureViewerContext): boolean {
  // hasModuleAccess дозволяє за замовчуванням: відсутній ключ читається як
  // «доступ є». Тому спираємось на повний набір із defaultModuleAccess /
  // normalizeModuleAccess, де кожен ключ проставлений явно.
  if (def.moduleKey && !hasModuleAccess(ctx.access, def.moduleKey)) return false;
  if (!def.jobRoles?.length) return true;
  if (isPrivileged(ctx)) return true;
  return def.jobRoles.includes((ctx.jobRole ?? "").trim().toLowerCase());
}

export function visibleFeatures(ctx: FeatureViewerContext): FeatureDefinition[] {
  return FEATURE_DEFINITIONS.filter((def) => isFeatureVisible(def, ctx));
}
```

- [ ] **Step 4: Звірити підписи з `moduleAccess.ts`**

Реєстр спирається на експорти `hasModuleAccess`, `defaultModuleAccess`, `ModuleAccess`, `ModuleKey`. Переконайся, що вони справді експортуються:

Run: `rg -n "^export (function|type|const) (hasModuleAccess|defaultModuleAccess|ModuleAccess|ModuleKey)" src/lib/moduleAccess.ts`
Expected: чотири збіги. Якщо якогось немає — подивись фактичну назву в файлі й підправ імпорт, а НЕ додавай новий експорт.

- [ ] **Step 5: Запустити тест — має пройти**

Run: `npx vitest run src/lib/featureCatalog.test.ts`
Expected: PASS, 6 тестів.

- [ ] **Step 6: Коміт**

```bash
git add src/lib/featureCatalog.ts src/lib/featureCatalog.test.ts
git commit -m "feat(features): реєстр можливостей і правило видимості за доступами"
```

---

### Task 2: Виведення стану картки

**Files:**
- Create: `src/lib/featureState.ts`
- Test: `src/lib/featureState.test.ts`

- [ ] **Step 1: Написати падаючий тест**

```ts
import { describe, expect, it } from "vitest";
import { isFreshFeature, resolveFeatureState } from "./featureState";

const NOW = new Date("2026-08-04T10:00:00Z");

describe("стан можливості", () => {
  it("без даних — не пробував", () => {
    expect(resolveFeatureState(null)).toBe("untried");
    expect(resolveFeatureState({ uses: 0, lastUsedAt: null })).toBe("untried");
  });

  it("одне використання — вже пробував", () => {
    expect(resolveFeatureState({ uses: 1, lastUsedAt: "2026-07-01T09:00:00Z" })).toBe("tried");
  });

  it("від трьох використань — користується", () => {
    expect(resolveFeatureState({ uses: 3, lastUsedAt: "2026-08-01T09:00:00Z" })).toBe("using");
  });

  it("незмірювану можливість не оцінюємо", () => {
    expect(resolveFeatureState(undefined)).toBe("unknown");
  });
});

describe("нові можливості", () => {
  it("молодша за 30 днів — нова", () => {
    expect(isFreshFeature({ since: "2026-07-20" }, NOW)).toBe(true);
  });

  it("старша за 30 днів — не нова", () => {
    expect(isFreshFeature({ since: "2026-05-01" }, NOW)).toBe(false);
  });

  it("без дати появи — не нова", () => {
    expect(isFreshFeature({}, NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npx vitest run src/lib/featureState.test.ts`
Expected: FAIL — `Failed to resolve import "./featureState"`.

- [ ] **Step 3: Реалізувати**

```ts
/**
 * Стан картки в розділі «Можливості».
 * `undefined` на вході означає «фіча незмірювана» (у неї немає проби в SQL),
 * `null` — «проба є, але записів по цій людині немає».
 */

export type FeatureState = "using" | "tried" | "untried" | "unknown";

export type FeatureAdoption = {
  uses: number;
  lastUsedAt: string | null;
};

/** Від скількох використань вважаємо, що людина фічею користується, а не куштувала. */
const REGULAR_USE_THRESHOLD = 3;
const FRESH_DAYS = 30;

export function resolveFeatureState(adoption: FeatureAdoption | null | undefined): FeatureState {
  if (adoption === undefined) return "unknown";
  if (!adoption || adoption.uses <= 0) return "untried";
  return adoption.uses >= REGULAR_USE_THRESHOLD ? "using" : "tried";
}

export function isFreshFeature(def: { since?: string }, now: Date): boolean {
  if (!def.since) return false;
  const since = new Date(`${def.since}T00:00:00Z`);
  if (Number.isNaN(since.getTime())) return false;
  const days = (now.getTime() - since.getTime()) / 86_400_000;
  return days >= 0 && days <= FRESH_DAYS;
}
```

- [ ] **Step 4: Запустити — має пройти**

Run: `npx vitest run src/lib/featureState.test.ts`
Expected: PASS, 7 тестів.

- [ ] **Step 5: Коміт**

```bash
git add src/lib/featureState.ts src/lib/featureState.test.ts
git commit -m "feat(features): виведення стану картки з даних використання"
```

---

### Task 3: Схема `feature_adoption` і нічний перерахунок

**Files:**
- Create: `scripts/feature-adoption-schema.sql`

Проби нижче вже перевірені на проді 2026-08-04. Пастки, які вони враховують: журнал активності лежить у **`public.activity_log`** (не в `tosho`), чат задач — це **`tosho.quote_comments`**.

- [ ] **Step 1: Написати SQL**

```sql
-- Знімок використання можливостей CRM для розділу «Можливості».
-- Рахуємо нічним кроном, а не живими запитами: проб близько двадцяти по
-- різних таблицях, а стеля RPC для ролі authenticated — 8 с.

create table if not exists tosho.feature_adoption (
  feature_key   text        not null,
  user_id       uuid        not null,
  uses          integer     not null default 0,
  first_used_at timestamptz,
  last_used_at  timestamptz,
  refreshed_at  timestamptz not null default now(),
  primary key (feature_key, user_id)
);

create index if not exists feature_adoption_user_idx on tosho.feature_adoption (user_id);

alter table tosho.feature_adoption enable row level security;

drop policy if exists feature_adoption_self_read on tosho.feature_adoption;
create policy feature_adoption_self_read on tosho.feature_adoption
  for select using (user_id = auth.uid());

-- Зріз по команді бачать лише власник і SEO — решті достатньо свого рядка.
drop policy if exists feature_adoption_privileged_read on tosho.feature_adoption;
create policy feature_adoption_privileged_read on tosho.feature_adoption
  for select using (
    exists (
      select 1
      from tosho.memberships_view mv
      where mv.user_id = auth.uid()
        and (mv.access_role::text = 'owner' or mv.job_role::text = 'seo')
    )
  );

revoke all on tosho.feature_adoption from anon;

-- Перерахунок. Кожна проба зводиться до (feature_key, user_id, uses, first, last).
create or replace function tosho.refresh_feature_adoption()
returns void
language plpgsql
security definer
set search_path = tosho, public
as $$
begin
  with probes as (
    select 'telegram_bot'::text as feature_key, user_id,
           1 as uses, telegram_linked_at as first_used_at, telegram_linked_at as last_used_at
    from tosho.user_notification_settings
    where telegram_chat_id is not null and user_id is not null

    union all
    select 'push_notifications', user_id, count(*)::int, min(created_at), max(created_at)
    from public.push_subscriptions
    where disabled_at is null and user_id is not null
    group by user_id

    union all
    select 'voice_dictation', user_id, count(*)::int, min(created_at), max(created_at)
    from tosho.ai_usage
    where kind = 'transcription' and user_id is not null
    group by user_id

    union all
    select 'task_chat', created_by, count(*)::int, min(created_at), max(created_at)
    from tosho.quote_comments
    where created_by is not null and deleted_at is null
    group by created_by

    union all
    select 'absence_request', requested_by, count(*)::int, min(created_at), max(created_at)
    from tosho.team_absences
    where requested_by is not null
    group by requested_by

    union all
    select 'support_request', created_by, count(*)::int, min(created_at), max(created_at)
    from tosho.support_requests
    where created_by is not null
    group by created_by

    union all
    select 'marketing_gallery', updated_by, count(*)::int, min(created_at), max(updated_at)
    from tosho.marketing_visuals
    where updated_by is not null
    group by updated_by

    union all
    select 'design_timer', user_id, count(*)::int, min(created_at), max(created_at)
    from public.design_task_timer_sessions
    where user_id is not null
    group by user_id
  )
  insert into tosho.feature_adoption as fa (feature_key, user_id, uses, first_used_at, last_used_at, refreshed_at)
  select feature_key, user_id, uses, first_used_at, last_used_at, now()
  from probes
  on conflict (feature_key, user_id) do update
    set uses = excluded.uses,
        first_used_at = least(fa.first_used_at, excluded.first_used_at),
        last_used_at = greatest(fa.last_used_at, excluded.last_used_at),
        refreshed_at = excluded.refreshed_at;

  -- Прибираємо рядки, які проби більше не повертають (фічу прибрали або
  -- переназвали ключ) — інакше в каталозі назавжди лишиться привид.
  delete from tosho.feature_adoption where refreshed_at < now() - interval '1 hour';
end;
$$;

revoke all on function tosho.refresh_feature_adoption() from public, anon, authenticated;

-- Щоночі о 03:20 за Києвом = 00:20 UTC.
select cron.schedule(
  'feature-adoption-refresh',
  '20 0 * * *',
  $$select tosho.refresh_feature_adoption();$$
);
```

- [ ] **Step 2: Застосувати на проді**

```bash
set -a && . ./.env.backup && set +a && psql "$BACKUP_DB_URL" -f scripts/feature-adoption-schema.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX`, кілька `CREATE POLICY`, `CREATE FUNCTION`, і рядок із номером розкладу від `cron.schedule`.

- [ ] **Step 3: Перевірити, що перерахунок працює**

```bash
set -a && . ./.env.backup && set +a && psql "$BACKUP_DB_URL" -c "select tosho.refresh_feature_adoption();" -c "select feature_key, count(*) users, sum(uses) uses from tosho.feature_adoption group by 1 order by users desc;"
```

Expected: вісім рядків. Орієнтири зі знятих 2026-08-04 замірів: `task_chat` ≈ 9 користувачів, `push_notifications` ≈ 11, `telegram_bot` = 5, `design_timer` = 4, `support_request` = 4, `absence_request` = 3, `marketing_gallery` = 1, `voice_dictation` = 1. Якщо якийсь ключ дав 0 користувачів — проба неправильна, шукай причину в назві колонки, а не «виправляй» очікування.

- [ ] **Step 4: Коміт**

```bash
git add scripts/feature-adoption-schema.sql
git commit -m "feat(features): таблиця feature_adoption і нічний перерахунок"
```

---

### Task 4: Захист від дрейфу ключів

**Files:**
- Create: `scripts/check-feature-keys.mjs`
- Modify: `package.json` — додати скрипт

- [ ] **Step 1: Написати скрипт**

```js
#!/usr/bin/env node
// Реєстр можливостей живе в TS, а проби використання — в SQL. Набори ключів
// можуть тихо розійтися: додав фічу в каталог, забув пробу — і в картки
// назавжди «не пробував». Цей скрипт ловить розбіжність до релізу.

import { readFileSync } from "node:fs";

const ts = readFileSync(new URL("../src/lib/featureCatalog.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("./feature-adoption-schema.sql", import.meta.url), "utf8");

// Ключі вимірюваних фіч: беремо блоки key: "..." , у яких далі є measurable: true.
const tsKeys = new Set();
for (const block of ts.split(/\n\s*\{\s*\n/)) {
  const key = block.match(/key:\s*"([a-z_]+)"/)?.[1];
  if (key && /measurable:\s*true/.test(block)) tsKeys.add(key);
}

const sqlKeys = new Set(
  [...sql.matchAll(/select\s+'([a-z_]+)'(?:::text)?\s+as\s+feature_key|union all\s*\n\s*select\s+'([a-z_]+)'/gi)]
    .map((m) => m[1] ?? m[2])
    .filter(Boolean)
);

const missingProbe = [...tsKeys].filter((k) => !sqlKeys.has(k));
const orphanProbe = [...sqlKeys].filter((k) => !tsKeys.has(k));

if (missingProbe.length || orphanProbe.length) {
  if (missingProbe.length) {
    console.error(`Немає проби в SQL для: ${missingProbe.join(", ")}`);
    console.error("Додай union all-гілку в scripts/feature-adoption-schema.sql або зніми measurable: true.");
  }
  if (orphanProbe.length) {
    console.error(`Проба є, а можливості в реєстрі немає: ${orphanProbe.join(", ")}`);
  }
  process.exit(1);
}

console.log(`Ключі можливостей збігаються: ${tsKeys.size} вимірюваних.`);
```

- [ ] **Step 2: Додати скрипт у `package.json`**

У блок `"scripts"` поряд із `"lint"` додай:

```json
"check:feature-keys": "node scripts/check-feature-keys.mjs",
```

- [ ] **Step 3: Запустити — має пройти**

Run: `npm run check:feature-keys`
Expected: `Ключі можливостей збігаються: 8 вимірюваних.`

- [ ] **Step 4: Перевірити, що скрипт справді ловить помилку**

Тимчасово додай у `src/lib/featureCatalog.ts` дев'яту можливість із `measurable: true` і вигаданим ключем `"fake_probe"` (решту полів скопіюй із `support_request`), потім:

Run: `npm run check:feature-keys`
Expected: EXIT 1 і рядок `Немає проби в SQL для: fake_probe`.

Прибери тимчасову можливість і перезапусти — знову має бути PASS.

- [ ] **Step 5: Коміт**

```bash
git add scripts/check-feature-keys.mjs package.json
git commit -m "chore(features): перевірка збігу ключів реєстру та SQL-проб"
```

---

### Task 5: Шар даних

**Files:**
- Create: `src/features/features/queries.ts`

Перед написанням подивись, як влаштований наявний шар запитів, і повтори його стиль (ключі кешу, `refetchOnMount`):

Run: `sed -n '1,60p' src/features/finances/queries.ts`

- [ ] **Step 1: Написати запит**

```ts
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/supabaseClient";
import type { FeatureKey } from "@/lib/featureCatalog";
import type { FeatureAdoption } from "@/lib/featureState";

/**
 * Особистий стан по можливостях. Джерело — нічний знімок
 * tosho.feature_adoption; RLS віддає користувачу лише його рядки.
 */
export function useMyFeatureAdoption(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["feature-adoption", userId],
    enabled: Boolean(userId),
    refetchOnMount: "always",
    queryFn: async (): Promise<Partial<Record<FeatureKey, FeatureAdoption>>> => {
      const { data, error } = await db
        .from("feature_adoption")
        .select("feature_key, uses, last_used_at")
        .eq("user_id", userId as string);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ feature_key: string; uses: number; last_used_at: string | null }>;
      const map: Partial<Record<FeatureKey, FeatureAdoption>> = {};
      for (const row of rows) {
        map[row.feature_key as FeatureKey] = { uses: row.uses, lastUsedAt: row.last_used_at };
      }
      return map;
    },
  });
}
```

- [ ] **Step 2: Перевірити типи**

Run: `npx tsc --noEmit`
Expected: без помилок. Якщо `db.from("feature_adoption")` не типізується — таблиці немає в `src/lib/database.types.ts`. Не правь типи руками: або перегенеруй їх звичним для репо способом, або тимчасово зроби `.from("feature_adoption" as never)`, як це вже зроблено в `TelegramPromoModal.tsx:53`.

- [ ] **Step 3: Коміт**

```bash
git add src/features/features/queries.ts
git commit -m "feat(features): читання особистого стану використання"
```

---

### Task 6: Сторінка «Можливості»

**Files:**
- Create: `src/pages/FeaturesPage.tsx`

Компонентних тестів у репо немає — перевіряємо типами й лінтом. Верстку бери з наявних сторінок: `UnifiedPageToolbar` + `usePageHeaderActions` — конвенція тулбару (див. `docs/CODEX_PROJECT_GUIDE.md`). Не додавай власний `max-w`: `AppLayout` уже дає падінги й `max-w-[1600px]`.

- [ ] **Step 1: Подивитись зразок сторінки з тулбаром**

Run: `rg -ln "UnifiedPageToolbar" src/pages | head -3`
Потім прочитай перші 80 рядків будь-якої з них і повтори структуру.

- [ ] **Step 2: Написати сторінку**

Нижче — повний компонент. Тулбар навмисно лишено простим заголовком: якщо на кроці 1 ти побачив, що сусідні сторінки використовують `UnifiedPageToolbar` з `usePageHeaderActions`, заміни шапку на неї, решту коду не чіпай. Не додавай власний `max-w`: `AppLayout` уже дає падінги й `max-w-[1600px]`.

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { visibleFeatures, type FeatureDefinition } from "@/lib/featureCatalog";
import { isFreshFeature, resolveFeatureState, type FeatureState } from "@/lib/featureState";
import { useMyFeatureAdoption } from "@/features/features/queries";

type Filter = "all" | "untried" | "fresh";

const STATE_LABEL: Record<Exclude<FeatureState, "unknown">, string> = {
  using: "Користуєшся",
  tried: "Пробував",
  untried: "Ще не пробував",
};

export default function FeaturesPage() {
  const navigate = useNavigate();
  const { userId, moduleAccess, accessRole, jobRole } = useAuth();
  const { data: adoption } = useMyFeatureAdoption(userId);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);

  const mine = useMemo(
    () => visibleFeatures({ access: moduleAccess, accessRole, jobRole }),
    [moduleAccess, accessRole, jobRole]
  );

  const stateOf = useMemo(() => {
    return (def: FeatureDefinition): FeatureState =>
      resolveFeatureState(def.measurable ? (adoption?.[def.key] ?? null) : undefined);
  }, [adoption]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mine.filter((def) => {
      if (filter === "untried" && stateOf(def) !== "untried") return false;
      if (filter === "fresh" && !isFreshFeature(def, now)) return false;
      if (!q) return true;
      return `${def.label} ${def.summary}`.toLowerCase().includes(q);
    });
  }, [mine, filter, search, stateOf, now]);

  const active = useMemo(
    () => shown.find((def) => def.key === activeKey) ?? shown[0] ?? null,
    [shown, activeKey]
  );

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Можливості</h1>
        <span className="text-sm text-muted-foreground">{mine.length} доступно тобі</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Пошук по можливостях"
          className="h-9 max-w-xs"
        />
        {(["all", "untried", "fresh"] as Filter[]).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filter === value ? "default" : "outline"}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? "Усі" : value === "untried" ? "Ще не пробував" : "Нові"}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-2 sm:grid-cols-2">
          {shown.map((def) => {
            const state = stateOf(def);
            return (
              <button
                key={def.key}
                type="button"
                onClick={() => setActiveKey(def.key)}
                className={cn(
                  "rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent",
                  active?.key === def.key && "border-primary/50 ring-1 ring-primary/20"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate font-medium">{def.label}</span>
                  {isFreshFeature(def, now) ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      Нове
                    </span>
                  ) : state !== "unknown" ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        state === "untried"
                          ? "bg-warning-soft text-warning-foreground"
                          : "bg-success-soft text-success-foreground"
                      )}
                    >
                      {STATE_LABEL[state]}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{def.summary}</p>
              </button>
            );
          })}
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">За цим фільтром нічого немає.</p>
          ) : null}
        </div>

        {active ? (
          <aside className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold tracking-tight">{active.label}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{active.summary}</p>
            <ol className="mt-4 grid gap-2">
              {active.steps.map((step, index) => (
                <li key={step} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="font-mono text-xs font-semibold text-primary">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <Button type="button" className="mt-5 w-full" onClick={() => navigate(active.route)}>
              Спробувати
            </Button>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
```

**Звір із `useAuth()` перед запуском:** код очікує поля `userId`, `moduleAccess`, `accessRole`, `jobRole`. Перевір фактичні назви — `rg -n "return \{|value = \{" -A 20 src/auth/AuthProvider.tsx | head -40` — і підправ деструктуризацію під те, що там насправді. Якщо готового `moduleAccess` у контексті немає, збери його через `normalizeModuleAccess(raw, accessRole, jobRole)` з `@/lib/moduleAccess`.

**Токени, а не хардкод:** класи `bg-warning-soft`, `text-success-foreground` тощо вже описані в `tailwind.config.js`. Хардкод кольору чи кегля заблокує eslint.

- [ ] **Step 3: Перевірити типи й лінт**

Run: `npx tsc --noEmit && npm run lint`
Expected: обидві команди без помилок.

- [ ] **Step 4: Коміт**

```bash
git add src/pages/FeaturesPage.tsx
git commit -m "feat(features): сторінка «Можливості»"
```

---

### Task 7: Маршрут і пункт меню

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/app/UserMenu.tsx:275-312`

- [ ] **Step 1: Додати маршрут**

У `src/App.tsx` додай лінивий імпорт поряд з іншими сторінками й маршрут. `ModuleRouteGate` тут **не потрібен**: сторінка доступна всім, а вміст уже відфільтрований `visibleFeatures`.

```tsx
<Route
  path="/features"
  element={
    <Suspense fallback={<PageFallback />}>
      <FeaturesPage />
    </Suspense>
  }
/>
```

Назву фолбеку звір із сусідніми маршрутами — використай ту, що вже є у файлі, а не вигадану.

- [ ] **Step 2: Додати пункт меню**

У `src/components/app/UserMenu.tsx` в масив `items` — одразу після пункту «Мій профіль» (рядок ~286):

```tsx
{
  label: (
    <>
      <Sparkles className="mr-2 h-4 w-4" />
      Можливості
    </>
  ),
  onSelect: () => navigate("/features"),
},
```

Додай `Sparkles` до наявного імпорту з `lucide-react` у цьому файлі.

- [ ] **Step 3: Перевірити типи й лінт**

Run: `npx tsc --noEmit && npm run lint`
Expected: без помилок.

- [ ] **Step 4: Коміт**

```bash
git add src/App.tsx src/components/app/UserMenu.tsx
git commit -m "feat(features): маршрут /features і пункт у меню акаунта"
```

---

### Task 8: Наповнити реєстр рештою можливостей

Зараз у реєстрі вісім записів. Дизайн-док називає двадцять чотири. Добираємо за пріоритетом: спершу дев'ять «мало хто знає» — саме заради них усе робиться.

**Files:**
- Modify: `src/lib/featureCatalog.ts`
- Modify: `scripts/feature-adoption-schema.sql` — проби для нових вимірюваних ключів

- [ ] **Step 1: Додати можливості з нульовим і майже нульовим освоєнням**

Додай у `FEATURE_DEFINITIONS` (і в `FeatureKey`): `nova_poshta_address` (модуль `customers`), `np_ttn` (модуль `nova_poshta`), `payment_reminder` (модуль `finance`), `invoice` (модуль `finance`), `vchasno_upload` (модуль `vchasno`), `quote_sets` (модуль `quotes`), `manual_order` (модуль `orders`), `lead_reminder` (модуль `customers`).

Для кожної — `summary` одним рядком людською мовою й рівно три кроки «як зробити вперше». Пиши так, як людина це називає, а не як зветься таблиця.

`nova_poshta_address` познач `measurable: false`: у `tosho.customers` немає колонки автора зміни, тож достовірної проби для неї не існує.

- [ ] **Step 2: Додати проби для нових вимірюваних ключів**

У `tosho.refresh_feature_adoption()` додай гілки:

```sql
    union all
    select 'payment_reminder', entered_by, count(*)::int, min(created_at), max(updated_at)
    from tosho.finance_expenses
    where reminder_lead_days is not null and entered_by is not null
    group by entered_by

    union all
    select 'invoice', created_by, count(*)::int, min(created_at), max(created_at)
    from tosho.finance_invoices where created_by is not null group by created_by

    union all
    select 'vchasno_upload', created_by, count(*)::int, min(created_at), max(created_at)
    from tosho.vchasno_documents where created_by is not null group by created_by

    union all
    select 'quote_sets', created_by, count(*)::int, min(created_at), max(created_at)
    from tosho.quote_sets where created_by is not null group by created_by

    union all
    select 'np_ttn', manager_user_id, count(*)::int, min(created_at), max(np_ttn_created_at)
    from tosho.orders where np_ttn_number is not null and manager_user_id is not null
    group by manager_user_id

    union all
    select 'manual_order', manager_user_id, count(*)::int, min(created_at), max(created_at)
    from tosho.orders where quote_id is null and manager_user_id is not null
    group by manager_user_id

    union all
    select 'lead_reminder', manager_user_id, count(*)::int, min(created_at), max(updated_at)
    from tosho.leads where reminder_at is not null and manager_user_id is not null
    group by manager_user_id
```

- [ ] **Step 3: Перезастосувати функцію й перерахувати**

```bash
set -a && . ./.env.backup && set +a && psql "$BACKUP_DB_URL" -f scripts/feature-adoption-schema.sql -c "select tosho.refresh_feature_adoption();" -c "select feature_key, count(*) users from tosho.feature_adoption group by 1 order by users desc;"
```

Expected: `np_ttn` і `manual_order` не зʼявляться взагалі — по них нуль використань, і це очікувано (саме про це дизайн-док). Решта нових ключів дадуть 1–4 користувачі.

- [ ] **Step 4: Прогнати всі перевірки**

Run: `npm run check:feature-keys && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: усі чотири без помилок. Тест «у кожної можливості рівно три кроки» з Task 1 накриє нові записи автоматично.

- [ ] **Step 5: Коміт**

```bash
git add src/lib/featureCatalog.ts scripts/feature-adoption-schema.sql
git commit -m "feat(features): описи можливостей із низьким освоєнням"
```

---

## Завершення фази

- [ ] **Повний прогін:** `npx vitest run && npx tsc --noEmit && npm run lint && npm run check:feature-keys`
- [ ] **Звіт Артему:** перелічити накопичені коміти й дочекатися команди «пушимо». Самостійно `git push` НЕ робити.
- [ ] **Не забути:** SQL із Task 3 і Task 8 застосовується на проді окремо від пушу — на момент деплою фронтенду таблиця вже має існувати, інакше сторінка впаде на запиті.
