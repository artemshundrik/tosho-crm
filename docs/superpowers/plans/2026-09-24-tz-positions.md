# Позиції з ТЗ (Word і ексель): товар, нанесення, вимоги — план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** позиція з файлу клієнта (Word-ТЗ чи ексель) приходить у візард з вимогами списком, нанесенням, кандидатами товару з пулу й умовами закупівлі окремо — а не текстом без фото.

**Architecture:** модель повертає нові поля (`requirements`, `imprint`, `conditions`), `toDraftItems` кладе їх у чернетку; опис позиції збирається з них на запис; візард показує кандидатів із пулу (`searchSupplierPool`) і прив'язує товар кліком тим самим заповненням полів, що й пошук; нанесення з ТЗ перетворюється на чипи ПОХІДНО, коли в чернетки з'являється вид; на «Створити» файл кладеться у «Файли прорахунку», умови — повідомленням в обговорення.

**Tech Stack:** React 19 + TS, Vite, Supabase (postgrest-js), Netlify Functions, OpenAI Responses API (strict json_schema), Vitest (+ Testing Library), Playwright.

**Spec:** `docs/QUOTE_IMPORT_DESIGN.md` §2б «Позиції з ТЗ (Word і ексель)» — читати ПЕРЕД задачею; план аргументує від нього.

## Global Constraints

- Прочитати `CLAUDE.md` і `AGENTS.md`. НЕ пушити. Коміт — людська тема для керівництва, технічне в тілі, трейлер `Закриває: REQ-182#pN` окремим рядком з початку рядка; `REQ-N` у прозі гак `commit-msg` не пропустить. Останній рядок коміта: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `git add` лише своїх файлів (ніколи `-A`).
- Перевірка: `npm run check:fast` під час роботи; `npm run check` перед кожним комітом. Лінт — oxlint; ратчети рахують `set-state-in-effect` — **нових синхронних `setState` у тілі `useEffect` не додавати** (асинхронний `.then` — можна).
- Задум — для БУДЬ-ЯКОГО файлу: промпт без розвилки «Word / ексель». Вигадувати вимоги й нанесення, яких у файлі немає, модель не має права.
- Товар із пулу НІКОЛИ не прив'язується без кліку людини.
- Тексти інтерфейсу — українською, тоном сусідніх підписів візарда.
- Нові поля чернетки — НЕОБОВ'ЯЗКОВІ (`?`): `QuoteImportDraftItem` будують ще `makeDraft` у візарді й тести; читати як `draft.requirements ?? []`.

## Файли

| Файл | Відповідальність |
|---|---|
| `netlify/functions/quote-import-parse.ts` | схема + промпт + `conditions` у відповіді |
| `src/features/quotes/quote-import/types.ts` | нові типи й поля |
| `src/features/quotes/quote-import/mapping.ts` | `toDraftItems` (нові поля), `normalizeImprintHint`, `formatImprintHint`, `buildItemDescription`, опис у `buildImportItemPayload` |
| `src/features/quotes/quote-import/imprintHint.ts` (новий) | `matchMethodId`, `withHintImprints` — нанесення з ТЗ → чипи |
| `src/features/quotes/quote-import/importFlow.ts` | `conditions` в успіху розбору; `attachImportExtras` (файл + умови) |
| `src/features/quotes/quote-import/ImportDraftRow.tsx` | вимоги згортком, підпис нанесення, «Схожі в пулі» |
| `src/features/quotes/quote-wizard/usePoolCandidates.ts` (новий) | кандидати з пулу для позицій файлу |
| `src/features/quotes/quote-wizard/QuoteWizardDialog.tsx` | прив'язка кандидата, похідні чипи, файл/умови на «Створити» |
| `src/features/taskChat/queries.ts` | `insertThreadMessage` + експорт `notifyThreadMessage` |
| `src/pages/QuoteDetailsPage.tsx:~4830` | опис позиції з переносами рядків |

---

### Task 1: Нові поля відповіді моделі й чернетки (REQ-182#p26)

**Files:**
- Modify: `netlify/functions/quote-import-parse.ts` (OPENAI_SCHEMA ~ln 63–98, DEVELOPER_PROMPT ~ln 110–130, відповідь ~ln 320–334)
- Modify: `src/features/quotes/quote-import/types.ts`
- Modify: `src/features/quotes/quote-import/mapping.ts` (`toDraftItems` ln 73–133)
- Modify: `src/features/quotes/quote-import/importFlow.ts` (успіх `parseImportFile`)
- Test: `src/features/quotes/quote-import/mapping.test.ts`, `src/features/quotes/quote-import/importFlow.test.ts`

