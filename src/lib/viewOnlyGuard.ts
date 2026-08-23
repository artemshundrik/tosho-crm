/**
 * Гальмо на записи в режимі перегляду («Дивитись як → очима людини»).
 *
 * Навіщо. У режимі перегляду підмінюється лише інтерфейс — сесія в Supabase
 * лишається власною, тож будь-яка кнопка, натиснута «в чужій шкірі», справді
 * виконає дію. Це не діра в правах (owner і так має ці права, просто вийшовши
 * з режиму), а пастка для людини: клацнув, не подумавши, і в базі зʼявився
 * запис, зроблений ніби від імені того, на кого ти дивишся.
 *
 * Чому в одній точці. `supabase` і `db` уже проксі (див. supabaseClient.ts),
 * тож перехопити записи можна тут, а не обходити двісті кнопок по сторінках.
 * Ціна помилки в обході була б висока: пропущена кнопка мовчки лишається
 * робочою, і про це ніхто не дізнається.
 *
 * ⚠️ Це зручність, а не безпека. Гальмо живе в браузері й знімається виходом
 * із режиму. Захист даних — це RLS, і доводиться він симуляцією ролі в psql.
 */

export const VIEW_ONLY_BLOCKED_EVENT = "view-only:blocked";
export const VIEW_ONLY_MESSAGE = "Режим перегляду: дії вимкнені, поки ви дивитесь чужими очима";

let viewOnly = false;

export const isViewOnly = () => viewOnly;

export function setViewOnlyMode(next: boolean) {
  viewOnly = next;
}

function announce(what: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(VIEW_ONLY_BLOCKED_EVENT, { detail: { what } }));
}

/**
 * Конструктор запиту Supabase не має спільного типу: набір методів залежить від
 * таблиці, а ланцюжок будується на льоту. Заглушка мусить прикидатись будь-яким
 * із них, тож `any` тут не лінь, а спосіб не переписувати генерики postgrest-js
 * у себе. Один аліас на весь файл — щоб це рішення було видно один раз.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryLike = any;

/** Помилка у формі, яку код уже вміє показувати: `{ data, error }`, а не виняток. */
function viewOnlyError(what: string) {
  return {
    message: VIEW_ONLY_MESSAGE,
    details: what,
    hint: "Вийдіть із режиму перегляду, щоб виконати дію",
    code: "VIEW_ONLY",
  };
}

/**
 * Заглушка замість конструктора запиту.
 *
 * Ланцюжок `.insert(...).select().single()` має дожити до `await`, тому будь-який
 * метод повертає ту саму заглушку, а `await` віддає звичайний `{ data, error }`.
 * Кидати виняток не можна: половина сторінок не має try/catch навколо запису й
 * упала б у порожній екран замість тосту.
 */
function blockedBuilder(what: string): QueryLike {
  announce(what);
  const result = {
    data: null,
    error: viewOnlyError(what),
    count: null,
    status: 423,
    statusText: "View only",
  };
  const settled = Promise.resolve(result);
  const proxy: QueryLike = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return (...args: unknown[]) => (settled as QueryLike).then(...args);
        if (prop === "catch") return (...args: unknown[]) => (settled as QueryLike).catch(...args);
        if (prop === "finally") return (...args: unknown[]) => (settled as QueryLike).finally(...args);
        return () => proxy;
      },
    }
  );
  return proxy;
}

const WRITE_METHODS = new Set(["insert", "update", "upsert", "delete"]);

/**
 * RPC, які щось МІНЯЮТЬ. Перелік, а не «дозволено лише читання».
 *
 * Спершу тут був білий список читальних, і це виявилось помилкою: частина
 * викликів іде не літералом, а змінною (`workspace.ts` → `my_workspace_id`,
 * `toshoRpc.ts` → будь-яка назва), тож у режимі перегляду відвалився контекст
 * автентифікації — застосунок не міг дізнатись власний workspace. Помилитись
 * можна двома способами, і вони не рівноцінні: пропущений читальний RPC ЛАМАЄ
 * застосунок, а пропущений записувальний лише лишає кнопку робочою. Режим —
 * це зручність («не наробити випадково»), а не межа безпеки, тож обираємо
 * другий бік помилки.
 *
 * Лічильники номерів тут теж: вони інкрементують послідовність, тобто пишуть.
 * Замки сутностей — свідомо: захоплювати замок, поки ти лише дивишся, означає
 * тримати чужу картку зайнятою.
 */
