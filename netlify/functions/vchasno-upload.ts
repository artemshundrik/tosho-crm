import { createClient } from "@supabase/supabase-js";

// Інтеграція з «Вчасно.ЕДО» — Фаза 1 (вихідний потік).
// Завантажує документ (PDF) у «Вчасно» під потрібною юрособою і, за запитом,
// надсилає контрагенту. Токени тримаються лише тут, у серверних env.
//
// API-контракт (перевірено наживо, 2026-06):
//   base   https://edo.vchasno.ua/api/v2
//   auth   заголовок `Authorization: <token>` (без 'Bearer')
//   upload POST /documents              content-type: multipart/form-data, файл + метадані в імені
//   send   POST /documents/{id}/flow
//
// Перевірено контрольним тестом 2026-06-24: upload через поле 'file' → HTTP 201, status 7000.
// ⚠️ Лишилось звірити при першому реальному надсиланні: тіло запиту POST /flow для двостороннього документа.

const VCHASNO_BASE = "https://edo.vchasno.ua/api/v2";
const FILE_FIELD = "file"; // підтверджено контрольним тестом 2026-06-24 (upload → HTTP 201, status 7000)

// наш тип документа → category у «Вчасно»
const CATEGORY_BY_DOC_TYPE: Record<string, number> = {
  invoice: 2, // рахунок
  debit_note: 5, // видаткова накладна (ВН)
  annex: 14, // додаток
  contract: 3, // договір
};

// vchasno_company_key юрособи → ім'я env-змінної з токеном
const TOKEN_ENV_BY_COMPANY_KEY: Record<string, string> = {
  fop_vo: "VCHASNO_TOKEN_FOP_VO",
  fop_ro: "VCHASNO_TOKEN_FOP_RO",
  avanprint: "VCHASNO_TOKEN_AVANPRINT",
};

type VchasnoUploadRequest = {
  legalEntityId?: string; // юрособа-відправник (Фаза 1: ФОП В.О.)
  customerId?: string | null; // контрагент (для ЄДРПОУ/email отримувача)
  recipientEdrpou?: string | null; // явний ЄДРПОУ отримувача (переважає над customerId)
  recipientEmail?: string | null; // явний email отримувача
  docType?: string; // invoice | debit_note | annex | contract
  category?: number | null; // ручний override category
  crmDocId?: string | null; // наш id документа → vendor_id у «Вчасно»
  orderId?: string | null;
  quoteId?: string | null;
  number?: string | null; // номер документа
  title?: string | null; // назва документа
  issueDate?: string | null; // YYYY-MM-DD
  amountKopecks?: number | null; // сума, копійки
  fileBase64?: string; // байти PDF (base64)
  send?: boolean; // також надіслати контрагенту (потребує vchasno_send)
};

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

const lc = (value?: string | null) => (value ?? "").trim().toLowerCase();

// Дефолти прав дзеркалять src/lib/workspaceMemberDirectory.ts.
const roleCanUpload = (accessRole?: string | null, jobRole?: string | null) =>
  lc(accessRole) === "owner" || ["seo", "accountant", "chief_accountant"].includes(lc(jobRole));
const roleCanSend = (accessRole?: string | null, jobRole?: string | null) =>
  lc(accessRole) === "owner" || lc(jobRole) === "chief_accountant";

const resolveWorkspaceId = async (
  userClient: ReturnType<typeof createClient>,
  userId: string
) => {
  for (const rpcName of ["my_workspace_id", "current_workspace_id"] as const) {
    const { data, error } = await userClient.schema("tosho").rpc(rpcName);
    if (!error && data) return data as string;
  }
  const { data } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle<{ workspace_id?: string | null }>();
  return data?.workspace_id ?? null;
};

// ASCII-safe фрагмент для імені файлу (без '_' та пробілів — вони службові у конвенції назв)
const fileSafe = (value: string | null | undefined, fallback: string) => {
  const cleaned = (value ?? "")
    .replace(/[\\/_\s]+/g, "-")
    .replace(/[^\p{L}\p{N}.-]/gu, "")
    .trim();
  return cleaned || fallback;
};