**Interfaces — Produces:**
```ts
// types.ts
export type QuoteImportImprintHint = { method: string | null; place: string | null; size: string | null; colors: string | null };
// QuoteImportItem += requirements?: string[] | null; imprint?: QuoteImportImprintHint | null;
// QuoteImportParseResponse += conditions?: string[];
// QuoteImportDraftItem += requirements?: string[]; imprintHint?: QuoteImportImprintHint | null;
//                         tzName?: string | null; imprintHintApplied?: boolean;
// mapping.ts
export function normalizeImprintHint(raw: QuoteImportItem["imprint"]): QuoteImportImprintHint | null;
export function formatImprintHint(hint: QuoteImportImprintHint): string; // «Вишивка · груди ліворуч · до 10×10 см · до 3 кольорів»
// importFlow.ts: ImportParseOutcome ok += conditions: string[]
```

- [ ] **Step 1: Failing tests** — у `mapping.test.ts`:

```ts
describe("toDraftItems — вимоги й нанесення з файлу (REQ-182#p26)", () => {
  const base = { sourceRows: [9], name: "Флісова жилетка", comment: null, links: [], runs: [{ quantity: 650 }], flags: [], notes: null };
  it("кладе вимоги, чистить і ріже до 8", () => {
    const [draft] = toDraftItems([{ ...base, requirements: ["  Фліс ≥ 260 г/м² ", "", ...Array.from({ length: 10 }, (_, i) => `вимога ${i}`)] }]);
    expect(draft.requirements).toEqual(["Фліс ≥ 260 г/м²", ...Array.from({ length: 7 }, (_, i) => `вимога ${i}`)]);
  });
  it("нанесення: порожнє → null, часткове лишається", () => {
    expect(toDraftItems([{ ...base, imprint: { method: " ", place: null, size: null, colors: null } }])[0].imprintHint).toBeNull();
    expect(toDraftItems([{ ...base, imprint: { method: "Вишивка", place: "груди ліворуч", size: null, colors: "до 3 кольорів" } }])[0].imprintHint)
      .toEqual({ method: "Вишивка", place: "груди ліворуч", size: null, colors: "до 3 кольорів" });
  });
  it("без нових полів — порожній список і null (стара відповідь не ламається)", () => {
    const [draft] = toDraftItems([base]);
    expect(draft.requirements).toEqual([]);
    expect(draft.imprintHint).toBeNull();
  });
  it("formatImprintHint пропускає порожні частини", () => {
    expect(formatImprintHint({ method: "Вишивка", place: "груди ліворуч", size: "до 10×10 см", colors: null })).toBe("Вишивка · груди ліворуч · до 10×10 см");
  });
});
```
У `importFlow.test.ts` (розділ `parseImportFile`) — `conditions` з відповіді доходять в успіх; це потребує моку `supabase.auth.getSession` і `fetch` у тому ж файлі: додай їх тим самим способом, що в `QuoteWizardDialog.test.tsx` (мок `@/lib/supabaseClient` з `auth.getSession`, `vi.stubGlobal("fetch", …)` з `{ items: [...], warnings: [], conditions: ["Доставка до РЦ Луцьк"] }`) і перевір `outcome.conditions`.

- [ ] **Step 2:** `npx vitest run src/features/quotes/quote-import/` — має впасти.

