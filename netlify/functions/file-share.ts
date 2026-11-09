import { randomInt } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { buildAppUrl } from "./_lib/appUrl";
import { renderFileSharePage, renderFileShareUnavailablePage } from "./_lib/fileSharePage";
import { parseBody } from "./_lib/parseBody";

/**
 * Короткі посилання на файли для замовника (картка 357).
 *
 * POST: менеджер створює посилання. Вхід обов'язковий, а право на КОЖЕН файл
 *       перевіряє саме сховище: підписуємо його від імені менеджера.
 * GET:  публічна сторінка /f/<code>. Перепустка тут сам код (~59 біт випадковості),
 *       а доступ до файлу видається на годину при кожному відкритті, тож
 *       сторінка живе весь свій термін, а файлові адреси в ній не осідають.
 */

type HttpEvent = {
  httpMethod?: string;
  path?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
};

type ShareFile = { bucket: string; path: string; name: string };

const BUCKET = "attachments";
const LINK_TTL_DAYS = 30;
const ACCESS_TTL_SECONDS = 60 * 60;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const CODE_PATTERN = /^[A-Za-z0-9]{10}$/;
const SHARE_ROUTE_PATTERN = /^\/f\/([A-Za-z0-9]{10})(?:\/(d|p)\/(\d{1,2}))?\/?$/;
// % ? # \ відсікаємо, бо сховище розкодує шлях уже після цієї перевірки.
const TEAM_PATH_PATTERN = /^teams\/([0-9a-f-]{36})\/(?!.*\.\.)[^%?#\\]+$/i;

const requestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    files: z
      .array(
        z
          .object({
            bucket: z.literal(BUCKET),
            path: z.string().min(1).max(1024),
            name: z.string().trim().min(1).max(255),
          })
          .strict()
      )
      .min(1)
      .max(30),
  })
  .strict();

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

const html = (statusCode: number, body: string) => ({
  statusCode,
  headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self' https:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  },
  body,
});

const redirect = (location: string) => ({
  statusCode: 302,
  headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  body: "",
});

const unavailable = () => html(404, renderFileShareUnavailablePage());

const generateCode = () =>
  Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

const previewCandidates = (file: ShareFile) => {
  const basename = file.path.replace(/\.[^./]+$/, "");
  const candidates = [`${basename}__preview.webp`, `${basename}__preview.png`];
  if (/\.(png|jpe?g|webp|gif)$/i.test(file.path)) candidates.push(file.path);
  return candidates;
};

async function signPreview(admin: SupabaseClient, file: ShareFile): Promise<string | null> {
  for (const path of previewCandidates(file)) {
    const { data } = await admin.storage.from(file.bucket).createSignedUrl(path, ACCESS_TTL_SECONDS);
    if (data?.signedUrl) return data.signedUrl;
  }
  return null;
}

const downloadName = (name: string) =>
  name.replace(/[\r\n]+/g, " ").replace(/[\\/:*?"<>|&=#%]/g, "_").trim() || "file";

async function handleCreate(event: HttpEvent, admin: SupabaseClient, supabaseUrl: string, anonKey: string) {
  const header = event.headers?.authorization || event.headers?.Authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return json(401, { error: "Missing Authorization token" });

  const parsed = parseBody(event.body, requestSchema);
  if (!parsed.ok) return json(400, { error: parsed.error });

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: "Unauthorized" });

  const teamIds = new Set(parsed.data.files.map((file) => TEAM_PATH_PATTERN.exec(file.path)?.[1] ?? ""));
  const teamId = [...teamIds][0];
  if (teamIds.size !== 1 || !teamId) return json(403, { error: "Forbidden" });

  const access = await Promise.all(
    parsed.data.files.map((file) => userClient.storage.from(file.bucket).createSignedUrl(file.path, 60))
  );
  if (access.some((result) => result.error || !result.data?.signedUrl)) {
    return json(403, { error: "Forbidden" });
  }

  const { data: profile } = await admin
    .schema("tosho")
    .from("team_member_profiles")
    .select("full_name, first_name, last_name")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle();
  const managerName =
    profile?.first_name?.trim() || profile?.full_name?.trim() || profile?.last_name?.trim() || null;

  const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateCode();
    const { error } = await admin.schema("tosho").from("file_share_links").insert({
      code,
      team_id: teamId,
      title: parsed.data.title,
      files: parsed.data.files,
      created_by: userData.user.id,
      created_by_name: managerName,
      expires_at: expiresAt,
    });
    if (!error) return json(200, { url: buildAppUrl(`/f/${code}`), expiresAt });
    if (error.code !== "23505") {
      console.error("file-share: insert failed", error.message);
      return json(500, { error: "Не вдалося створити посилання" });
    }
  }
  return json(500, { error: "Не вдалося створити посилання" });
}

async function handlePublic(event: HttpEvent, admin: SupabaseClient) {
  // Netlify при переписуванні /f/… не передає параметри з правила, тож читаємо адресу.
  const route = SHARE_ROUTE_PATTERN.exec(event.path ?? "");
  const query: Record<string, string | undefined> = {
    ...event.queryStringParameters,
    ...(route ? { code: route[1], ...(route[2] ? { [route[2]]: route[3] } : {}) } : {}),
  };
  const code = query.code ?? "";
  if (!CODE_PATTERN.test(code)) return unavailable();

  const { data: link } = await admin
    .schema("tosho")
    .from("file_share_links")
    .select("code, title, files, created_by_name, expires_at")
    .eq("code", code)
    .maybeSingle();
  if (!link || new Date(link.expires_at).getTime() <= Date.now()) return unavailable();

  const files = link.files as ShareFile[];
  const pick = (raw: string | undefined) => (raw && /^\d{1,2}$/.test(raw) ? files[Number(raw)] : undefined);

  if (query.d !== undefined) {
    const file = pick(query.d);
    if (!file) return unavailable();
    const { data } = await admin.storage
      .from(file.bucket)
      .createSignedUrl(file.path, ACCESS_TTL_SECONDS);
    // Назву дописуємо самі: опція download клієнта кодує кирилицю двічі.
    return data?.signedUrl
      ? redirect(`${data.signedUrl}&download=${encodeURIComponent(downloadName(file.name))}`)
      : unavailable();
  }

  if (query.p !== undefined) {
    const file = pick(query.p);
    const url = file ? await signPreview(admin, file) : null;
    return url ? redirect(url) : { statusCode: 404, headers: { "Cache-Control": "no-store" }, body: "" };
  }

  const previews = await Promise.all(files.map((file) => signPreview(admin, file)));
  return html(
    200,
    renderFileSharePage({
      code,
      baseUrl: buildAppUrl("/").replace(/\/$/, ""),
      title: link.title,
      managerName: link.created_by_name,
      expiresAt: link.expires_at,
      files: files.map((file, index) => ({ name: file.name, hasPreview: Boolean(previews[index]) })),
    })
  );
}

export const handler = async (event: HttpEvent) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return json(500, { error: "Missing Supabase env vars" });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  if (event.httpMethod === "POST") return handleCreate(event, admin, supabaseUrl, anonKey);
  if (event.httpMethod === "GET" || event.httpMethod === "HEAD") return handlePublic(event, admin);
  return json(405, { error: "Method Not Allowed" });
};
