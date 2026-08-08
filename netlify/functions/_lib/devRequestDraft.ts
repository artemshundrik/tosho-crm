import { buildProjectMap, isKnownModuleKey } from "../../../src/lib/projectMap";

/**
 * Сирий текст → охайна картка розділу «Запити».
 *
 * НАВІЩО ОКРЕМИЙ МОДУЛЬ. Розбір потрібен двом входам із РІЗНОЮ автентифікацією:
 *  - netlify/functions/dev-request-draft.ts — диктування у вікні створення,
 *    користувач приходить із валідним Supabase JWT;
 *  - Telegram-бот — JWT не має взагалі, його автентифікує сам вебхук
 *    (секрет Telegram + isActiveMember), тож HTTP-обгортку він викликати не може.
 *
 * Промпт, схема відповіді й нормалізація живуть тут в ОДНОМУ примірнику: два
 * розбори з двома копіями правил розійшлись би на першій же правці, і картки з
 * бота почали б відрізнятись від карток із вікна без жодної помилки в коді.
 *
 * Що лишається на боці викликача: гейт користувача, журнал вартості в
 * tosho.ai_usage (у нього різні userId/metadata.source) і формат відповіді.
 */

export const DRAFT_KINDS = ["bug", "friction", "feature"] as const;
export type DevRequestKind = (typeof DRAFT_KINDS)[number];

export const DRAFT_PRIORITIES = ["low", "normal", "high"] as const;
export type DevRequestPriority = (typeof DRAFT_PRIORITIES)[number];

export type DevRequestDraft = {
  title: string;
  body: string;
  kind: DevRequestKind;
  duplicateOf: string | null;
  /** Ключ напрямку з реєстру модулів. Вигаданий моделлю — обнуляється. */
  moduleKey: string | null;
  priority: DevRequestPriority;
  /** «Схоже, це вже працює: …» — назва наявної можливості й де її шукати. */
  existingFeature: string | null;
};

/** Хвилина мовлення ≈ 900 знаків; 6000 — це вже дуже довга розповідь. */
export const MAX_TEXT_CHARS = 6000;
/** Довший список карток нічого не додає до підказки про дубль, лише коштує токенів. */
export const MAX_OPEN_TITLES = 50;
/** Назва в базі — text без обмеження, але захист від «полотна» замість заголовка. */
const MAX_TITLE_CHARS = 200;
/** Скільки знаків тексту стають назвою, коли розбір не вдався. */
const FALLBACK_TITLE_CHARS = 80;
/** Підказка «це вже працює» має бути рядком, а не переказом половини карти. */
const MAX_EXISTING_FEATURE_CHARS = 160;

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const SYSTEM_PROMPT = [
  "Ти перетворюєш усний запит українського співробітника на картку задачі для CRM.",
  "",
  "Поверни JSON:",
  "{",
  '  "title": "одне речення до 80 символів, з великої літери, без крапки в кінці",',
  '  "body": "структурований опис: що не так, де саме це видно, як має бути. Абзаци через \\n\\n. Якщо чогось не сказали — не вигадуй",',
  '  "kind": "bug | friction | feature",',
  '  "duplicateOf": "label наявної картки або null",',
  '  "moduleKey": "ключ напрямку з карти CRM нижче або null",',
  '  "priority": "low | normal | high",',
  '  "existingFeature": "коротко: назва наявної можливості й де її шукати, або null"',
  "}",
  "",
  "Правила:",
  "- Назва описує СУТЬ з погляду людини, яка користується CRM, а не спосіб реалізації.",
  '- Прибирай слова-паразити, повтори й самовиправлення ("ну", "тобто", "ой ні, не так").',
  "- Не додавай того, чого не було сказано. Порожній опис кращий за вигаданий.",
  '- kind: "bug" — щось зламано; "friction" — працює, але незручно; "feature" — нового немає.',
  "- duplicateOf став лише за очевидного збігу теми, інакше null.",
  "- moduleKey бери ДОСЛІВНО з переліку напрямків у карті CRM і став, лише якщо впевнений. Не впевнений — null. Свої ключі не вигадуй.",
  "- Порожній напрямок кращий за неправильний: порожнє поле змусить людину глянути самій, а неправильне введе в оману й зіпсує статистику.",
  // Заміряно на перших трьох живих картках: дві з трьох отримали "overview"
  // помилково. Модель бере його як звалище для «не знаю», бо підпис «Огляд»
  // так і читається. Без цього рядка правило «не впевнений — null» не працює:
  // модель завжди знаходить, що вибрати.
  '- "overview" — це КОНКРЕТНА головна сторінка зі зведенням, а не «загальне» й не «не знаю». Ніколи не став його як запасний варіант. Якщо жоден напрямок не підходить — null.',
  "- Сама дошка запитів на доробку (/dev-requests) у переліку напрямків відсутня навмисно. Запит про неї саму — це null, а не найближчий за змістом модуль.",
  '- priority: "high" — щось зламано й заважає працювати прямо зараз; "normal" — звичайна доробка; "low" — косметика й «колись було б добре». За замовчуванням "normal".',
  "- existingFeature заповнюй, лише якщо в списку «що CRM уже вміє» справді є те, що робить рівно це. Схожа назва — не привід. Список неповний, тож відсутність у ньому нічого не доводить: сумніваєшся — null.",
].join("\n");

