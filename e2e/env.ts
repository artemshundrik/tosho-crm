import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Читач `.env.local` для наскрізних перевірок.
 *
 * ЧОМУ СВІЙ, А НЕ dotenv. Заради трьох рядків тягнути залежність у проєкт, де
 * її більше ніде не треба, — зайве: збірка бере змінні від Vite, функції — від
 * Netlify, і `dotenv` знадобився б рівно тут. Формат читаємо мінімальний:
 * `КЛЮЧ=значення`, коментарі з `#`, лапки знімаємо.
 *
 * Секрети сюди НЕ комітяться: `.env.local` під `*.local` у .gitignore, а репо
 * публічне (див. пам'ять «Репо ПУБЛІЧНЕ»).
 */
export function loadLocalEnv(): void {
  const file = resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return;

  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    // Змінна з оточення сильніша за файл: у CI значення приходять із секретів.
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/** Хост Supabase — щоб знати, які запити глушити. Без нього сторож сліпий. */
export function supabaseHost(): string {
  const raw = process.env.VITE_SUPABASE_URL ?? "";
  try {
    return new URL(raw).host;
  } catch {
    return "";
  }
}

export const AUTH_STATE_FILE = ".auth/state.json";