const MUTATING_RPCS = new Set([
  "accept_workspace_invite",
  "acquire_entity_lock",
  "adjust_sample_stock_item",
  "archive_activity_log_all",
  "bot_submit_absence",
  "capture_admin_observability_snapshot",
  "force_release_entity_lock",
  "next_design_task_number",
  "next_dev_request_number",
  "next_document_number",
  "release_entity_lock",
  "request_entity_lock_release",
  "set_quote_status",
]);

const STORAGE_WRITE_METHODS = new Set([
  "upload",
  "uploadToSignedUrl",
  "update",
  "move",
  "copy",
  "remove",
  "createSignedUploadUrl",
]);

/** Обгортка над результатом `.from(table)`. */
export function guardTableBuilder(builder: unknown, table: string): QueryLike {
  if (!viewOnly || !builder || typeof builder !== "object") return builder;
  return new Proxy(builder as object, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && WRITE_METHODS.has(prop)) {
        return () => blockedBuilder(`${prop} ${table}`);
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * Обгортка над клієнтом схеми: `supabase.schema("tosho")` повертає НОВИЙ обʼєкт,
 * повз проксі в supabaseClient.ts. Без цього гальмо обходили б 54 місця, які
 * пишуть саме так, — і мовчки, бо жодної помилки там не було б.
 */
export function guardPostgrestClient(client: unknown): QueryLike {
  if (!viewOnly || !client || typeof client !== "object") return client;
  return new Proxy(client as object, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      if (prop === "from") {
        return (...args: unknown[]) =>
          guardTableBuilder(
            (value as (...a: unknown[]) => unknown).apply(target, args),
            String(args[0] ?? "таблиця")
          );
      }

      if (prop === "rpc") {
        return (...args: unknown[]) => {
          const name = String(args[0] ?? "");
          if (isBlockedRpc(name)) return blockedRpc(name);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }

      return (value as (...a: unknown[]) => unknown).bind(target);
    },
  });
}

/** Обгортка над результатом `supabase.storage.from(bucket)`. */
export function guardStorageBucket(bucket: unknown, name: string): QueryLike {
  if (!viewOnly || !bucket || typeof bucket !== "object") return bucket;
  return new Proxy(bucket as object, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && STORAGE_WRITE_METHODS.has(prop)) {
        return async () => {
          announce(`storage.${prop} ${name}`);
          return { data: null, error: viewOnlyError(`storage.${prop} ${name}`) };
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export const isBlockedRpc = (name: string) => viewOnly && MUTATING_RPCS.has(name);

export const blockedRpc = (name: string) => blockedBuilder(`rpc ${name}`);

/**
 * Netlify-функції ходять повз клієнт Supabase, звичайним `fetch`, тож їх
 * перехоплюємо окремо. Читання (GET/HEAD) лишаємо: половина функцій нічого не
 * змінює, а без них сторінки просто порожні.
 */
export function installViewOnlyFetchGuard() {
  if (typeof window === "undefined") return;
  const flagged = window as unknown as { __viewOnlyFetchGuard?: boolean };
  if (flagged.__viewOnlyFetchGuard) return;
  flagged.__viewOnlyFetchGuard = true;

  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (viewOnly) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (url.includes("/.netlify/functions/") && method !== "GET" && method !== "HEAD") {
        const name = url.split("/.netlify/functions/")[1]?.split(/[?#]/)[0] ?? "функція";
        announce(`${method} ${name}`);
        return Promise.resolve(
          new Response(JSON.stringify({ error: VIEW_ONLY_MESSAGE, code: "VIEW_ONLY" }), {
            status: 423,
            statusText: "View only",
            headers: { "content-type": "application/json" },
          })
        );
      }
    }
    return original(input as RequestInfo, init);
  };
}
