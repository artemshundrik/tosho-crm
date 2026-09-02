import { buildProjectMap, isKnownModuleKey } from "../../../src/lib/projectMap";

/**
 * Сирий текст → охайна картка розділу «Запити».
 *
 * ВХІД ТЕПЕР ОДИН: dev-request-capture.ts, тобто скіл tosho-request у Claude
 * Code. Було три — диктування у вікні CRM і «/задача» в Telegram-боті поруч із
 * ним, — і модуль стояв окремо саме тому, що входи мали різну автентифікацію.
 * Обидва пішли 02.09.2026: за час життя вікном не скористались жодного разу, а
 * з бота приїхало три картки з 238, усі одним днем.
 *
 * Модуль лишився окремим: його ділять сам ендпоінт і _lib/devRequestCapture.ts
 * (промпт, схема, нормалізація), а тримати це в тілі HTTP-обгортки означало б
 * змішати розбір із гейтом і журналом вартості.
 *
 * Що лишається на боці викликача: гейт користувача, журнал вартості в
 * tosho.ai_usage і формат відповіді.
 */

export const DRAFT_KINDS = ["bug", "friction", "feature"] as const;
export type DevRequestKind = (typeof DRAFT_KINDS)[number];

export const DRAFT_PRIORITIES = ["low", "normal", "high"] as const;
export type DevRequestPriority = (typeof DRAFT_PRIORITIES)[number];

/**
 * Зона роботи — друга вісь картки, поруч із `kind`.
 *
 * Дублікат переліку з src/features/devRequests/types.ts, і це свідомо: функції
 * не імпортують із src (окремий бандл), а перелік із пʼяти значень міняється
 * раз на рік. Розійдеться — модель поверне значення, якого фронт не знає, і
 * asZone обнулить його; картка лишиться без зони, а не з вигаданою.
 */
export const DRAFT_ZONES = ["polish", "ux", "logic", "data", "access", "speed"] as const;
export type DevRequestZone = (typeof DRAFT_ZONES)[number];

export type DevRequestDraft = {
  title: string;
  body: string;
  kind: DevRequestKind;
  duplicateOf: string | null;
  /** Ключ напрямку з реєстру модулів. Вигаданий моделлю — обнуляється. */
  moduleKey: string | null;
  priority: DevRequestPriority;
  /** Що чіпає робота. null — модель не була впевнена. */
  zone: DevRequestZone | null;
  /** «Схоже, це вже працює: …» — назва наявної можливості й де її шукати. */
  existingFeature: string | null;
};

/** Хвилина мовлення ≈ 900 знаків; 6000 — це вже дуже довга розповідь. */
export const MAX_TEXT_CHARS = 6000;
/**
 * Скільки карток їде в промпт як кандидати на дубль.
 *
 * Було 50 — рівно стеля списку черги (BOARD_LIST_LIMIT). 26.08.2026 замір по
 * проду показав, що відкритих карток теж 50: стеля вже впиралась сама в себе, і
 * найстаріші кандидати мовчки випадали з промпту саме тоді, коли дублікати й
 * заводяться — на великих давніх темах. 120 назв — це близько трьох тисяч
 * знаків, тобто дешевше за одну зайву картку, яку потім зводити руками.
 */