// Карта збирається один раз на холодний старт: реєстри статичні, а платити
// токенами за її перезбирання на кожен виклик не треба.
const DEVELOPER_PROMPT = `${SYSTEM_PROMPT}\n\nКАРТА CRM\n${buildProjectMap()}`;

// Структурований вихід задається так само, як у tosho-ai.ts — це єдине місце в
// проєкті, де Responses API просять про JSON (transcribe.ts повертає простий
// текст, telegram-assistant-background.ts ходить через tool call).
const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "body", "kind", "duplicateOf", "moduleKey", "priority", "existingFeature"],
  properties: {
    title: { type: "string" },
    body: { type: "string" },
    kind: { type: "string", enum: [...DRAFT_KINDS] },
    // strict: true вимагає, щоб поле було в required, тож «немає дубля» — це
    // саме null, а не відсутнє поле. Те саме стосується moduleKey й
    // existingFeature: «не знаю» треба вміти сказати явно.
    duplicateOf: { type: ["string", "null"] },
    // Перелік ключів не дублюємо в схему enum-ом: він уже є в карті, а
    // правдивість відповіді все одно звіряє isKnownModuleKey — схема не
    // врятує від «схожого, але не того» ключа краще за реєстр.
    moduleKey: { type: ["string", "null"] },
    priority: { type: "string", enum: [...DRAFT_PRIORITIES] },
    existingFeature: { type: ["string", "null"] },
  },
} as const;

export type OpenTitleInput = {
  label?: string | null;
  title?: string | null;
};

type OpenTitle = { label: string; title: string };

/** Текст, який реально поїде в модель: без країв і без «полотна». */
export function clampDraftText(value: unknown): string {
  return normalizeText(typeof value === "string" ? value : "").slice(0, MAX_TEXT_CHARS);
}

function normalizeOpenTitles(list: OpenTitleInput[] | undefined): OpenTitle[] {
  return (Array.isArray(list) ? list : [])
    .map((entry) => ({ label: normalizeText(entry?.label), title: normalizeText(entry?.title) }))
    .filter((entry) => entry.label && entry.title)
    .slice(0, MAX_OPEN_TITLES);
}

function buildUserPrompt(text: string, openTitles: OpenTitle[]): string {
  const parts = [`ЩО СКАЗАЛИ:\n${text}`];
  if (openTitles.length > 0) {
    const lines = openTitles.map((entry) => `${entry.label}: ${entry.title}`).join("\n");
    parts.push(`ВІДКРИТІ КАРТКИ (для duplicateOf):\n${lines}`);
  }
  return parts.join("\n\n");
}

function asKind(value: unknown): DevRequestKind {
  return typeof value === "string" && (DRAFT_KINDS as readonly string[]).includes(value)
    ? (value as DevRequestKind)
    : "friction";
}

/** Незрозумілий пріоритет — це «звичайна доробка», а не «горить». */
function asPriority(value: unknown): DevRequestPriority {
  return typeof value === "string" && (DRAFT_PRIORITIES as readonly string[]).includes(value)
    ? (value as DevRequestPriority)
    : "normal";
}

/**
 * Спільна нормалізація — і для розібраної відповіді, і для аварійного варіанта.
 *
 * Порожня назва сюди не доходить: людині лишається дописати рівно те, що модель
 * не змогла стиснути, а не згадувати, про що вона взагалі говорила. Тому назвою
 * стають перші 80 знаків сказаного.
 */
export function normalizeDraft(draft: Partial<DevRequestDraft>, rawText: string): DevRequestDraft {
  const title = normalizeText(draft.title).slice(0, MAX_TITLE_CHARS);
  return {
    title: title || normalizeText(rawText.slice(0, FALLBACK_TITLE_CHARS)),
    body: normalizeText(draft.body),
    kind: asKind(draft.kind),
    duplicateOf: normalizeText(draft.duplicateOf) || null,
    // Єдине місце, де напрямок звіряється з реєстром модулів. Модель
    // регулярно вигадує правдоподібні ключі («payments», «tasks»), і такий
    // напрямок нікуди не веде, зате виглядає як робота розбору — картка
    // здається класифікованою, а статистика по напрямках бреше. Порожньо
    // краще: людина побачить пусте поле й обере сама.
    moduleKey: isKnownModuleKey(draft.moduleKey) ? draft.moduleKey : null,
    priority: asPriority(draft.priority),
    existingFeature:
      normalizeText(draft.existingFeature).slice(0, MAX_EXISTING_FEATURE_CHARS) || null,
  };
}