- [ ] **Step 3: Implementation.**
  - `types.ts` — інтерфейси вище (з коментарями «навіщо», стилем файлу).
  - `mapping.ts`:
    ```ts
    const MAX_REQUIREMENTS = 8;
    const cleanText = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
    export function normalizeImprintHint(raw: QuoteImportItem["imprint"]): QuoteImportImprintHint | null {
      if (!raw || typeof raw !== "object") return null;
      const hint = { method: cleanText(raw.method) || null, place: cleanText(raw.place) || null, size: cleanText(raw.size) || null, colors: cleanText(raw.colors) || null };
      return hint.method || hint.place || hint.size || hint.colors ? hint : null;
    }
    export function formatImprintHint(hint: QuoteImportImprintHint): string {
      return [hint.method, hint.place, hint.size, hint.colors].filter(Boolean).join(" · ");
    }
    ```
    у поверненні `toDraftItems` додати:
    ```ts
    requirements: (item.requirements ?? []).map(cleanText).filter(Boolean).slice(0, MAX_REQUIREMENTS),
    imprintHint: normalizeImprintHint(item.imprint),
    ```
  - `quote-import-parse.ts`, схема (strict — кожне нове поле в `required`):
    ```ts
    // items.items.properties +=
    requirements: { type: "array", items: { type: "string" } },
    imprint: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["method", "place", "size", "colors"],
      properties: {
        method: { type: ["string", "null"] }, place: { type: ["string", "null"] },
        size: { type: ["string", "null"] }, colors: { type: ["string", "null"] },
      },
    },
    // items.items.required += "requirements", "imprint"
    // корінь: properties += conditions: { type: "array", items: { type: "string" } }; required += "conditions"
    ```
    Промпт: прибрати Word-специфічне «Put into comment a compact summary…» і дужку «(for Word documents — …)» у реченні про comment; додати ЗАГАЛЬНІ речення (для будь-якого файлу):
    ```
    "requirements = 0–6 short fragments of what the file demands of THIS product and what affects price or production — material and density, construction, colour, size range, what the price must include. Empty array when the file states none: never invent, never restate the name or quantity, never put the imprint here.",
    "imprint = the branding or decoration the file asks for on this product: method (e.g. 'Вишивка', 'Шовкодрук', 'DTF', 'Сублімація', 'Гравіювання', 'УФ-друк'), place (e.g. 'груди ліворуч'), size (e.g. 'до 10×10 см'), colors (e.g. 'до 3 кольорів'); null sub-fields when not stated; null when the file says nothing about branding.",
    "conditions = procurement terms for the WHOLE request, not a product: delivery place and schedule, staged deliveries, sample requirements, warranty, payment. Short Ukrainian sentences; empty array when absent. Never copy them into items.",
    ```
    Word-абзац лишити про структуру дампа й про те, де шукати назву/кількість/вимоги; пропуск супроводу (еквівалентність, критерії оцінки, перелік документів) — однією заувагою.
    Відповідь: `conditions` відфільтрувати як `warnings` (рядки, ≤ 20) і повернути поруч з `items`.
  - `importFlow.ts`: у успіху `conditions: (payload?.conditions ?? []).filter((c): c is string => typeof c === "string" && c.trim() !== "").map((c) => c.trim()).slice(0, 20)`; тип `ImportParseOutcome` ok += `conditions: string[]`.

- [ ] **Step 4:** `npx vitest run src/features/quotes/quote-import/` — зелено; `npm run check:fast`.

- [ ] **Step 5: Справжній виклик моделі (по разу).** Тимчасовий `netlify/functions/_probe_import.test.ts` (ВИДАЛИТИ після): тимчасово `export` для `DEVELOPER_PROMPT` і `OPENAI_SCHEMA` (прибрати перед комітом); ключ — рядок `OPENAI_API_KEY=` з `.env.local` (не друкувати); модель `gpt-5.6-terra`, `reasoning.effort: "low"`, тіло як у функції. Два входи:
  1. дамп `/Users/artem/Downloads/ТЗ_жилетка_КМ_фінал.docx` через `readWordDocumentSheets` + `buildSheetDump`; очікувано: одна позиція «Флісова жилетка», runs 650, requirements 3–6 пунктів (фліс ≥ 260 г/м², комір-стійка/блискавка, кишені, S–3XL, колір за зразком), imprint `{Вишивка, груди ліворуч, до 10×10 см, до 3 кольорів}`, conditions: РЦ Луцьк, поетапна поставка, зразок за 5 днів, гарантія 3 міс.;
  2. ексель-перелік у дусі KMZ (зібрати `ParsedSheet` руками: колонки «№ · Найменування · Тираж · Вартість виробу (з ПДВ) · Вартість нанесення · Коментар · Посилання», 3 рядки, одне посилання) — очікувано: requirements ПОРОЖНІ або дослівні з «Коментаря», imprint null, conditions [].
  Результати записати в scratchpad і показати в звіті задачі. Невідповідність → підправити промпт і повторити ОДИН раз.