export const MAX_OPEN_TITLES = 120;
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
  '  "zone": "polish | ux | logic | data | access | speed або null",',
  '  "existingFeature": "коротко: назва наявної можливості й де її шукати, або null"',
  "}",
  "",
  "Правила:",
  "- Назва описує СУТЬ з погляду людини, яка користується CRM, а не спосіб реалізації.",
  '- Прибирай слова-паразити, повтори й самовиправлення ("ну", "тобто", "ой ні, не так").',
  "- Не додавай того, чого не було сказано. Порожній опис кращий за вигаданий.",
  '- kind: "bug" — щось зламано; "friction" — працює, але незручно; "feature" — нового немає.',
  // «Переробити сторінку Здоровʼя» приїхало як feature, хоча сторінка є й
  // щодня відкривається. Модель читає ОБСЯГ роботи як ознаку новизни, а kind
  // питає інше: чи можна зробити це зараз узагалі.
  '- kind питає, чи існує це ЗАРАЗ, а не скільки роботи. Просять «переробити», «осучаснити», «зробити зручнішим» те, що вже працює — це "friction", навіть якщо переробляти доведеться весь екран. "feature" — лише коли такої можливості в CRM немає взагалі.',
  // Правило посилилось 2026-08-26, коли duplicateOf уперше отримав НАСЛІДОК: на
  // вході захоплення (dev-request-capture) він більше не підказка людині, а
  // рішення не заводити картку — сказане дописується в ту, яку назве модель. До
  // того дня список відкритих карток на цей вхід не передавали взагалі, тож поле
  // було порожнім завжди, і за 168 карток не склеївся жоден дубль.
  '- duplicateOf — це РІШЕННЯ, а не підказка: назвавши картку, ти кажеш «нової не треба, допиши в цю». Став лише тоді, коли наявна картка описує ТУ САМУ справу, а не сусідню, не схожу за словами і не з того самого розділу.',
  "- Сумніваєшся — null. Зайва картка коштує однієї правки на дошці, а дописане не в ту картку губиться серед чужого тексту.",
  '- Бери label дослівно зі списку («REQ-42»). Картки, якої в списку немає, не називай.',
  "- moduleKey бери ДОСЛІВНО з переліку напрямків у карті CRM і став, лише якщо впевнений. Не впевнений — null. Свої ключі не вигадуй.",
  "- Порожній напрямок кращий за неправильний: порожнє поле змусить людину глянути самій, а неправильне введе в оману й зіпсує статистику.",
  // Заміряно на перших трьох живих картках: дві з трьох отримали "overview"
  // помилково. Модель бере його як звалище для «не знаю», бо підпис «Огляд»
  // так і читається. Без цього рядка правило «не впевнений — null» не працює:
  // модель завжди знаходить, що вибрати.
  '- "overview" — це КОНКРЕТНА головна сторінка зі зведенням, а не «загальне» й не «не знаю». Ніколи не став його як запасний варіант. Якщо жоден напрямок не підходить — null.',
  // Правило перевернулось 2026-08-09. Доти дошка доробок не була модулем, і
  // запит про неї саму не мав куди лягти — тож напрямок навмисно лишався
  // порожнім. Тепер це модуль `dev` (беклог, релізи, здоровʼя), і порожній
  // напрямок на таких картках був би вже не чесністю, а втратою даних.
  "- Запит про саму систему доробок — дошку запитів, релізи, здоровʼя системи або Telegram-бота, яким заводять картки, — це напрямок \"dev\".",
  // Шість карток із сімнадцяти лишились без напрямку, хоча в кожній названо
  // конкретну сторінку («Релізи», «Інтеграції», «Огляд»). Модель тягне правило
  // «не впевнений — null» і туди, де впевненість не потрібна: сторінку назвали
  // прямо, лишилось знайти її в переліку.
  '- Якщо в запиті названо конкретну сторінку або пункт меню — знайди його в карті CRM і став напрямок цієї сторінки. «Не впевнений — null» стосується випадків, коли сторінку НЕ назвали, а не тих, де її треба відшукати в переліку.',
  // Раніше наскрізні речі отримували напрямок «за місцем, де людина це
  // помітила»: скарга на модалки лягала в той розділ, де вона трапилась.
  '- Наскрізне, що стосується всіх сторінок одразу — модалки, дровери, завантаження сторінок, шрифти, мобільна адаптація — напрямку не має: null. Те, що людина помітила це на конкретному екрані, не робить той екран напрямком.',
  // REQ-17: модель поставила "nova_poshta" запиту про створення ТТН, бо в
  // тексті звучала Нова Пошта; виправляли руками на "shipping". ТТН створюють
  // із замовлення, а "nova_poshta" — це сторінка налаштувань інтеграції.
  '- Напрямок — це ДЕ ЛЮДИНА ПРАЦЮЄ, а не яка технологія всередині. Назва зовнішнього сервісу в тексті (Нова Пошта, Вчасно, Telegram, Dropbox, OpenAI) сама по собі не робить картку налаштуваннями інтеграції: питай себе, ДЕ ЛЮДИНА НАТИСНЕ КНОПКУ.',
  // Одного загального правила було замало: проба показала, що запит про ТТН
  // усе одно їде в "nova_poshta" — назва служби в тексті переважує. Тож
  // названо прямо, як і в решті виміряних промахів.
  '- "nova_poshta" (пункт меню «Інтеграції») — це САМЕ сторінка налаштувань підключення: ключі, кабінети, статус зʼєднання. Створення ТТН, вибір відділення, друк накладної відбуваються із замовлення — це "shipping". Так само Вчасно: надсилання документа із замовлення — не "vchasno".',
  // Шість карток із сімнадцяти довелось правити руками, і всі шість — з
  // "normal": модель тримається за середину, бо зважує важливість сама. Слова
  // людини («терміново», «не горить») вона при цьому чує — треба лише сказати
  // їй спиратись на них, а не на власну оцінку.
  '- priority бери З ТЕКСТУ, а не з власної оцінки важливості. "high" — сказали «терміново», «горить», «не можна працювати», або йдеться про гроші, документи чи втрачені дані. "low" — сказали «колись», «не горить», «було б добре». Не сказали нічого — "normal".',
  '- zone — ЩО ЧІПАЄ робота, окремо від kind (той каже, що сталось). "polish" — вигляд: верстка, стиль, відступи, вирівнювання, стрибки, адаптація під телефон; "ux" — взаємодія: скільки кроків, зайві підтвердження, чого бракує під рукою, як людина цим користується; "logic" — правила й розрахунки: умови, статуси, числа, кому що надсилається; "data" — які дані показуємо: свіжість, повнота, звідки взялось число; "access" — хто що бачить і кому що можна; "speed" — все працює, але повільно. Не впевнений — null.',
  // Станом на 2026-08-09 у зоні "logic" опинилось 12 карток із 17: модель
  // читала її як «щось у коді» — а в коді геть усе. Вісь розрізали, і тепер
  // "logic" ВУЗЬКА. Це та сама хвороба, що була в "overview", і застереження
  // потрібне таке саме: пряма заборона брати за замовчуванням.
  '- "logic" — це САМЕ правила й числа: за якою умовою щось стається, який статус, скільки вийшло. Не «щось у коді» й не «складна робота». Ніколи не став його як запасний варіант: не підходить жодна зона — null.',
  // Перевірено живим викликом: запит про те, що контент стрибає під час
  // завантаження, отримував "logic". Зона питає не «де це правити» —
  // правиться завжди в коді, — а «що людина побачить інакше».
  "- Скарга на те, ЯК ЕКРАН ВИГЛЯДАЄ — стрибає, з'їжджає, відкривається не того розміру, розповзається на телефоні, виглядає застаріло — це \"polish\", навіть якщо причина в коді.",
  // Межа між сусідами, яку модель плутає найчастіше: обидві зони «про людину».
  '- Межа "polish" і "ux": "polish" — про те, що людина БАЧИТЬ; "ux" — про те, що вона РОБИТЬ. Зайве підтвердження, три кліки замість одного, немає сортування, незручно в боті — це "ux".',
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
  required: [
    "title",
    "body",
    "kind",
    "duplicateOf",
    "moduleKey",
    "priority",
    "zone",
    "existingFeature",
  ],
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
    zone: { type: ["string", "null"], enum: [...DRAFT_ZONES, null] },
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

/** Вигадана зона обнуляється — так само, як вигаданий напрямок. */
function asZone(value: unknown): DevRequestZone | null {
  return typeof value === "string" && (DRAFT_ZONES as readonly string[]).includes(value)
    ? (value as DevRequestZone)
    : null;
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
    zone: asZone(draft.zone),
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
      zone: null,
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
  /** Сирий текст: сказане, набране або розпізнане зі скріншота. */
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
