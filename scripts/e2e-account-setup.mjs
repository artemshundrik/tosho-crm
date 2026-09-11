#!/usr/bin/env node
/**
 * Службовий акаунт для наскрізних перевірок — «Тиць Клікович» (REQ-147).
 *
 * НАВІЩО. Playwright у проєкті налаштований повністю, але без облікового
 * запису не стартує: досі перевірка очима йшла під живою сесією Артема, а
 * коли вона відходила — дивитись не було чим. Обв'язка (`e2e/globalSetup.ts`,
 * `e2e/writeGuard.ts`) давно написана; бракувало рівно одного — акаунта.
 *
 * ЧОМУ СКРИПТ, А НЕ КАБІНЕТ SUPABASE. Пароль тут ніхто не набирає й ніхто не
 * бачить: 24 випадкові байти народжуються в пам'яті процесу, їдуть в admin API
 * і лягають у `.env.local`. У відповідь скрипт друкує все, крім пароля, —
 * тож він не осідає ні в історії команд, ні в стенограмі сесії, ні в буфері.
 * Репозиторій ПУБЛІЧНИЙ, і це головна причина такої обережності.
 *
 * ЩО СТВОРЮЄТЬСЯ, крім самого користувача:
 *   - `tosho.memberships` — роль admin + посада СЕО (посада СЕО відкриває всі
 *     модулі, тож знімки не впираються в «немає доступу»);
 *   - `public.team_members` — без цього рядка RLS (`is_team_member`) не дасть
 *     прочитати НІЧОГО, скільки б доступів не стояло в профілі;
 *   - `tosho.team_member_profiles` — ім'я, аватарка-робот, усі модулі;
 *   - `tosho.user_profiles` — пошта й ім'я (тригера на auth.users немає,
 *     рядок пишеться кодом застосунку, тож пишемо самі).
 *
 * ЗАПИС У ПРОД ЦЕЙ АКАУНТ НЕ РІЖЕ. Прав у нього як у СЕО, і від записів його
 * стримує лише `e2e/writeGuard.ts` на рівні браузера. Тому пароль живе тільки
 * в `.env.local` та секретах GitHub, а сторожа не «вимикають на хвилинку».
 *
 * Запуск:
 *   node scripts/e2e-account-setup.mjs
 *   node scripts/e2e-account-setup.mjs --dry   (показати план і вийти)
 *
 * Повторний запуск безпечний: наявний акаунт не переробляється, рядки доступу
 * доводяться до потрібного вигляду, пароль не перевипускається. Загубився
 * пароль — `--reset-password` видасть новий і перепише `.env.local`.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = resolve(REPO_ROOT, ".env.local");
const AVATAR_FILE = resolve(REPO_ROOT, "scripts/assets/e2e-bot-avatar.svg");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const resetPassword = args.includes("--reset-password");

/** Хто це такий. Ім'я навмисно неживе — у «Команді» видно, що це не людина. */
const ACCOUNT = {
  email: process.env.E2E_ACCOUNT_EMAIL ?? "e2e@tosho.pro",
  firstName: "Тиць",
  lastName: "Клікович",
  jobRole: "seo",
  workspaceRole: "admin",
  teamRole: "super_admin",
};
ACCOUNT.fullName = `${ACCOUNT.firstName} ${ACCOUNT.lastName}`;

const BIO =
  "Службовий акаунт Playwright. Уміє лише дивитись і тицяти — писати не дає writeGuard. " +
  "Зарплати не просить, у відпустку не ходить, вийти з прод-бази не забуває.";

// ── .env.local ──────────────────────────────────────────────────────────────

function loadLocalEnv() {
  if (!existsSync(ENV_FILE)) return;
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/**
 * Дописати пару рядків у `.env.local`, не зачепивши решти файлу.
 *
 * Значення сюди приходить одне — пароль, — і саме тому функція нічого не
 * повертає й нічого не друкує: єдиний слід значення має лишитись у файлі.
 */
function writeEnvPair(pairs) {
  const raw = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  let lines = raw.split("\n");
  for (const [key, value] of Object.entries(pairs)) {
    const index = lines.findIndex((line) => line.trim().startsWith(`${key}=`));
    const next = `${key}=${value}`;
    if (index >= 0) lines[index] = next;
    else lines.push(next);
  }
  // Хвостовий порожній рядок один, скільки б разів скрипт не бігав.
  while (lines.length > 1 && lines.at(-1) === "" && lines.at(-2) === "") lines.pop();
  if (lines.at(-1) !== "") lines.push("");
  writeFileSync(ENV_FILE, lines.join("\n"), { mode: 0o600 });
}

// ── Supabase ────────────────────────────────────────────────────────────────

loadLocalEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const AVATAR_BUCKET = process.env.VITE_SUPABASE_AVATAR_BUCKET ?? "avatars";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Немає SUPABASE_URL або SUPABASE_SERVICE_ROLE_KEY. Обидва лежать у .env.local — саме там їх і шукає скрипт."
  );
  process.exit(1);
}

const baseHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function api(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...baseHeaders, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    // Тіло відповіді Supabase секретів не містить, а без нього причина відмови
    // втрачається й лишається голий код — далі гадати.
    throw new Error(`${init.method ?? "GET"} ${path} → ${response.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

/** PostgREST: схема tosho, а не public, — див. AGENTS.md. */
function rest(path, { method = "GET", body, schema = "tosho", prefer } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (method === "GET") headers["Accept-Profile"] = schema;
  else headers["Content-Profile"] = schema;
  if (prefer) headers.Prefer = prefer;
  return api(`/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function findUserByEmail(email) {
  // admin/users віддає сторінками; команда мала, тож однієї сторінки досить.
  const page = await api(`/auth/v1/admin/users?per_page=200`, { method: "GET" });
  const users = Array.isArray(page?.users) ? page.users : [];
  return users.find((user) => (user.email ?? "").toLowerCase() === email.toLowerCase()) ?? null;
}

async function main() {
  const [workspaceRow] = await rest("memberships?select=workspace_id&role=eq.owner&limit=1");
  const [ownerRow] = await rest("memberships?select=user_id&role=eq.owner&limit=1");
  const [teamRow] = await rest("team_members?select=team_id&limit=1", { schema: "public" });

  if (!workspaceRow || !ownerRow || !teamRow) {
    throw new Error("Не знайшов workspace_id / team_id у базі — перевір доступ службовим ключем.");
  }
  const workspaceId = workspaceRow.workspace_id;
  const teamId = teamRow.team_id;
  const ownerId = ownerRow.user_id;

  console.log(`Робочий простір: ${workspaceId}`);
  console.log(`Команда:         ${teamId}`);
  console.log(`Акаунт:          ${ACCOUNT.fullName} <${ACCOUNT.email}>, посада ${ACCOUNT.jobRole}`);

  if (dryRun) {
    console.log("\n--dry: нічого не створював.");
    return;
  }

  // 1. Користувач ───────────────────────────────────────────────────────────
  let user = await findUserByEmail(ACCOUNT.email);
  let passwordWritten = false;

  if (!user) {
    const password = randomBytes(24).toString("base64url");
    user = await api("/auth/v1/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: ACCOUNT.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: ACCOUNT.fullName, description: BIO, service_account: true },
      }),
    });
    writeEnvPair({ E2E_EMAIL: ACCOUNT.email, E2E_PASSWORD: password });
    passwordWritten = true;
    console.log("Користувача створено.");
  } else if (resetPassword) {
    const password = randomBytes(24).toString("base64url");
    await api(`/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    writeEnvPair({ E2E_EMAIL: ACCOUNT.email, E2E_PASSWORD: password });
    passwordWritten = true;
    console.log("Пароль перевипущено.");
  } else {
    console.log("Користувач уже є — пароль не чіпав.");
  }

  const userId = user.id;

  // 2. Аватарка ─────────────────────────────────────────────────────────────
  // Один файл без суфікса розміру: AvatarBase підміняє xs/md/hero тільки тоді,
  // коли суфікс у шляху є, — інакше бере як є. Векторний, тож масштаб дарма.
  const avatarPath = `${AVATAR_BUCKET}/${userId}/bot.svg`;
  await api(`/storage/v1/object/${avatarPath}`, {
    method: "POST",
    headers: { "Content-Type": "image/svg+xml", "x-upsert": "true" },
    body: readFileSync(AVATAR_FILE),
  });
  console.log("Аватарку завантажено.");

  // 3. Доступи ──────────────────────────────────────────────────────────────
  const existingMembership = await rest(
    `memberships?select=id&user_id=eq.${userId}&workspace_id=eq.${workspaceId}`
  );
  if (existingMembership.length === 0) {
    await rest("memberships", {
      method: "POST",
      body: {
        workspace_id: workspaceId,
        user_id: userId,
        role: ACCOUNT.workspaceRole,
        job_role: ACCOUNT.jobRole,
        // created_by за замовчуванням auth.uid(), а під службовим ключем це
        // NULL — колонка NOT NULL, тож підписуємо власником явно.
        created_by: ownerId,
      },
      prefer: "return=minimal",
    });
  } else {
    await rest(`memberships?id=eq.${existingMembership[0].id}`, {
      method: "PATCH",
      body: { role: ACCOUNT.workspaceRole, job_role: ACCOUNT.jobRole },
      prefer: "return=minimal",
    });
  }

  await rest("team_members?on_conflict=team_id,user_id", {
    method: "POST",
    schema: "public",
    body: { team_id: teamId, user_id: userId, role: ACCOUNT.teamRole },
    prefer: "resolution=merge-duplicates,return=minimal",
  });

  const moduleAccess = Object.fromEntries(
    [
      "overview", "customers", "quotes", "orders", "shipping", "catalog", "logistics",
      "design", "contractors", "stock", "finance", "payroll", "vchasno", "vchasno_send",
      "marketing", "team", "members_access", "nova_poshta", "pulse", "dev",
    ].map((key) => [key, true])
  );

  await rest("team_member_profiles?on_conflict=workspace_id,user_id", {
    method: "POST",
    body: {
      workspace_id: workspaceId,
      user_id: userId,
      first_name: ACCOUNT.firstName,
      last_name: ACCOUNT.lastName,
      full_name: ACCOUNT.fullName,
      employment_status: "active",
      availability_status: "available",
      module_access: moduleAccess,
      avatar_path: avatarPath,
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });

  await rest("user_profiles?on_conflict=user_id", {
    method: "POST",
    body: { user_id: userId, email: ACCOUNT.email, full_name: ACCOUNT.fullName },
    prefer: "resolution=merge-duplicates,return=minimal",
  });

  console.log("Доступи проставлено.");
  console.log(`\nuser_id: ${userId}`);
  console.log(
    passwordWritten
      ? "Пошта й пароль дописані в .env.local. Я їх не бачив і нікуди більше не клав."
      : "E2E_EMAIL / E2E_PASSWORD у .env.local лишились як були."
  );
  console.log(
    "Цей user_id має бути в PAYROLL_EXCLUDED_USER_IDS (src/lib/payroll.ts) — інакше бот стане в зарплатну відомість."
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