- [ ] **Step 6: Commit** (після `npm run check`):
```
Розбір файлу від клієнта розкладає ТЗ на вимоги, нанесення й умови закупівлі

<тіло: що модель тепер повертає, результат двох справжніх викликів — ТЗ на жилетку й ексель-перелік>

Закриває: REQ-182#p26

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

---

### Task 2: Вимоги згортком і в описі позиції (REQ-182#p29)

**Files:**
- Modify: `src/features/quotes/quote-import/mapping.ts` (`buildImportItemPayload` ~ln 216–246)
- Modify: `src/features/quotes/quote-import/ImportDraftRow.tsx` (під рядком «рядок …» ~ln 390; коментар ~ln 463–472)
- Modify: `src/pages/QuoteDetailsPage.tsx:~4830` (div опису)
- Test: `mapping.test.ts`; новий `src/features/quotes/quote-import/ImportDraftRow.test.tsx` (компонентний, jsdom)

**Interfaces — Consumes:** Task 1 (`requirements`, `imprintHint`, `tzName`, `formatImprintHint`). **Produces:** `export function buildItemDescription(draft: Pick<QuoteImportDraftItem, "comment" | "requirements" | "imprintHint" | "tzName">): string`.

- [ ] **Step 1: Failing tests.**
```ts
describe("buildItemDescription — опис позиції з файлу", () => {
  it("назва з ТЗ, коментар, вимоги й нанесення — рядками", () => {
    expect(buildItemDescription({
      tzName: "Флісова жилетка", comment: "",
      requirements: ["Фліс ≥ 260 г/м²", "Розміри S–3XL, одна ціна"],
      imprintHint: { method: "Вишивка", place: "груди ліворуч", size: "до 10×10 см", colors: "до 3 кольорів" },
    })).toBe("За ТЗ: Флісова жилетка\n• Фліс ≥ 260 г/м²\n• Розміри S–3XL, одна ціна\n• Нанесення: Вишивка · груди ліворуч · до 10×10 см · до 3 кольорів");
  });
  it("проста ексель-позиція — лише коментар, як і було", () => {
    expect(buildItemDescription({ comment: "прохання запитати підрядника", requirements: [], imprintHint: null, tzName: null })).toBe("прохання запитати підрядника");
  });
});
```
Компонентний `ImportDraftRow.test.tsx`: чернетка з `requirements: ["Фліс ≥ 260 г/м²", "Комір-стійка"]` і `imprintHint` → видно кнопку «Вимоги з ТЗ · 2» (згорнуто: пунктів не видно); клік → два поля з цими значеннями; редагування першого викликає `onPatch({ requirements: ["Фліс ≥ 280 г/м²", "Комір-стійка"] })`; кнопка «Прибрати вимогу» біля другого → `onPatch({ requirements: ["Фліс ≥ 260 г/м²"] })`; при `imprints: []` видно «Нанесення з ТЗ: Вишивка · груди ліворуч · …», а коли `imprints` непорожні — підпису немає. Сусідні `.test.tsx` у `quote-import/` показують, як рендерити рядок і які пропси обов'язкові.

- [ ] **Step 2:** запустити — впасти.
- [ ] **Step 3: Implementation.**
  - `mapping.ts`:
    ```ts
    export function buildItemDescription(draft: Pick<QuoteImportDraftItem, "comment" | "requirements" | "imprintHint" | "tzName">): string {
      const lines: string[] = [];
      if (draft.tzName) lines.push(`За ТЗ: ${draft.tzName}`);
      if (draft.comment) lines.push(draft.comment);
      for (const requirement of draft.requirements ?? []) lines.push(`• ${requirement}`);
      if (draft.imprintHint) lines.push(`• Нанесення: ${formatImprintHint(draft.imprintHint)}`);
      return lines.join("\n");
    }
    ```
    у `buildImportItemPayload`: `description: buildItemDescription(draft) || null,` (розмір і кольори нанесення живуть лише тут — у чипах для них полів немає).
  - `ImportDraftRow.tsx`: під рядком «рядок …» — блок вимог, лише коли `(draft.requirements?.length ?? 0) > 0`: кнопка-перемикач `Вимоги з ТЗ · N` (стан розгорнутості — локальний `useState(false)`, НЕ ефект), розгорнуто — список `Input` (текст вимоги) + іконна кнопка `aria-label="Прибрати вимогу"`; зміни через наявний `onPatch({ requirements })`. Підпис нанесення: `draft.imprintHint && draft.imprints.length === 0` → `<span className="text-2xs text-muted-foreground">Нанесення з ТЗ: {formatImprintHint(draft.imprintHint)}</span>`. Стилі — як сусідній мета-рядок; без нових тіней/кольорів.
  - `QuoteDetailsPage.tsx` ~4830: div опису + `whitespace-pre-line`, щоб «•»-рядки не злипались.
- [ ] **Step 4:** тести зелені; `npm run check:fast`.
- [ ] **Step 5: Commit:** тема «Вимоги з ТЗ видно окремим списком у позиції, а не рядком у коментарі», трейлер `Закриває: REQ-182#p29`.

