import type { z } from "zod";

/**
 * Розбір і ПЕРЕВІРКА тіла запиту однією дією.
 *
 * ЩО ЛІКУЄ. Двадцять дві функції читали тіло так:
 *
 *     payload = JSON.parse(event.body ?? "{}") as RequestBody;
 *
 * Перевірялось лише те, чи це взагалі JSON. Чи є в ньому потрібні поля й чи
 * того вони типу — ніхто не питав, а `as` — це обіцянка компілятору, яку ніхто
 * не тримає. Запит без поля йшов далі з `undefined`: у кращому разі падав з
 * 500 десь усередині, у гіршому — тихо робив не те. Серед цих функцій
 * запрошення в команду, зміна доступів і посад, Dropbox, Вчасно.
 *
 * ЩО ДАЄ. Одна перевірка на межі: не збіглось — 400 із поясненням, ЯКЕ саме
 * поле не таке, і жодної дії. Збіглось — далі йде значення з виведеним типом,
 * без ручного приведення.
 *
 * ЧОМУ ПОВЕРТАЄ СОЮЗ, А НЕ КИДАЄ. Функції тут пишуть відповідь самі й кожна
 * своїм `jsonResponse` (заголовки CORS у них різні). Хелпер віддає або дані,
 * або готове тіло помилки — а формат відповіді лишається за функцією.
 *
 * ЧОМУ ПОВІДОМЛЕННЯ ДЕТАЛЬНЕ. Це внутрішні функції CRM, і той, хто натрапить
 * на 400, — наш же клієнт або наш же крон. «Bad request» без подробиць
 * коштував би години на пошук; шлях поля та причина економлять їх одразу.
 */
export type ParsedBody<T> = { ok: true; data: T } | { ok: false; error: string };

export function parseBody<T>(rawBody: string | null | undefined, schema: z.ZodType<T>): ParsedBody<T> {
  let json: unknown;
  try {
    json = JSON.parse(rawBody ?? "{}");
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }

  const result = schema.safeParse(json);
  if (result.success) return { ok: true, data: result.data };

  const details = result.error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
  return { ok: false, error: details || "Invalid request body" };
}