// <edrpou_owner>_<edrpou_recipient>_<YYYYMMDD>_<title>_<number>_<email>_<vendor_id>_<amount>.pdf
const buildVchasnoFileName = (parts: {
  ownerEdrpou: string;
  recipientEdrpou: string;
  issueDate?: string | null;
  title?: string | null;
  number?: string | null;
  recipientEmail?: string | null;
  vendorId?: string | null;
  amountKopecks?: number | null;
}) => {
  const yyyymmdd = (parts.issueDate ?? "").replace(/-/g, "").slice(0, 8) || "00000000";
  const seg = [
    fileSafe(parts.ownerEdrpou, "owner"),
    fileSafe(parts.recipientEdrpou, "recipient"),
    yyyymmdd,
    fileSafe(parts.title, "Документ"),
    fileSafe(parts.number, "n"),
  ];
  if (parts.recipientEmail) seg.push(fileSafe(parts.recipientEmail, "email"));
  if (parts.vendorId) seg.push(fileSafe(parts.vendorId, "vid"));
  if (typeof parts.amountKopecks === "number") seg.push(String(Math.round(parts.amountKopecks)));
  return `${seg.join("_")}.pdf`;
};

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  if (!token) return jsonResponse(401, { error: "Missing Authorization token" });

  let payload: VchasnoUploadRequest;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const legalEntityId = payload.legalEntityId?.trim();
  const docType = (payload.docType ?? "").trim();
  const category = payload.category ?? CATEGORY_BY_DOC_TYPE[docType];
  if (!legalEntityId) return jsonResponse(400, { error: "Missing legalEntityId" });
  if (!category) return jsonResponse(400, { error: `Unknown docType: ${docType || "(empty)"}` });
  if (!payload.fileBase64) return jsonResponse(400, { error: "Missing fileBase64 (PDF bytes)" });

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(401, { error: "Unauthorized" });
  const userId = userData.user.id;

  const workspaceId = await resolveWorkspaceId(userClient, userId);
  if (!workspaceId) return jsonResponse(400, { error: "Workspace not found" });

  // --- Права: vchasno (upload) і vchasno_send (надсилання) ---
  const { data: membership } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("access_role,job_role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();

  let overrideUpload: boolean | undefined;
  let overrideSend: boolean | undefined;
  try {
    const { data: profile } = await userClient
      .schema("tosho")
      .from("team_member_profiles")
      .select("module_access")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle<{ module_access?: Record<string, unknown> | null }>();
    const ma = profile?.module_access ?? {};
    if (typeof ma.vchasno === "boolean") overrideUpload = ma.vchasno;
    if (typeof ma.vchasno_send === "boolean") overrideSend = ma.vchasno_send;
  } catch {
    // best-effort: за відсутності профілю покладаємось на роль
  }

  const canUpload = overrideUpload ?? roleCanUpload(membership?.access_role, membership?.job_role);
  if (!canUpload) return jsonResponse(403, { error: "Немає права завантажувати у Вчасно" });
  const wantSend = payload.send === true;
  const canSend = overrideSend ?? roleCanSend(membership?.access_role, membership?.job_role);
  if (wantSend && !canSend) {
    return jsonResponse(403, { error: "Надсилати у Вчасно може лише уповноважена особа" });
  }

  // --- Юрособа-відправник → токен + ЄДРПОУ власника ---
  // Вантажимо через userClient → RLS (is_team_member по public.team_members) сама
  // перевіряє, що користувач — член команди цієї юрособи. team_id беремо з юрособи
  // (саме ним ключовані фінанси/vchasno, це НЕ workspace_id з memberships_view).
  const { data: entity, error: entityError } = await userClient
    .schema("tosho")
    .from("finance_legal_entities")
    .select("id,team_id,name,edrpou,ipn,vchasno_company_key")
    .eq("id", legalEntityId)
    .maybeSingle<{
      id: string;
      team_id: string;
      name: string | null;
      edrpou: string | null;
      ipn: string | null;
      vchasno_company_key: string | null;
    }>();
  if (entityError) return jsonResponse(500, { error: entityError.message });
  if (!entity) {
    return jsonResponse(404, { error: "Юрособу не знайдено або немає доступу" });
  }
  const teamId = entity.team_id;
  const companyKey = (entity.vchasno_company_key ?? "").trim();
  const tokenEnvName = TOKEN_ENV_BY_COMPANY_KEY[companyKey];
  const vchasnoToken = tokenEnvName ? process.env[tokenEnvName] : undefined;
  if (!vchasnoToken) {
    return jsonResponse(400, {
      error: `Токен Вчасно не налаштовано для юрособи (vchasno_company_key='${companyKey || "—"}')`,
    });
  }
  const ownerEdrpou = (entity.edrpou ?? entity.ipn ?? "").trim();

  // --- Контрагент-отримувач: ЄДРПОУ + email ---
  let recipientEdrpou = (payload.recipientEdrpou ?? "").trim();
  let recipientEmail = (payload.recipientEmail ?? "").trim();
  if (payload.customerId && (!recipientEdrpou || !recipientEmail)) {
    const { data: customer } = await userClient
      .schema("tosho")
      .from("customers")
      .select("id,tax_id,accountant_edrpou,accountant_email,contact_email")
      .eq("id", payload.customerId)
      .maybeSingle<{
        id: string;
        tax_id: string | null;
        accountant_edrpou: string | null;
        accountant_email: string | null;
        contact_email: string | null;
      }>();
    if (customer) {
      if (!recipientEdrpou) recipientEdrpou = (customer.accountant_edrpou ?? customer.tax_id ?? "").trim();
      if (!recipientEmail) recipientEmail = (customer.accountant_email ?? customer.contact_email ?? "").trim();
    }
  }

  // --- Завантаження у «Вчасно» ---
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = Buffer.from(payload.fileBase64, "base64");
  } catch {
    return jsonResponse(400, { error: "Bad fileBase64" });
  }

  const fileName = buildVchasnoFileName({
    ownerEdrpou,
    recipientEdrpou,
    issueDate: payload.issueDate,
    title: payload.title,
    number: payload.number,
    recipientEmail,
    vendorId: payload.crmDocId,
    amountKopecks: payload.amountKopecks,
  });

  const form = new FormData();
  form.append(FILE_FIELD, new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }), fileName);

  let vchasnoDocId: string | null = null;
  let statusCode: number | null = null;
  let lastError: string | null = null;
  let rawUpload: unknown = null;

  try {
    const resp = await fetch(`${VCHASNO_BASE}/documents`, {
      method: "POST",
      headers: { Authorization: vchasnoToken }, // ВАЖЛИВО: content-type не ставимо — fetch сам додасть boundary
      body: form,
    });
    const text = await resp.text();
    rawUpload = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    })();
    if (!resp.ok) {
      lastError = `upload ${resp.status}: ${text.slice(0, 500)}`;
    } else {
      const doc = (rawUpload as { documents?: Array<{ id?: string; status?: number }> })?.documents?.[0];
      vchasnoDocId = doc?.id ?? null;
      statusCode = typeof doc?.status === "number" ? doc.status : null;
    }
  } catch (err) {
    lastError = `upload failed: ${(err as Error).message}`;
  }

  // --- Надсилання контрагенту (опційно) ---
  // ⚠️ Тіло /flow для двостороннього документа звірити на контрольному тесті.
  let sentAt: string | null = null;
  if (wantSend && vchasnoDocId && !lastError) {
    try {
      const flowBody = [
        {
          edrpou: recipientEdrpou || undefined,
          emails: recipientEmail ? [recipientEmail] : undefined,
          order: 1,
          sign_num: 1,
        },
      ];
      const resp = await fetch(`${VCHASNO_BASE}/documents/${vchasnoDocId}/flow`, {
        method: "POST",
        headers: { Authorization: vchasnoToken, "Content-Type": "application/json" },
        body: JSON.stringify(flowBody),
      });
      if (!resp.ok) {
        lastError = `flow ${resp.status}: ${(await resp.text()).slice(0, 500)}`;
      } else {
        sentAt = new Date().toISOString();
      }
    } catch (err) {
      lastError = `flow failed: ${(err as Error).message}`;
    }
  }

  // --- Запис у реєстр ---
  const { data: inserted, error: insertError } = await adminClient
    .schema("tosho")
    .from("vchasno_documents")
    .insert({
      team_id: teamId,
      legal_entity_id: legalEntityId,
      customer_id: payload.customerId ?? null,
      recipient_edrpou: recipientEdrpou || null,
      crm_doc_type: docType || null,
      crm_doc_id: payload.crmDocId ?? null,
      order_id: payload.orderId ?? null,
      quote_id: payload.quoteId ?? null,
      direction: "outgoing",
      vchasno_document_id: vchasnoDocId,
      vchasno_category: category,
      status_code: statusCode,
      last_error: lastError,
      sent_at: sentAt,
      last_synced_at: new Date().toISOString(),
      raw: (rawUpload as Record<string, unknown>) ?? {},
      created_by: userId,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (lastError) {
    return jsonResponse(502, {
      error: lastError,
      vchasnoDocumentId: vchasnoDocId,
      recordId: inserted?.id ?? null,
    });
  }
  if (insertError) {
    return jsonResponse(200, {
      ok: true,
      warning: `Завантажено у Вчасно, але запис у БД не вдався: ${insertError.message}`,
      vchasnoDocumentId: vchasnoDocId,
      statusCode,
    });
  }

  return jsonResponse(200, {
    ok: true,
    vchasnoDocumentId: vchasnoDocId,
    statusCode,
    sent: Boolean(sentAt),
    recordId: inserted?.id ?? null,
  });
};