---

### Task 3: «Схожі в пулі» і нанесення чипами після вибору товару (REQ-182#p27, #p28)

**Files:**
- Create: `src/features/quotes/quote-import/imprintHint.ts` (+ `imprintHint.test.ts`)
- Create: `src/features/quotes/quote-wizard/usePoolCandidates.ts`
- Modify: `src/features/quotes/quote-import/ImportDraftRow.tsx` (нові необов'язкові пропси `candidates`, `onPickCandidate`)
- Modify: `src/features/quotes/quote-wizard/QuoteWizardDialog.tsx` (`handleAddSupplierProduct` ln 493–579; рендер рядків ln 1059–1087; `handleCreate` ~ln 653–720; `changeImprints`)
- Test: `imprintHint.test.ts`; `QuoteWizardDialog.test.tsx` (новий кейс; мок `@/lib/supplierPool`)

**Interfaces — Consumes:** Task 1/2 поля. **Produces:**
```ts
// imprintHint.ts
export function matchMethodId(method: string | null, methods: Array<{ id: string; name: string }>): string | null;
export function withHintImprints(draft: QuoteImportDraftItem, methodsByKind: Record<string, { methods: Array<{ id: string; name: string }> } | undefined>): QuoteImportDraftItem;
// usePoolCandidates.ts
export type PoolCandidates = { status: "loading" | "done"; products: SupplierPoolProduct[] };
export function usePoolCandidates(drafts: QuoteImportDraftItem[], isFileDraft: (d: QuoteImportDraftItem) => boolean): Record<string, PoolCandidates>;
```

- [ ] **Step 1: Failing tests** `imprintHint.test.ts`:
```ts
const methods = [{ id: "m-emb", name: "Вишивка" }, { id: "m-silk", name: "Шовкографія" }, { id: "m-print", name: "Друк" }];
it("вишивка → вишивка", () => expect(matchMethodId("Вишивка логотипу", methods)).toBe("m-emb"));
it("шовкодрук → шовкографія (синонім)", () => expect(matchMethodId("шовкодрук", methods)).toBe("m-silk"));
it("УФ-друк не чіпляється за загальний «Друк»", () => expect(matchMethodId("УФ-друк", methods)).toBeNull());
it("невідоме — null, нічого не вигадуємо", () => expect(matchMethodId("гальваніка", methods)).toBeNull());
it("withHintImprints: є вид і методи → чип із місцем з ТЗ", () => {
  const draft = { ...fileDraft, catalog: { kindId: "k1", typeId: "t", kindName: "Жилетки", typeName: "Одяг", modelId: null, imageUrl: null }, imprints: [], imprintHint: { method: "Вишивка", place: "груди ліворуч", size: null, colors: null } };
  expect(withHintImprints(draft, { k1: { methods } }).imprints).toEqual([{ key: `${draft.key}-hint`, methodId: "m-emb", positionId: null, positionLabel: "груди ліворуч" }]);
});
it("людина вже правила чипи (imprintHintApplied) — не підмішуємо", () => {
  const draft = { ...fileDraft, catalog: { kindId: "k1", typeId: "t", kindName: "", typeName: "", modelId: null, imageUrl: null }, imprints: [], imprintHintApplied: true, imprintHint: { method: "Вишивка", place: null, size: null, colors: null } };
  expect(withHintImprints(draft, { k1: { methods } }).imprints).toEqual([]);
});
```
(`fileDraft` — мінімальна чернетка, зібрана `toDraftItems([...])[0]`.)
Кейс візарда: `vi.mock("@/lib/supplierPool", () => ({ searchSupplierPool: vi.fn(async () => [product]) }))` з `product` — `SupplierPoolProduct` «Жилетка флісова Mercury» (article "M-123", imageUrl, priceMin 480, currency "UAH", priceRowId "pr-1", variants [], sources []); файл дає позицію «Флісова жилетка» БЕЗ посилань з `imprint {Вишивка, груди ліворуч}` → у рядку видно «Схожі в пулі» і кнопку `Обрати «Жилетка флісова Mercury»`; клік → поле назви показує «Жилетка флісова Mercury», кандидатів більше немає; на «Створити» `insertQuoteItemRow` отримує `description`, що починається з «За ТЗ: Флісова жилетка», і (коли `catalog_methods` мок дає «Вишивка» для вгаданого виду) `methods` з `method_id` вишивки. Якщо вгадати вид за назвою в моках не вийде — перевір хоча б назву, `description` і відсутність кандидатів після кліку, а `withHintImprints` покрито юніт-тестом.

- [ ] **Step 2:** впасти.
- [ ] **Step 3: Implementation.**
  - `imprintHint.ts`:
    ```ts
    const SYNONYMS: string[][] = [
      ["вишивка", "машинна вишивка", "вишивання"],
      ["шовкодрук", "шовкографія", "трафаретний друк"],
      ["dtf", "дтф"],
      ["сублімація", "сублімаційний"],
      ["гравіювання", "гравірування", "лазерне гравіювання"],
      ["уф-друк", "уф друк", "uv-друк", "uv друк"],
      ["тамподрук", "тампонний друк"],
      ["тиснення", "конгрев"],
    ];
    const norm = (value: string) => value.toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/giu, " ").trim();
    export function matchMethodId(method: string | null, methods: Array<{ id: string; name: string }>): string | null {
      const wanted = norm(method ?? "");
      if (!wanted) return null;
      const group = SYNONYMS.find((terms) => terms.some((term) => wanted.includes(norm(term))));
      const terms = (group ?? [wanted]).map(norm);
      // Лише «назва методу містить термін»: навпаки «уф друк».includes(«друк»)
      // прив'язав би УФ-друк до загального «Друк» — вигадане нанесення гірше за порожнє.
      const found = methods.find((item) => terms.some((term) => norm(item.name) === term || norm(item.name).includes(term)));
      return found?.id ?? null;
    }
    export function withHintImprints(draft, methodsByKind) {
      if (!draft.imprintHint || draft.imprintHintApplied || draft.imprints.length > 0 || !draft.catalog) return draft;
      const methods = methodsByKind[draft.catalog.kindId]?.methods;
      if (!methods) return draft;
      const methodId = matchMethodId(draft.imprintHint.method, methods);
      if (!methodId) return draft;
      return { ...draft, imprints: [{ key: `${draft.key}-hint`, methodId, positionId: null, positionLabel: draft.imprintHint.place }] };
    }
    ```
  - `usePoolCandidates.ts`: для чернеток, де `isFileDraft(d) && d.links.length === 0 && !d.supplierProductId && !d.tzName`, шукає `searchSupplierPool(d.name, { limit: 5 })` раз на назву (кеш у `useRef<Map<string, PoolCandidates>>`), статус «loading» → «done»; `setState` ЛИШЕ в `.then` промісу (ратчет set-state-in-effect); помилка → `{ status: "done", products: [] }`. Повертає мапу `draft.key → PoolCandidates`.
  - `ImportDraftRow.tsx`: пропси `candidates?: PoolCandidates; onPickCandidate?: (product: SupplierPoolProduct) => void`. Блок під мета-рядком: `loading` → «Шукаю схожі в пулі…» (text-2xs muted); `done` з товарами → підпис «Схожі в пулі» і до 5 кнопок-карток (фото 40×40 `object-cover rounded-md` або заглушка, назва `truncate max-w-[180px]`, під нею `{vendor ?? supplierSlug} · {article ?? "без артикула"}` і `від {priceMin} {currency}` коли є), `aria-label={`Обрати «${product.name}»`}`; `done` без товарів — нічого.
  - `QuoteWizardDialog.tsx`:
    1. Винести з `handleAddSupplierProduct` чисту `supplierProductDraftFields(product)` (усе, що зараз іде в `makeDraft({...})`: name, color, sku, poolPrice, supplierUrl, avantprintUrl, isKids, supplierProductId, catalog-вгадування) — `handleAddSupplierProduct` користується нею, поведінка та сама.
    2. `bindCandidate(draftKey, product)`: `setDrafts(prev => prev.map(d => d.key === draftKey ? { ...d, ...supplierProductDraftFields(product), tzName: d.tzName ?? d.name, imprints: d.imprints, runs: d.runs, requirements: d.requirements, imprintHint: d.imprintHint, comment: d.comment, sourceRows: d.sourceRows } : d))` + те саме засівання прев'ю фото, що робить `handleAddSupplierProduct` для нової чернетки.
    3. Рендер рядків: `const shown = withHintImprints(draft, optionsByKind)` → `draft={shown}`; `candidates={poolCandidates[draft.key]}`, `onPickCandidate={(p) => bindCandidate(draft.key, p)}`; `onChangeImprints` → `changeImprints(draft.key, next)` і `patchDraft(draft.key, { imprintHintApplied: true })` (людина торкнулась — підмішувати більше не можна).
    4. `handleCreate`: у `writeDraftsToQuote` передавати `selected.map((d) => withHintImprints(d, optionsByKind))`.
- [ ] **Step 4:** тести зелені; `npm run check:fast`.
- [ ] **Step 5: Commit:** тема «Позиція з файлу пропонує схожі товари з пулу, а нанесення з ТЗ стає чипами», трейлер `Закриває: REQ-182#p27, REQ-182#p28`.

---

### Task 4: Файл від клієнта й умови закупівлі на «Створити» (REQ-182#p30, #p31)

**Files:**
- Modify: `src/features/taskChat/queries.ts` (винести `insertThreadMessage`, експортувати `notifyThreadMessage`)
- Modify: `src/features/quotes/quote-import/importFlow.ts` (`attachImportExtras`)
- Modify: `src/features/quotes/quote-wizard/QuoteWizardDialog.tsx` (зберегти `File` і `conditions`; виклик після запису)
- Test: `importFlow.test.ts`; `src/features/taskChat/queries.test.tsx` лишається зеленим

**Interfaces — Produces:**
```ts
// taskChat/queries.ts
export async function insertThreadMessage(threadKey: string, input: SendMessageInput): Promise<ThreadEntry>; // те, що було mutationFn
export async function notifyThreadMessage(threadKey: string, body: string): Promise<void>; // уже є — зробити export
// importFlow.ts
export async function attachImportExtras(input: { quoteId: string; teamId: string; file: File | null; conditions: string[] }): Promise<{ fileAttached: boolean; conditionsPosted: boolean; errors: string[] }>;
export function conditionsMessage(conditions: string[]): string; // "Умови з ТЗ:\n• …\n• …"
```

- [ ] **Step 1: Failing tests** (`importFlow.test.ts`; моки: `@/lib/currentUser` → `getCurrentUserId: async () => "u-1"`; у фабрику моку `@/features/quotes/quote-details/queries` додати `uploadQuoteAttachmentFile: vi.fn(async () => ({ ok: true, data: {} }))`; `vi.mock("@/features/taskChat/queries", () => ({ insertThreadMessage: vi.fn(async () => ({})), notifyThreadMessage: vi.fn(async () => undefined) }))`):
```ts
it("файл лягає у «Файли прорахунку», умови — одним повідомленням в обговорення", async () => {
  const file = new File(["x"], "ТЗ.docx");
  const result = await attachImportExtras({ quoteId: "q-1", teamId: "t-1", file, conditions: ["Доставка до РЦ Луцьк", "Зразок за 5 робочих днів"] });
  expect(uploadQuoteAttachmentFile).toHaveBeenCalledWith(expect.objectContaining({ quoteId: "q-1", teamId: "t-1", file, uploadedBy: "u-1", audience: "project" }));
  expect(insertThreadMessage).toHaveBeenCalledWith("quote:q-1", expect.objectContaining({ body: "Умови з ТЗ:\n• Доставка до РЦ Луцьк\n• Зразок за 5 робочих днів", visibility: "team", quoteId: "q-1", teamId: "t-1", userId: "u-1" }));
  expect(result).toEqual({ fileAttached: true, conditionsPosted: true, errors: [] });
});
it("без умов повідомлення немає; невдалий файл — помилка словами, а не виняток", async () => {
  uploadQuoteAttachmentFile.mockResolvedValueOnce({ ok: false, message: "квота" });
  const result = await attachImportExtras({ quoteId: "q-1", teamId: "t-1", file: new File(["x"], "a.xlsx"), conditions: [] });
  expect(insertThreadMessage).not.toHaveBeenCalled();
  expect(result.fileAttached).toBe(false);
  expect(result.errors[0]).toContain("a.xlsx");
});
```
- [ ] **Step 2:** впасти.
- [ ] **Step 3: Implementation.**
  - `taskChat/queries.ts`: тіло `mutationFn` → `export async function insertThreadMessage(threadKey, input)`; `mutationFn: (input) => insertThreadMessage(threadKey!, input)`; `notifyThreadMessage` — `export`. Поведінка хука не міняється (тест розмонтування `queries.test.tsx` має лишитись зеленим).
  - `importFlow.ts`:
    ```ts
    export function conditionsMessage(conditions: string[]): string {
      return ["Умови з ТЗ:", ...conditions.map((condition) => `• ${condition}`)].join("\n");
    }
    export async function attachImportExtras(input) {
      const errors: string[] = [];
      const userId = await getCurrentUserId();
      if (!userId) return { fileAttached: false, conditionsPosted: false, errors: ["Сесія застаріла — файл і умови не збережено."] };
      let fileAttached = false;
      if (input.file) {
        const uploaded = await uploadQuoteAttachmentFile({ teamId: input.teamId, quoteId: input.quoteId, file: input.file, uploadedBy: userId, audience: "project", bucket: ITEM_VISUAL_BUCKET });
        fileAttached = uploaded.ok;
        if (!uploaded.ok) errors.push(`Файл «${input.file.name}» не прикріпився: ${uploaded.message}`);
      }
      let conditionsPosted = false;
      if (input.conditions.length > 0) {
        const threadKey = threadKeyForQuote(input.quoteId);
        const body = conditionsMessage(input.conditions);
        try {
          await insertThreadMessage(threadKey, { body, visibility: "team", teamId: input.teamId, quoteId: input.quoteId, userId });
          conditionsPosted = true;
          void notifyThreadMessage(threadKey, body);
        } catch {
          errors.push("Умови з ТЗ не лягли в обговорення — додайте їх туди руками.");
        }
      }
      return { fileAttached, conditionsPosted, errors };
    }
    ```
    (імпорти: `getCurrentUserId` з `@/lib/currentUser`, `ITEM_VISUAL_BUCKET` з `@/features/quotes/quote-details/config`, `threadKeyForQuote` з `@/lib/taskThread`.)
  - `QuoteWizardDialog.tsx`: `sourceFileRef = React.useRef<File | null>(null)` і стан `conditions`; у `handleFile` після успіху `sourceFileRef.current = file; setConditions(outcome.conditions)`; скидати там, де скидається `fileName` (`clearFile`, `reset`); у `handleCreate` після успішного `writeDraftsToQuote` і `startImportResearch` — `const extras = await attachImportExtras({ quoteId, teamId, file: sourceFileRef.current, conditions })`, кожну `extras.errors` → `toast.warning(...)`; тост успіху лишається.
- [ ] **Step 4:** тести зелені; `npm run check:fast`.
- [ ] **Step 5: Commit:** тема «Файл від клієнта лягає у файли прорахунку, а умови закупівлі — в обговорення», трейлер `Закриває: REQ-182#p30, REQ-182#p31`.

---

### Task 5: Перевірка очима й документ

- [ ] **Step 1:** тимчасовий `e2e/_tz_positions.spec.ts` (ВИДАЛИТИ після): підміна `**/.netlify/functions/quote-import-parse` через `page.route` відповіддю зі справжнього виклику Task 1 (ТЗ на жилетку), `setInputFiles` справжнім `.docx`; очікувати «Вимоги з ТЗ · N», «Нанесення з ТЗ: …», «Схожі в пулі» (пул — живий, лише читання); знімок `locator.screenshot` у scratchpad. НЕ натискати «Створити» (сторож записів завалить тест). Запуск: `npx playwright test e2e/_tz_positions.spec.ts --project=checks`.
- [ ] **Step 2:** `docs/QUOTE_IMPORT_DESIGN.md` §2б: статус → «зроблено локально 24.09.2026», відхилення від задуму — якщо були (одним абзацом).
- [ ] **Step 3:** `npm run check`; коміт документа (без трейлера — пункти закрито попередніми комітами).

---

## Self-review (виконано автором плану)

- Покриття §2б: #p26 → Task 1; #p27/#p28 → Task 3; #p29 → Task 2 (+ `whitespace-pre-line` у картці, бо опис там уже показується); #p30/#p31 → Task 4; перевірка → Task 5.
- Імена: `requirements`/`imprintHint`/`tzName`/`imprintHintApplied`, `formatImprintHint`, `buildItemDescription`, `matchMethodId`, `withHintImprints`, `usePoolCandidates`/`PoolCandidates`, `insertThreadMessage`/`notifyThreadMessage`, `attachImportExtras`/`conditionsMessage` — однакові в усіх задачах.
- «Імпорт з файлу» в картці прорахунку отримує вимоги й опис автоматично (спільні `toDraftItems`/`buildImportItemPayload`/`ImportDraftRow`); кандидати, файл і умови — лише у візарді, як у задумі.