/** Аварійний варіант: сказане не має пропадати, навіть коли розбір упав. */
export function fallbackDraft(rawText: string): DevRequestDraft {
  return normalizeDraft(
    {
      title: "",
      body: rawText,
      kind: "friction",
      duplicateOf: null,
      // Розбору не було — вигадувати напрямок і підказку нема з чого.
      moduleKey: null,
      priority: "normal",
      existingFeature: null,
    },
    rawText
  );
}

/** Витягнути текст відповіді Responses API: спершу зручний output_text, потім структура. */
function extractOutputText(payload: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}): string {
  const direct = normalizeText(payload.output_text);
  if (direct) return direct;
  return normalizeText(
    (payload.output ?? [])
      .flatMap((item) => item.content ?? [])
      .filter((part) => part?.type === "output_text")
      .map((part) => normalizeText(part.text))
      .filter(Boolean)
      .join("\n")
  );
}

export type DraftDevRequestInput = {
  /** Сирий текст: надиктоване, переслане повідомлення або аргумент /задача. */
  text: string;
  /** Назви відкритих карток — щоб модель могла вказати на очевидний дубль. */
  openTitles?: OpenTitleInput[];
  apiKey: string;
  model: string;
};

export type DraftDevRequestResult = {
  draft: DevRequestDraft;
  /** false — модель не відповіла або відповідь не розібралась; draft аварійний. */
  ok: boolean;
  /** Токени для журналу вартості. Заповнені навіть коли ok=false. */
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
  /** Текст, який реально поїхав у модель (після обрізання). */
  text: string;
  /** Скільки карток поїхало в промпт — для metadata журналу вартості. */
  openTitlesCount: number;
};

/**
 * Один виклик моделі + повна валідація відповіді.
 *
 * НІКОЛИ не кидає: мережева помилка, відмова моделі, обрізання по
 * max_output_tokens чи не-JSON у виході дають аварійну картку з сирим текстом.
 * Сказане не має зникати через те, що розбір не вдався.
 */
export async function draftDevRequest(input: DraftDevRequestInput): Promise<DraftDevRequestResult> {
  const text = clampDraftText(input.text);
  const openTitles = normalizeOpenTitles(input.openTitles);
  const knownLabels = new Set(openTitles.map((entry) => entry.label.toLowerCase()));

  let payload: {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  } = {};
  let responseOk = false;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        reasoning: { effort: "low" },
        input: [
          { role: "developer", content: DEVELOPER_PROMPT },
          { role: "user", content: [{ type: "input_text", text: buildUserPrompt(text, openTitles) }] },
        ],
        max_output_tokens: 1600,
        text: {
          format: {
            type: "json_schema",
            name: "dev_request_draft",
            strict: true,
            schema: DRAFT_SCHEMA,
          },
        },
      }),
    });
    payload = (await response.json().catch(() => ({}))) as typeof payload;
    responseOk = response.ok;
  } catch (error) {
    console.error(
      "devRequestDraft: OpenAI request threw:",
      error instanceof Error ? error.message : error
    );
  }

  const usage = {
    inputTokens: toNullableNumber(payload.usage?.input_tokens),
    outputTokens: toNullableNumber(payload.usage?.output_tokens),
    totalTokens: toNullableNumber(payload.usage?.total_tokens),
  };
  const base = { usage, text, openTitlesCount: openTitles.length };

  if (!responseOk) {
    return { ...base, ok: false, draft: fallbackDraft(text) };
  }

  let parsed: Partial<DevRequestDraft>;
  try {
    parsed = JSON.parse(extractOutputText(payload)) as Partial<DevRequestDraft>;
  } catch {
    return { ...base, ok: false, draft: fallbackDraft(text) };
  }

  const draft = normalizeDraft(parsed, text);
  // Модель інколи «згадує» картку, якої не було в списку — таку підказку гасимо,
  // інакше людина шукатиме неіснуючий REQ. Для бота список порожній завжди, тож
  // тут же й гасне будь-який duplicateOf: підказка без переліку — це вигадка.
  if (draft.duplicateOf && !knownLabels.has(draft.duplicateOf.toLowerCase())) {
    draft.duplicateOf = null;
  }
  return { ...base, ok: true, draft };
}
