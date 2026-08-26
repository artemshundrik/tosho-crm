import { createClient } from "@supabase/supabase-js";

import { chatCostUsd } from "./_aiPricing";
import { logAiUsage } from "./_aiUsageLog";
import { buildAppUrl } from "./_lib/appUrl";
import {
  fetchMergeCandidates,
  findCardByLabel,
  formatMergeDate,
  mergeIntoBoardCard,
  type BoardCard,
} from "./_lib/devRequestBoard";
import {
  buildCaptureMergeResponse,
  buildCaptureResponse,
  CAPTURE_BOARD_PATH,
  CAPTURE_DUPLICATE_MESSAGE,
  CAPTURE_TOKEN_HEADER,
  isUuid,
  parseCaptureBody,
  readHeader,
  tokenMatches,
} from "./_lib/devRequestCapture";
import { draftDevRequest } from "./_lib/devRequestDraft";

// Захоплення задачі ззовні CRM: `POST { "text": "..." }` → картка в «Запитах».
//
// НАВІЩО. Власник заводить задачі з Claude Cowork: надиктовує фразу або кидає
// скріншот, Cowork розпізнає текст і має надіслати його нам. Cowork уміє
// виконувати код і робити HTTP-запити, тож окремий MCP-сервер тут зайвий — досить
// одного ендпоінта з персональним токеном.
//
// КОРИСТУВАЧ РІВНО ОДИН — власник. Тому ні таблиці ключів, ні прив'язки токена до
// людини: і секрет, і uuid автора приходять з оточення. Токен видає право писати
// картки ВІД ІМЕНІ цієї однієї людини й нічого більше — прочитати ним нічого не
// можна, тож витік коштує спаму на дошці, а не даних.
//
// Розбір (промпт, карта CRM, валідація напрямку) спільний із вікном створення й
// Telegram-ботом — _lib/devRequestDraft.ts. Тут лишається те, що властиве цьому
// входу: гейт по токену, вставка картки та відповідь, придатна до показу власнику.
//
// ДВА ВИХОДИ, А НЕ ОДИН. Перед розбором читаємо відкриті картки й віддаємо їхні
// назви моделі. Назвала наявну — сказане дописується туди, лічильник «скільки
// разів просили» росте, нової картки не з'являється. Не назвала — усе як
// раніше. Відповідь у цих випадках різна навмисно: рішення ухвалює модель, і
// людина має побачити його одразу, а не знайти своє прохання чужим абзацом.
//
// CORS свідомо НЕМАЄ: викликає не браузер, а код Cowork. Заголовки доступу лише
// відкрили б шлях сторінці в чужій вкладці.

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

  // Fail-closed. Немає бодай однієї змінної — функція не робить НІЧОГО: ні
  // розбору, ні запису. «Поки не налаштовано — пропускаємо» тут означало б
  // відкритий на весь інтернет запис у базу.
  const expectedToken = trimmed(process.env.DEV_REQUEST_CAPTURE_TOKEN);
  const ownerUserId = trimmed(process.env.DEV_REQUEST_CAPTURE_USER_ID);
  if (!expectedToken || !ownerUserId || !isUuid(ownerUserId)) {
    // Деталі — лише в лог: назви змінних, яких бракує, не мають їхати назовні.
    const reasons = [
      !expectedToken && "DEV_REQUEST_CAPTURE_TOKEN is not set",
      !ownerUserId && "DEV_REQUEST_CAPTURE_USER_ID is not set",
      ownerUserId && !isUuid(ownerUserId) && "DEV_REQUEST_CAPTURE_USER_ID is not a uuid",
    ].filter(Boolean);
    console.error("dev-request-capture disabled:", reasons.join("; "));
    return json(503, { error: "Захоплення задач не налаштоване." });
  }

  if (!tokenMatches(readHeader(event.headers, CAPTURE_TOKEN_HEADER), expectedToken)) {
    return json(401, { error: "Unauthorized" });
  }

  const parsed = parseCaptureBody(event.body);
  if (!parsed.ok) return json(parsed.status, { error: parsed.error });
  const text = parsed.text;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Missing Supabase env vars" });

  const apiKey = trimmed(process.env.OPENAI_API_KEY);
  if (!apiKey) return json(503, { error: "Розбір задач зараз недоступний." });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // workspace_id для ролей і team_id для даних — це РІЗНІ ідентифікатори.
  // Ім'я беремо з team_member_profiles: memberships_view.full_name порожній.
  // Той самий резолв, що в гілці бота (telegram-webhook.ts) — власного способу
  // визначити команду тут немає й бути не має.
  const [membership, profile, teamMember] = await Promise.all([
    admin
      .schema("tosho")
      .from("memberships_view")
      .select("workspace_id")
      .eq("user_id", ownerUserId)
      .maybeSingle(),
    admin
      .schema("tosho")
      .from("team_member_profiles")
      .select("first_name,last_name")
      .eq("user_id", ownerUserId)
      .maybeSingle(),
    admin.from("team_members").select("team_id").eq("user_id", ownerUserId).maybeSingle(),
  ]);

  // team_id обов'язковий: на ньому і RLS картки, і лічильник номерів.
  // workspace_id — ні: без нього картка жива, лише історія змін нечитабельна.
  const teamId = (teamMember.data?.team_id as string | undefined) ?? null;
  if (!teamId) {
    console.error("dev-request-capture: no team_id for", ownerUserId, teamMember.error?.message ?? "");
    return json(500, { error: "Не можу визначити команду власника в CRM." });
  }
  const workspaceId = trimmed(membership.data?.workspace_id as string | undefined);
  const actorName =
    [profile.data?.first_name, profile.data?.last_name]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean)
      .join(" ") || null;

  const model = trimmed(process.env.OPENAI_MODEL) || "gpt-5.6-luna";

  // Кандидати на дубль. Доти сюди їх не передавали свідомо: вважалось, що в
  // Cowork людина не бачить дошки, тож підказка «схоже на REQ-17» лише
  // заплутає, а «дублікати зводить людина на дошці». Замір 26.08.2026 показав,
  // що обидві половини цього припущення хибні: 165 карток зі 168 прийшли саме
  // цим входом, а лічильник «скільки разів просили» дорівнював одиниці у ВСІХ
  // 168 — тобто не склеївся жоден дубль.
  //
  // Помилка читання дошки картку не втрачає: список лишається порожнім,
  // duplicateOf гасне сам собою (draftDevRequest не вірить назвам поза
  // переліком), і далі все йде як раніше — новою карткою.
  //
  // Приватні картки в переліку є, і їхні НАЗВИ їдуть у модель. Це той самий
  // обмін, що вже діє у вікні створення на дошці, і вхід відкритий рівно тим
  // людям, яким ці картки видно (docs/DEV_REQUESTS_DESIGN.md §8).
  let candidates: BoardCard[] = [];
  try {
    candidates = await fetchMergeCandidates(admin, teamId);
  } catch (error) {
    console.error(
      "dev-request-capture: merge candidates failed:",
      error instanceof Error ? error.message : error
    );
  }

  const result = await draftDevRequest({
    text,
    apiKey,
    model,
    openTitles: candidates.map((card) => ({ label: card.label, title: card.title })),
  });

  // Кости логуємо ДО перевірки на успіх: виклик оплачений незалежно від того,
  // чи вдалось розібрати відповідь.
  const cost = chatCostUsd(model, result.usage.inputTokens, result.usage.outputTokens);
  if (workspaceId) {
    await logAiUsage(admin, {
      workspaceId,
      userId: ownerUserId,
      actorName,
      kind: "chat",
      model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      costUsd: cost.costUsd,
      metadata: {
        source: "dev_request_cowork",
        priceKnown: cost.priceKnown,
        chars: result.text.length,
        drafted: result.ok,
        candidates: candidates.length,
      },
    });
  } else {
    console.error("ai_usage skipped: could not resolve workspace_id for user", ownerUserId);
  }

  const draft = result.draft;

  // Долучення до наявної картки замість нової — те, що docs/DEV_REQUESTS_DESIGN.md
  // §4.2 описує з першого дня («схожий запит не створює другу картку, а додає до
  // наявної рядок») і чого доти не робило жодне місце в коді.
  //
  // Друга перевірка підпису тут не зайва: перша (в draftDevRequest) гасить
  // вигадані назви, а ця звіряє з тим самим переліком, з якого ми будемо писати
  // — між ними немає нічого, що могло б розійтись, і саме на цьому рішенні
  // тримається «нової картки не буде».
  const mergeTarget = findCardByLabel(candidates, draft.duplicateOf);
  if (mergeTarget) {
    const merged = await mergeIntoBoardCard(
      admin,
      teamId,
      mergeTarget.number,
      // Порожній опис від розбору — дописуємо сказане як є: блок із датою має
      // містити хоч щось, інакше долучення непомітне.
      draft.body || result.text,
      formatMergeDate(new Date())
    );
    if (merged.ok) {
      return json(
        200,
        buildCaptureMergeResponse({
          number: merged.card.number,
          title: merged.card.title,
          kind: merged.card.kind,
          moduleKey: merged.card.moduleKey,
          askedByCount: merged.askedByCount,
          url: buildAppUrl(CAPTURE_BOARD_PATH),
        })
      );
    }
    // Долучити не вийшло — заводимо картку, як робили завжди. Сказане не має
    // зникати через те, що не вдався запис в іншу картку.
    console.error(
      "dev-request-capture: merge failed:",
      merged.reason === "failed" ? merged.message : merged.reason
    );
  }

  // Номер видає окрема функція для service_role: наявна next_document_number
  // перевіряє членство через auth.uid(), якого в серверного коду немає (див.
  // scripts/dev-requests-bot-number.sql).
  const { data: rawNumber, error: numberError } = await admin
    .schema("tosho")
    .rpc("next_dev_request_number", { p_team_id: teamId });
  const nextNumber = typeof rawNumber === "string" ? Number(rawNumber) : rawNumber;
  if (numberError || typeof nextNumber !== "number" || !Number.isFinite(nextNumber)) {
    console.error("dev request number failed:", numberError?.message ?? "no number returned");
    return json(500, { error: "Не зміг записати задачу. Спробуй ще раз за хвилину." });
  }

  const { error: insertError } = await admin
    .schema("tosho")
    .from("dev_requests")
    .insert({
      number: nextNumber,
      team_id: teamId,
      workspace_id: workspaceId || null,
      title: draft.title,
      body: draft.body || null,
      kind: draft.kind,
      // Вхідний кошик, а не черга: це захоплення на бігу з класифікацією від
      // моделі, а не свідоме заведення з дошки. Картку ще має побачити людина.
      status: "triage",
      module_key: draft.moduleKey,
      priority: draft.priority,
      zone: draft.zone,
      auto_classified: true,
      // Приватність — рішення, яке ухвалюють свідомо на дошці.
      is_private: false,
      author_user_id: ownerUserId,
      created_by: ownerUserId,
    });

  if (insertError) {
    // 23505 — унікальний ключ. Для цього входу він може прийти лише з
    // unique (team_id, number): індексу дедуплікації по повідомленню тут немає,
    // бо в Cowork немає стабільного ідентифікатора повідомлення. Тобто це гонка
    // або дрейф лічильника — рідкість, і для людини не червона помилка:
    // повторний запит візьме наступний номер.
    if (insertError.code === "23505") {
      return json(200, { ok: true, duplicate: true, message: CAPTURE_DUPLICATE_MESSAGE });
    }
    console.error("dev request insert failed:", insertError.message);
    return json(500, { error: "Не зміг записати задачу. Спробуй ще раз за хвилину." });
  }

  return json(
    200,
    buildCaptureResponse({
      number: nextNumber,
      title: draft.title,
      kind: draft.kind,
      moduleKey: draft.moduleKey,
      priority: draft.priority,
      existingFeature: draft.existingFeature,
      url: buildAppUrl(CAPTURE_BOARD_PATH),
      drafted: result.ok,
    })
  );
};
