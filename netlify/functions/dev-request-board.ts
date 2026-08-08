import { createClient } from "@supabase/supabase-js";

import { buildAppUrl } from "./_lib/appUrl";
import {
  BOARD_PATH,
  buildBoardListResponse,
  buildBoardMoveResponse,
  cardNotFoundMessage,
  fetchOpenBoardCards,
  moveBoardCard,
  parseBoardBody,
} from "./_lib/devRequestBoard";
import { CAPTURE_TOKEN_HEADER, isUuid, readHeader, tokenMatches } from "./_lib/devRequestCapture";

// Черга запитів ззовні CRM: `POST { "action": "list" }` — подивитись, що
// відкрито; `POST { "action": "move", "number": 3, "status": "in_progress" }` —
// пересунути картку.
//
// НАВІЩО ОКРЕМА ФУНКЦІЯ, А НЕ РЕЖИМ У dev-request-capture. У захоплення рівно
// одна відповідальність — прийняти сказане й записати картку. Воно платить за
// розбір моделлю, логує вартість і не читає нічого. Дописати туди читання й
// керування означало б, що один вхід робить три різні речі з трьома різними
// профілями відмов, і будь-яка правка одного зачіпає решту.
//
// Токен і змінні оточення — ТІ САМІ (DEV_REQUEST_CAPTURE_TOKEN /
// DEV_REQUEST_CAPTURE_USER_ID): користувач один, власник, і другий секрет був
// би зайвою річчю в 1Password без жодного виграшу.
//
// ЩО МІНЯЄ ЦЕЙ ТОКЕН порівняно із захопленням: раніше ним можна було лише
// писати нові картки, тепер — ще й читати чергу (включно з приватними картками)
// й міняти статуси. Тобто ціна витоку виросла зі спаму на дошці до читання
// приватних запитів. Це свідомий обмін: інакше черги з телефона немає взагалі.
//
// CORS свідомо немає: викликає код Cowork, а не браузер.

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

function trimmed(value?: string | null): string {
  return (value ?? "").trim();
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  // Fail-closed, як і в захопленні: немає бодай однієї змінної — функція не
  // робить нічого. «Поки не налаштовано — пускаємо» тут означало б відкриту на
  // весь інтернет чергу запитів.
  const expectedToken = trimmed(process.env.DEV_REQUEST_CAPTURE_TOKEN);
  const ownerUserId = trimmed(process.env.DEV_REQUEST_CAPTURE_USER_ID);
  if (!expectedToken || !ownerUserId || !isUuid(ownerUserId)) {
    const reasons = [
      !expectedToken && "DEV_REQUEST_CAPTURE_TOKEN is not set",
      !ownerUserId && "DEV_REQUEST_CAPTURE_USER_ID is not set",
      ownerUserId && !isUuid(ownerUserId) && "DEV_REQUEST_CAPTURE_USER_ID is not a uuid",
    ].filter(Boolean);
    console.error("dev-request-board disabled:", reasons.join("; "));
    return json(503, { error: "Черга запитів не налаштована." });
  }

  if (!tokenMatches(readHeader(event.headers, CAPTURE_TOKEN_HEADER), expectedToken)) {
    return json(401, { error: "Unauthorized" });
  }

  const parsed = parseBoardBody(event.body);
  if (!parsed.ok) return json(parsed.status, { error: parsed.error });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Missing Supabase env vars" });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // team_id — ключ, на якому живуть і картки, і їхня нумерація. workspace_id
  // тут не потрібен: ні розбору, ні журналу вартості в цій функції немає.
  const { data: teamMember, error: teamError } = await admin
    .from("team_members")
    .select("team_id")
    .eq("user_id", ownerUserId)
    .maybeSingle();

  const teamId = (teamMember?.team_id as string | undefined) ?? null;
  if (!teamId) {
    console.error("dev-request-board: no team_id for", ownerUserId, teamError?.message ?? "");
    return json(500, { error: "Не можу визначити команду власника в CRM." });
  }

  const url = buildAppUrl(BOARD_PATH);

  try {
    if (parsed.action === "list") {
      const { cards, hasMore } = await fetchOpenBoardCards(admin, teamId);
      return json(200, buildBoardListResponse({ cards, hasMore, url }));
    }

    const result = await moveBoardCard(admin, teamId, parsed.number, parsed.status);
    if (!result.ok) {
      if (result.reason === "not_found") {
        return json(404, { error: cardNotFoundMessage(parsed.number) });
      }
      console.error("dev-request-board move failed:", result.message);
      return json(500, { error: "Не зміг пересунути картку. Спробуй ще раз за хвилину." });
    }

    return json(200, buildBoardMoveResponse({ card: result.card, previousStatus: result.previousStatus, url }));
  } catch (error) {
    console.error("dev-request-board failed:", error instanceof Error ? error.message : error);
    return json(500, { error: "Не зміг прочитати чергу. Спробуй ще раз за хвилину." });
  }
};
