# Картка замовника й ліда: панель «чого бракує» + повна сторінка — план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Клік по замовнику чи ліду відкриває не модальне вікно на 1 800 рядків, а бічну панель, яка одразу каже, чого бракує для роботи, і дає дописати це на місці; важке редагування реквізитів переїжджає на повну сторінку `/orders/customers/:id`.

**Architecture:** Дві глибини над одними правилами. Чиста функція готовності (`partyReadiness.ts`) — єдине джерело «чого бракує» для панелі, сторінки й переведення ліда. Панель — це `EntityPeek` (уже не модальний на десктопі й нижній аркуш на телефоні), кожне поле в ній пишеться одразу й лише собою (`partyFieldWrite.ts`). Сторінка редагує реквізити, контакти й доставку формою з «Зберегти», під замком розділу й з питанням перед закриттям.

**Tech Stack:** React 19, TypeScript 7, Vite, react-router, Supabase (схема `tosho`), vitest + Testing Library (`.test.tsx`), Phosphor через `appIcons`, Sonner.

**Spec:** прототип https://claude.ai/artifact/DdGE2bbSJ6oamEPr6ctd6S (кадри Main, Lead, Customer-Phone, Lead-Phone, States) — його погодив Артем 01.11.2026 з однією правкою вигляду (нижче, «Вигляд»). Окремого spec-документа немає: рішення, що йдуть від прототипу, зведені в розділі «Рішення» цього плану.

## Global Constraints

- Ніякого `git push` без «пушимо»/«викочуй»/«деплой». Комітимо локально.
- Під час роботи — `npm run check:fast`; перед «готово до викочування» — `npm run check`.
- Тема коміта людською мовою (що змінилось для менеджера), технічне — у тіло. Трейлер окремим рядком: `Закриває: REQ-N#pM`. Кінець коміта: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `git add` — лише свої файли поіменно. Чужі незакомічені `docs/mobile-audit/`, `docs/superpowers/specs/2026-10-23-supplier-invoice-recognition-design.md` не чіпати.
- Схема бази — `tosho`. Будь-який `update` у Supabase — з `.select("id")`: без нього RLS мовчки віддає нуль рядків.
- Новий файл не росте до 2 000 рядків (`check:file-growth`); `CustomerDialog.tsx`, `LeadDialog.tsx`, `OrdersCustomersPage.tsx` не ростуть узагалі.
- Значки — лише з `@/components/icons/appIcons`. Аватарки — канонічний кіт, не голий `<img>`. Дати — `<DateInput>`.
- **Вигляд:** кнопки й нейтральний текст не лежать на кольорових плашках. Попередження = нейтральна поверхня (`bg-card`/`border`) і маленький кольоровий знак (крапка `warning` чи значок `danger`). Суцільний тінт — лише там, де весь текст того ж відтінку (зелене «готово»). Тони — з `statusTones.ts`, не сирі значення.
- Тексти інтерфейсу — українською, як у прототипі; нижче вони наведені дослівно там, де фіксуються.
- Поведінку перевіряти в прев'ю (`preview_start` `dev`). «Зберегти» в прев'ю пише в прод — правки лише на тестовому замовнику (див. памʼять «Прев'ю: тестовий акаунт»), стан повернути як був.

## Рішення (з прототипу)

1. **Сім пунктів готовності на «Рахунку»**: форма власності, ЄДРПОУ/ІПН, юридична адреса (для ФОП — «прописка»), IBAN, посада підписанта, телефон, пошта для документів. На «Готівці» пункт один — телефон. Це рівно правило `getLeadConversionMissingFields` — тепер воно живе в одному модулі для ліда й замовника.
2. **Формати**: ЄДРПОУ — 8 цифр, ІПН ФОП — 10, ІПН платника ПДВ — 12, IBAN — `UA` + 27 цифр. Банк визначається з IBAN: цифри 5–10 — МФО.
3. **Панель** не модальна (список під нею живе), закривається Esc і хрестиком, завантаження показує скелет ~700 мс без стрибка вмісту. Поля панелі пишуться одразу, по одному.
4. **У панелі одразу правляться** лише «дешеві» поля, що лежать окремими колонками: форма оплати, бухгалтер (імʼя, пошта, ЄДРПОУ), нотатки, нагадування. Реквізити, контакти й точки доставки — jsonb-масиви: їх панель показує, а «Змінити» веде на відповідний розділ сторінки (щоб не переписати чужу правку всім масивом).
5. **Сторінка** `/orders/customers/:id`: розділи Огляд / Контакти / Реквізити / Доставка / Прорахунки й замовлення / Файли. Редагування Реквізитів/Контактів/Доставки — одна форма з «Зберегти», замок лише на реквізитах, «Закрити без збереження?» перед втратою правок.
6. **Лід**: панель з тими ж сімома пунктами; «Перевести в замовники» відкриває форму лише з полями, яких бракує; після переведення 6 с висить «Тепер замовник · Скасувати», і в базу переведення йде лише після цього (скасування нічого не відкочує, бо нічого ще не записано).
7. **Новий лід — перевірки на вході**: Telegram у полі телефону, пошта без «@» чи з «тг…», «Рекомендація» відкриває поле «Хто порекомендував», підказка про дубль (наявний `CompanyDuplicateHint`).
8. **Підказки з контексту** в панелі: замовлення не відвантажене й без адреси доставки; погоджений прорахунок із сумою 0 ₴; КП без руху понад 60 днів → «Поставити нагадування».
9. **Дизайнер** бачить лише папку Dropbox, дизайн-задачі й логотип — без грошей і реквізитів, без «немає доступу».
10. **Стани**: не завантажилось (лишається відоме з місця кліку + «Спробувати ще»), реквізити під замком іншої людини («Попросити передати»), не зберіглось (введене не губиться, «Повторити»).

## Review Focus

1. **Дві вкладки, одне поле.** Менеджер А змінив пошту бухгалтера в панелі, менеджер Б тим часом — нотатки на сторінці без замка. Очікування: обидві правки живі. Тест: `partyFieldWrite` шле в `update` лише змінену колонку (Task 3).
2. **Ланцюг правок під час повільної мережі.** Людина міняє «Рахунок → Готівка → Рахунок» швидше, ніж приходить відповідь. Очікування: у базі останнє значення, індикатор не «застрягає» на старому. Тест на `usePartyFieldSave`: відповідь першого запиту, що прийшла пізніше за другий, не перезаписує стан (Task 3).
3. **IBAN з пробілами й малими літерами** (`ua 30 5299 …` вставлено з банку). Очікування: приймається, нормалізується, банк визначається. Тест у `ukrainianRequisites.test.ts` (Task 2).
4. **Лід закрили посеред «Скасувати».** Панель закрили чи перейшли на іншу сторінку, поки висить 6-секундне вікно. Очікування: переведення все одно відбувається, а не губиться. Тест на `useDeferredConversion`: `flush()` на розмонтуванні (Task 6).
5. **Прямий URL на чужого/видаленого замовника** `/orders/customers/<uuid>`. Очікування: «Замовника не знайдено» з посиланням у список, не порожня сторінка й не вічний скелет. Тест на `CustomerPage` з порожньою відповіддю (Task 5).

---

### Task 0: Картка й чекліст

**Files:** немає (дошка).

- [ ] **Step 1:** Скілом `tosho-request` завести картку «Картка замовника й ліда: панель “чого бракує” і повна сторінка», текстом — посилання на цей план і на прототип.
- [ ] **Step 2:** Дописати в неї чекліст `checklist` пунктами Task 1…Task 9 (назви задач цього плану). Запамʼятати адреси `REQ-N#p1…p9`; далі в планах вони згадуються як `REQ-N#pK`.
- [ ] **Step 3:** `move` → `in_progress`.

---

### Task 1: Одне правило «чого бракує»

**Files:**
- Create: `src/components/customers/partyReadiness.ts`
- Create: `src/components/customers/partyReadiness.test.ts`
- Modify: `src/components/customers/leadRecord.ts:100-121` (`getLeadConversionMissingFields` стає обгорткою)
- Test: `src/components/customers/cashCustomerRules.test.ts` (має лишитись зеленим без змін)

**Interfaces:**
- Produces:
  ```ts
  export type PartyReadinessKey =
    | "ownership" | "taxId" | "legalAddress" | "iban" | "signatory" | "phone" | "documentEmail";
  export type PartyReadinessInput = {
    paymentType: "cash" | "invoice";
    ownershipType: string;      // "fop" | "tov" | … | ""
    taxId: string;
    legalAddress: string;
    iban: string;
    signatoryPosition: string;
    phones: string[];
    documentEmail: string;      // пошта контакту або бухгалтера — що непорожнє
  };
  export type PartyReadinessItem = { key: PartyReadinessKey; label: string; done: boolean };
  export type PartyReadiness = { items: PartyReadinessItem[]; done: number; total: number; missing: PartyReadinessKey[] };
  export function getPartyReadiness(input: PartyReadinessInput): PartyReadiness;
  export function customerReadinessInput(form: CustomerFormState): PartyReadinessInput;
  export function leadReadinessInput(form: LeadFormState, phones: string[]): PartyReadinessInput;
  ```
  Підписи (`label`) — дослівно ті, що зараз у `getLeadConversionMissingFields`: «форма власності», «ЄДРПОУ / ІПН» (ФОП — «ІПН»), «юридична адреса» (ФОП — «прописка»), «IBAN», «посада підписанта», «телефон», «email».

- [ ] **Step 1: Тести**

  ```ts
  describe("getPartyReadiness", () => {
    it("на Готівці один пункт — телефон", () => {
      expect(getPartyReadiness({ ...EMPTY, paymentType: "cash" }).total).toBe(1);
      expect(getPartyReadiness({ ...EMPTY, paymentType: "cash", phones: ["+380671234567"] }).missing).toEqual([]);
    });
    it("на Рахунку сім пунктів у сталому порядку", () => {
      expect(getPartyReadiness(EMPTY).missing).toEqual(
        ["ownership", "taxId", "legalAddress", "iban", "signatory", "phone", "documentEmail"]);
    });
    it("ФОП називає ІПН і прописку", () => {
      const r = getPartyReadiness({ ...EMPTY, ownershipType: "fop" });
      expect(r.items.find((i) => i.key === "taxId")?.label).toBe("ІПН");
      expect(r.items.find((i) => i.key === "legalAddress")?.label).toBe("прописка");
    });
    it("пробіли — не значення", () => {
      expect(getPartyReadiness({ ...EMPTY, iban: "   " }).missing).toContain("iban");
    });
    it("MAS Seeds з прототипу: 1/7", () => {
      expect(getPartyReadiness({ ...EMPTY, phones: ["+380501112233"] }).done).toBe(1);
    });
  });
  it("getLeadConversionMissingFields віддає ті самі підписи, що й раніше", () => { /* знімок на наявних кейсах з cashCustomerRules.test.ts */ });
  ```
  `customerReadinessInput` бере реквізити з `getPrimaryCustomerLegalEntity(form.legalEntities)`, телефони — з контактів, `documentEmail` — перша непорожня з `form.accountantEmail` і пошти основного контакту.

- [ ] **Step 2:** `npx vitest run src/components/customers/partyReadiness.test.ts` → FAIL (модуля немає).
- [ ] **Step 3:** Реалізувати. `getLeadConversionMissingFields` = `getPartyReadiness(leadReadinessInput(form, phones)).items.filter(!done).map(label)`. У шапці модуля — рядок `Читачі:` (leadRecord, панель, сторінка, форма переведення).
- [ ] **Step 4:** `npx vitest run src/components/customers` → PASS, включно з `cashCustomerRules.test.ts`.
- [ ] **Step 5: Коміт** — тема «Правило “чого бракує для роботи з замовником” тепер одне для ліда й замовника»; трейлер `Закриває: REQ-N#p1`.

---

### Task 2: Реквізити: формати й банк з IBAN

**Files:**
- Create: `src/lib/ukrainianRequisites.ts`
- Create: `src/lib/ukrainianRequisites.test.ts`
- Modify: `src/components/customers/IbanInput.tsx` (показати банк під полем)

**Interfaces:**
- Produces:
  ```ts
  export function normalizeIban(raw: string): string;                 // без пробілів, верхній регістр
  export function ibanIssue(raw: string): string | null;              // null — гаразд
  export function bankFromIban(raw: string): { mfo: string; bankName: string | null } | null;
  export function taxIdIssue(raw: string, ownershipType: string): string | null; // ФОП 10, інакше 8
  export function vatIdIssue(raw: string): string | null;             // 12 або порожньо
  ```
  Тексти помилок: «IBAN — це UA і 27 цифр», «ЄДРПОУ — 8 цифр», «ІПН ФОП — 10 цифр», «ІПН платника ПДВ — 12 цифр».

- [ ] **Step 1: Тести**

  ```ts
  expect(normalizeIban(" ua 30 3052 9900 …")).toMatch(/^UA\d{27}$/);
  expect(bankFromIban("UA303052990000026007000000000")).toEqual({ mfo: "305299", bankName: "АТ КБ «ПриватБанк»" });
  expect(bankFromIban("UA30999999…")?.bankName).toBeNull();        // невідомий МФО — не вигадуємо
  expect(ibanIssue("UA30305299")).toBe("IBAN — це UA і 27 цифр");
  expect(taxIdIssue("44885114", "tov")).toBeNull();
  expect(taxIdIssue("44885114", "fop")).toBe("ІПН ФОП — 10 цифр");
  expect(vatIdIssue("448851126587")).toBeNull();
  expect(vatIdIssue("")).toBeNull();
  ```
- [ ] **Step 2:** Запустити → FAIL.
- [ ] **Step 3: Довідник МФО — з наших даних, не з памʼяті.** Прочитати (Supabase MCP, лише `select`) пари «МФО з IBAN → `bank_name`» з `tosho.customers.legal_entities`; узяти МФО, де ≥2 записи і назва одна. Записати їх константою `BANKS_BY_MFO` з коментарем «зібрано з реквізитів замовників 01.11.2026». Невідомий МФО → `bankName: null`, а інтерфейс тоді просто не підставляє банк.
- [ ] **Step 4:** `IbanInput` під полем показує «Банк: <назва> · МФО <код>»; якщо поле `bankName` юрособи порожнє — пропонує «Підставити» (не пише сам).
- [ ] **Step 5:** `npx vitest run src/lib/ukrainianRequisites.test.ts` → PASS; `npm run check:fast`.
- [ ] **Step 6: Коміт** — «Банк підставляється з IBAN, а неповний ЄДРПОУ чи ІПН видно одразу»; `Закриває: REQ-N#p2`.

---

### Task 3: Запис одного поля

**Files:**
- Create: `src/components/customers/partyFieldWrite.ts`
- Create: `src/components/customers/usePartyFieldSave.ts`
- Create: `src/components/customers/partyFieldWrite.test.ts`
- Create: `src/components/customers/usePartyFieldSave.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type CustomerFieldPatch = Partial<Pick<TableUpdate<"customers">,
    "payment_type" | "accountant_name" | "accountant_email" | "accountant_edrpou" |
    "notes" | "reminder_at" | "reminder_comment">>;
  export type LeadFieldPatch = Partial<Pick<TableUpdate<"leads">,
    "payment_type" | "notes" | "reminder_at" | "reminder_comment">>;
  export type FieldWriteResult = { ok: true } | { ok: false; reason: "gone" | "network"; message: string };
  export function writeCustomerFields(customerId: string, patch: CustomerFieldPatch): Promise<FieldWriteResult>;
  export function writeLeadFields(leadId: string, patch: LeadFieldPatch): Promise<FieldWriteResult>;

  export type FieldSaveState = "idle" | "saving" | "saved" | "error";
  export function usePartyFieldSave<P>(write: (patch: P) => Promise<FieldWriteResult>): {
    save: (field: string, patch: P) => void;
    stateOf: (field: string) => { state: FieldSaveState; message: string | null };
    retry: (field: string) => void;
  };
  ```
  `writeCustomerFields`: `supabase.schema("tosho").from("customers").update(patch).eq("id", id).select("id")`; нуль рядків → `reason: "gone"`, текст «Замовника вже немає або він вам недоступний»; помилка мережі → `"network"`, текст «Не зберіглось: немає звʼязку. Те, що ви ввели, не пропало.»

- [ ] **Step 1: Тести** (мок `@/lib/supabaseClient`, як у `cashCustomerRules.test.ts`):
  - `writeCustomerFields("c1", { accountant_email: "a@b.ua" })` кличе `update` рівно з `{ accountant_email: "a@b.ua" }` — без `legal_entities`, `contacts`, `name`.
  - порожній масив з `.select` → `{ ok: false, reason: "gone" }`.
  - хук: два `save("payment_type", …)` поспіль, перша відповідь приходить ПІСЛЯ другої → `stateOf` віддає результат другої (лічильник запиту на поле).
  - хук: помилка → `state: "error"`, `retry` повторює той самий патч.
- [ ] **Step 2:** Запустити → FAIL.
- [ ] **Step 3:** Реалізувати. Порожній рядок у патчі перетворювати на `null` у місці виклику, не в `write*`. `"saved"` гасне в `"idle"` за 1,5 с.
- [ ] **Step 4:** PASS + `npm run check:fast`.
- [ ] **Step 5: Коміт** — «Поле картки зберігається саме собою й не затирає того, що поруч змінив колега»; `Закриває: REQ-N#p3`.

---

### Task 4: Бічна панель замовника

**Files:**
- Create: `src/components/customers/panel/CustomerPanel.tsx` — склад панелі й завантаження
- Create: `src/components/customers/panel/ReadinessBlock.tsx` — «Готово 5 з 7» + пункти
- Create: `src/components/customers/panel/PanelSections.tsx` — оплата, реквізити (читання), бухгалтер, доставка, гроші, контакти, прорахунки
- Create: `src/components/customers/panel/partyContextHints.ts` + `.test.ts`
- Create: `src/components/customers/customerDropbox.ts` — винести з `OrdersCustomersPage.tsx:170-230` типи й читання/запис посилань
- Create: `src/components/customers/panel/CustomerPanel.test.tsx`
- Modify: `src/components/customers/PartyCardHost.tsx` — для `customerId` рендерить `CustomerPanel` замість `CustomerDialog`
- Modify: `src/pages/OrdersCustomersPage.tsx` — імпорт Dropbox-помічників з нового модуля (файл має зменшитись)

**Interfaces:**
- Consumes: `getPartyReadiness`, `customerReadinessInput` (Task 1); `bankFromIban` (Task 2); `writeCustomerFields`, `usePartyFieldSave` (Task 3); `loadPartyLinkedRecords` (`partyLinkedRecords.ts`); `EntityPeek` (`src/components/app/peek/EntityPeek.tsx`); `canViewOrderEconomics`, `isDesignerJobRole` (`src/lib/permissions.ts`); замок `useEntityLock` з `sectionLockType("customer", "requisites")`.
- Produces:
  ```ts
  export function CustomerPanel(props: { customerId: string; fallbackName?: string | null; onClose: () => void;
    onSaved?: (r: PartyCardSavedResult) => void }): JSX.Element;
  export type PartyContextHint =
    | { kind: "order_without_delivery"; orderId: string; orderNumber: string }
    | { kind: "approved_zero_total"; quoteId: string; quoteNumber: string }
    | { kind: "stale_offer"; quoteId: string; quoteNumber: string; days: number };
  export function getPartyContextHints(input: { records: PartyLinkedRecords; hasDeliveryPoint: boolean; now: Date }): PartyContextHint[];
  export function ReadinessBlock(props: { readiness: PartyReadiness; onJump: (key: PartyReadinessKey) => void }): JSX.Element;
  ```
  `EntityPeek` пропси: `section="Замовники"`, `number` = ЄДРПОУ/ІПН основної юрособи або «без коду», `numberCopyMessage="Код скопійовано"`, `title` = назва, `onOpenFull` → `navigate(\`/orders/customers/${id}\`)`, без `onPrev/onNext`.

- [ ] **Step 1: Тести підказок** — `getPartyContextHints`:
  - погоджений прорахунок з `total: 0` → `approved_zero_total`;
  - КП (статус «надіслано») без змін 61 день → `stale_offer` з `days: 61`; 59 днів → нічого;
  - незвантажене замовлення при `hasDeliveryPoint: false` → `order_without_delivery`; при `true` → нічого.
- [ ] **Step 2: Тест панелі** (`CustomerPanel.test.tsx`, моки запитів):
  - під час завантаження — скелет, назва з `fallbackName` уже видна;
  - «Рахунок» без IBAN → у `ReadinessBlock` «Готово 6 з 7» і пункт «IBAN»;
  - клік «Готівка» → `writeCustomerFields` з `{ payment_type: "cash" }`, блок готовності показує «Готово 1 з 1»;
  - роль дизайнера → немає тексту «Гроші» і «Реквізити», є «Папка в Dropbox»;
  - запит упав → «Картку не завантажили» + «Спробувати ще», назва лишилась.
- [ ] **Step 3:** Запустити → FAIL.
- [ ] **Step 4:** Реалізувати за кадром Main прототипу. Пункт готовності, що правиться в панелі (пошта бухгалтера), відкриває поле на місці; решта — «Змінити» → сторінка з `?section=requisites|contacts|delivery`. Попередження — нейтральна картка з крапкою/значком (Global Constraints, «Вигляд»). Під замком іншої людини реквізити показуються «лише перегляд» з «Попросити передати» (`requestEntityLockRelease`), решта панелі правиться.
- [ ] **Step 5:** PASS + `npm run check:fast` (у т. ч. `check:file-growth`: `OrdersCustomersPage.tsx` менший, ніж був).
- [ ] **Step 6: Прев'ю.** Прорахунок → клік по замовнику → панель; список під нею гортається; Esc закриває; «Готівка/Рахунок» на тестовому замовнику зберігається й повертається як було. Телефон 375×812: нижній аркуш, свайп униз закриває. Скріншоти — у звіт.
- [ ] **Step 7: Коміт** — «Клік по замовнику відкриває панель збоку: одразу видно, чого бракує для рахунку, і дрібне можна дописати на місці»; `Закриває: REQ-N#p4`.

---

### Task 5: Повна сторінка замовника

**Files:**
- Create: `src/pages/CustomerPage.tsx` — маршрут, завантаження, навігація розділами (≤ 600 рядків)
- Create: `src/components/customers/page/CustomerPageSections.tsx` — Огляд, Контакти, Доставка, Прорахунки й замовлення, Файли
- Create: `src/components/customers/page/RequisitesEditor.tsx` — юрособи з перевірками Task 2
- Create: `src/components/customers/page/useCustomerPageForm.ts` — стан форми (`CustomerFormState`), «брудна», збереження через `saveCustomerCard`
- Create: `src/pages/CustomerPage.test.tsx`
- Modify: `src/App.tsx:1042-1050` (маршрут `orders/customers/:id` у той самий `ModuleRouteGate moduleKey="customers"`), `src/layout/routes.ts` (`customerPage: (id: string) => \`/orders/customers/${id}\``), `src/layout/pageSurfaces.ts:190` (новий запис, `shape` за `check:page-surfaces`), `headerConfig` в `src/layout/AppLayout.tsx` (крихти «Замовники → <назва>»)
- Modify: `docs/CODEX_PROJECT_GUIDE.md` (маршрут), `docs/LARGE_FILES_MAP.md` не чіпати, якщо нових гігантів немає

**Interfaces:**
- Consumes: Task 1–4; `parseCustomerLegalEntities`, `saveCustomerCard` (`partyCardSave.ts`); `useUnsavedGuard`, `UnsavedChangesPrompt` (`src/components/ui/unsaved-guard.tsx`); `useEntityLock` + `EntityLockBanner`; `customerDropbox.ts` (Task 4).
- Produces: маршрут `/orders/customers/:id?section=overview|contacts|requisites|delivery|work|files`; `CustomerPanel` → «Повна» веде сюди.

- [ ] **Step 1: Тести** (`CustomerPage.test.tsx`):
  - `?section=requisites` відкриває розділ «Реквізити»;
  - «Змінити» в Реквізитах бере замок `sectionLockType("customer","requisites")`; замок у когось іншого → банер «<імʼя> редагує реквізити» і поля лише для читання;
  - ЄДРПОУ «4488511» → під полем «ЄДРПОУ — 8 цифр», «Зберегти» неактивна;
  - змінили поле, тиснуть «Скасувати» → «Закрити без збереження?»; «Лишитись» тримає введене;
  - відповідь з нулем рядків → «Замовника не знайдено» і посилання «До списку замовників» (Review Focus 5).
- [ ] **Step 2:** Запустити → FAIL.
- [ ] **Step 3:** Реалізувати за кадром «Повна» прототипу. `beforeunload` — поки форма брудна. Перехід бічним меню під час правок не перехоплюємо (у застосунку немає data router) — записати це в шапці `useCustomerPageForm.ts` одним реченням.
- [ ] **Step 4:** Ширина < 768 px: розділи — акордеон (кадр Customer-Phone), відкритий той, що в `?section`.
- [ ] **Step 5:** PASS + `npm run check:fast`.
- [ ] **Step 6: Прев'ю.** Панель → «Повна» → правка ЄДРПОУ тестового замовника → «Зберегти» → назад, значення повернуто. Друга вкладка з тим самим замовником показує банер замка. Телефонна ширина — акордеон.
- [ ] **Step 7: Коміт** — «У замовника зʼявилась своя сторінка: реквізити, контакти й доставка редагуються там, і ніхто не перепише реквізити одночасно з вами»; `Закриває: REQ-N#p5`.

---

### Task 6: Панель ліда й переведення в замовники

**Files:**
- Create: `src/components/customers/panel/LeadPanel.tsx`
- Create: `src/components/customers/panel/LeadConversionForm.tsx`
- Create: `src/components/customers/panel/useDeferredConversion.ts` + `.test.ts`
- Create: `src/components/customers/panel/LeadPanel.test.tsx`
- Modify: `src/components/customers/PartyCardHost.tsx` — для `leadId` або ліда за назвою рендерить `LeadPanel`

**Interfaces:**
- Consumes: Task 1–4; `saveLeadCard({ …, convertToCustomer: true })` (`partyCardSave.ts:270-450`), `leadReadinessInput`, `writeLeadFields`.
- Produces:
  ```ts
  export function useDeferredConversion(run: () => Promise<void>, delayMs?: number /* 6000 */): {
    start: () => void; cancel: () => void; pending: boolean;
  };   // на розмонтуванні з pending — виконує run одразу
  ```

- [ ] **Step 1: Тести**
  - `useDeferredConversion`: `start` → за 5 999 мс `run` не викликано, за 6 000 — викликано один раз; `cancel` до строку → не викликано ніколи; розмонтування з `pending` → викликано одразу (Review Focus 4).
  - `LeadConversionForm` для MAS Seeds (є лише телефон, «Рахунок») показує рівно шість полів: форма власності, ЄДРПОУ/ІПН, юридична адреса, IBAN, посада підписанта, email; при «ФОП» поле ІПН вимагає 10 цифр, IBAN — `UA`+27.
  - «Готівка» в панелі ліда → форма переведення без полів, одразу кнопка «Перевести».
- [ ] **Step 2:** Запустити → FAIL.
- [ ] **Step 3:** Реалізувати за кадром Lead. Після «Перевести»: тост Sonner «MAS Seeds тепер замовник» з дією «Скасувати» на 6 с; після строку — `saveLeadCard(convertToCustomer)`, панель перемикається на `CustomerPanel` нового id і кличе `onSaved` з `convertedCustomerId`.
- [ ] **Step 4:** PASS + `npm run check:fast`.
- [ ] **Step 5: Прев'ю** на тестовому ліді: переведення, «Скасувати» (у базі нічого), повторне переведення до кінця; повернути тестовий лід як був (записати в звіт, як саме).
- [ ] **Step 6: Коміт** — «Лід переводиться в замовники з однієї коротшої форми: питає лише те, чого бракує, і переведення можна скасувати»; `Закриває: REQ-N#p6`.

---

### Task 7: Перевірки на вході нового ліда

**Files:**
- Create: `src/components/customers/leadEntryHints.ts` + `.test.ts`
- Create: `scripts/party-referred-by.sql` — `alter table tosho.leads add column if not exists referred_by text; alter table tosho.customers add column if not exists referred_by text;` (журнал `tosho.schema_migrations` звіряє вміст сам — `check:sql-journal` не пустить пуш, поки SQL не застосовано)
- Modify: `src/components/customers/LeadDialog.tsx` — лише підключити підказки й поле «Хто порекомендував» (рядків не більше, ніж забрали: дрібні шматки винести в `leadEntryHints`)
- Modify: `src/components/customers/partyCardSave.ts` — `referred_by` у payload ліда й перенесення в замовника при переведенні; додати колонку в список запасного варіанта старої схеми
- Modify: `docs/DB_MAP.md` (дві колонки)

**Interfaces:**
- Produces:
  ```ts
  export type LeadEntryHint =
    | { field: "phone"; kind: "telegram_in_phone"; telegram: string }   // «@masseeds» чи t.me/… у полі телефону
    | { field: "email"; kind: "not_email" }                              // без «@» або починається з «тг»/«tg»
    | { field: "referredBy"; kind: "referral_without_name" };            // джерело «Рекомендація», поле порожнє
  export function getLeadEntryHints(form: LeadFormState): LeadEntryHint[];
  ```
  Тексти: «Схоже на Telegram — перенести в поле Telegram?» (кнопка «Перенести»), «Це не схоже на пошту», «Від кого рекомендація?».

- [ ] **Step 1: Тести** — `"@masseeds"` і `"t.me/masseeds"` у телефоні → `telegram_in_phone` з `telegram: "@masseeds"`; `"+380 50 111 22 33"` → нічого; `"тг masseeds"` у пошті → `not_email`; `"info@mas.ua"` → нічого; джерело «Рекомендація» без `referredBy` → `referral_without_name`.
- [ ] **Step 2:** Запустити → FAIL.
- [ ] **Step 3:** Реалізувати; підказки — під полем, нейтральний текст зі значком, не червона плашка. Збереження НЕ блокують.
- [ ] **Step 4:** SQL не застосовувати самому: у звіті — команда `npm run db:apply scripts/party-referred-by.sql` для Артема, позначка «застосувати ДО пушу». Код читає колонку через запасний варіант схеми, тож до застосування нічого не падає — перевірити тестом, що помилка «column referred_by does not exist» веде в запасний payload.
- [ ] **Step 5:** PASS + `npm run check:fast`; прев'ю: новий лід, у телефон «@test» → підказка, «Перенести» переносить.
- [ ] **Step 6: Коміт** — «Новий лід підказує, коли Telegram вписали в телефон чи пошту, і питає, від кого рекомендація»; `Закриває: REQ-N#p7`.

---

### Task 8: Список «Замовники» відкриває ту саму панель

**Files:**
- Modify: `src/pages/OrdersCustomersPage.tsx` — клік по рядку замовника/ліда кличе `useOpenPartyCard()` замість `openForCustomer`/власного `LeadDialog` редагування; параметри `customerId`/`leadId` в адресі відкривають панель, `tab=…` веде на сторінку з відповідним `section`
- Modify: `src/components/customers/useCustomerEditor.ts`, `useLeadEditor.ts` — лишити тільки створення (видалити шляхи редагування, яких більше ніхто не кличе)
- Modify: `src/components/customers/PartyCardHost.tsx` — прибрати ліниве завантаження `CustomerDialog`/`LeadDialog`

**Interfaces:**
- Consumes: `OpenPartyCard` (`partyCardContext.ts`), панелі Task 4 і 6.

- [ ] **Step 1: Тест** — `OrdersCustomersPage` (наявний або новий `.test.tsx`): клік по рядку рендерить `CustomerPanel` (за `data-testid="party-panel"`), а не діалог з «Зберегти».
- [ ] **Step 2:** FAIL → реалізувати → PASS.
- [ ] **Step 3:** `rg "openForCustomer|openForLead" src` — лишились лише виклики створення. `npm run check:fast`: `OrdersCustomersPage.tsx`, `CustomerDialog.tsx`, `LeadDialog.tsx` не виросли.
- [ ] **Step 4: Прев'ю:** «Замовники» → рядок → панель; старе посилання `?customerId=…` відкриває панель; J/K у списку не ламаються.
- [ ] **Step 5: Коміт** — «У списку замовників картка відкривається тією самою панеллю, що й з прорахунку»; `Закриває: REQ-N#p8`.

---

### Task 9: Підсумкова перевірка

- [ ] **Step 1:** `npm run check` — зелене; вивід у звіт.
- [ ] **Step 2:** `/review` по всіх комітах плану (багатофайлова зміна, правило готовності — спільне для ліда й замовника).
- [ ] **Step 3:** Наскрізний прохід у прев'ю на десктопі й 375×812 за всіма кадрами прототипу: Main, Lead, Customer-Phone, Lead-Phone, States (чотири стани). Скріншоти — у звіт; стан тестових записів повернуто.
- [ ] **Step 4:** Памʼять: оновити `project_customer_card_redesign.md` (фази 2–3 → «панель + сторінка, план 2026-11-01»).
- [ ] **Step 5: Звіт** «накопичено N комітів, готові до викочування» + список + «SQL `referred_by` застосувати до пушу» — і чекати «пушимо». `Закриває: REQ-N#p9` — у коміті з оновленою памʼяттю/документами, якщо такий є; інакше пункт закриває Артем галочкою.

## Поза цим планом

- Створення нового замовника/ліда лишається в старих діалогах (`CustomerDialog`, `LeadDialog`) — переносити окремо, коли панель обкатається.
- Перехоплення переходу бічним меню з незбереженою сторінкою — потребує data router.
- REQ-348#p9 (Dropbox поза «Замовниками»): Task 4 виносить Dropbox у `customerDropbox.ts` і показує в панелі, але посилання досі живуть у `localStorage` одного браузера — перенесення в базу окремим пунктом.
