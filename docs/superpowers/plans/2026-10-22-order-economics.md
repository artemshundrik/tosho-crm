# Вкладка «Економіка» в замовленні — план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** бухгалтерія вносить у замовленні рахунки постачальників і підрядників, оплачений рядок стає витратою у Фінансах, склад підтверджує отримання документом, без цього не виписується ВН, а замовлення показує залишок і маржу від суми рахунку.

**Architecture:** нова таблиця `tosho.order_purchases` + security-definer RPC (весь запис і читання для не-фінансових ролей іде через них); гейт ВН і захист витрат — тригерами в базі. Клієнт: чиста логіка в `orderPurchases.ts`, запити в `orderPurchaseQueries.ts`, уся проводка в хуку `useOrderEconomicsPanel` (сторінка замовлення не росте), вкладка `OrderEconomicsTab`. Фінанси й головна сторінка читають ті самі рядки.

**Tech Stack:** React 19 + Vite + TypeScript 7, Supabase (Postgres, схема `tosho`), Vitest + Testing Library, Playwright, oxlint.

**Spec:** [docs/superpowers/specs/2026-10-22-order-economics-design.md](../specs/2026-10-22-order-economics-design.md) (бриф: [2026-10-20-order-economics-brief.md](../specs/2026-10-20-order-economics-brief.md)). Картка REQ-56.

## Global Constraints

- Схема `tosho`. Прод-SQL накочує Артем: `set -a; . ./.env.backup; set +a; npm run db:apply scripts/order-purchases.sql`. Перевірка в проді — лише читанням або в транзакції з `rollback`.
- Кожна нова функція: `set search_path = tosho, public, auth`; `revoke all ... from public, anon`; `grant execute ... to authenticated` лише для RPC. Нова таблиця: RLS увімкнено, `revoke all ... from anon, public` (default ACL інакше дає гранти). `npm run check` включає `check:db-guards` — він має бути чистим.
- Посади (SQL `job_role` у `tosho.memberships`, `role = 'owner'` — власник):
  - **writer** (вносить, оплачує, бачить маржу) = `tosho.is_order_invoice_issuer(uid)`: owner, `seo`, `accountant`, `chief_accountant`;
  - **amounts** (бачить суми) = writer + `junior_accountant` (= `tosho.has_finance_access`);
  - **receiver** (склад: підтверджує отримання) = writer + `logistics`, `head_of_logistics`, `head_of_production`, `pm`;
  - **none-marker** («закупок немає») = лише `accountant`, `chief_accountant`.
- ФОП: `cost_with_vat = round(amount * 1.2, 2)`; «з ПДВ»: `cost_with_vat = amount`. ПДВ витрати: з ПДВ → `round(paid / 6, 2)`, ФОП → `0`.
- Сума рахунку для маржі = `tosho.order_payment_total(order)` (на клієнті — `Number(record.total)`, той самий дзеркальний розрахунок, що в `useOrderPaymentPanel`).
- `src/pages/OrdersProductionDetailsPage.tsx` не може вирости ні на рядок (`check:file-growth`): кожен доданий рядок компенсуй стисненням поруч.
- Нові RPC — у `MUTATING_RPCS` (`src/lib/viewOnlyGuard.ts`) і `e2e/writeGuard.ts` (крім `list_*`); `writeGuard.test.ts` стереже збіг.
- Стрічка подій: без сум і без назв постачальників.
- Під час роботи `npm run check:fast`; перед «готово» `npm run check`. Коміти з людською темою; останній коміт етапу — трейлер окремим рядком `Закриває: REQ-56#c7, REQ-56#c9, REQ-56#c10, REQ-56#c11`. Пушу немає.

## Відхилення від дизайну (знайдено під час планування)

- **«Місяць закритий — скасування оплати відмовляє»** — знято: остаточного закриття місяця для витрат у базі немає (є лише нагадування `finance-month-close-*`). Скасування дозволено завжди.
- **Лічильник у сайдбарі** — знято з етапу: у сайдбарі немає механізму лічильників, а блок на головній закриває потребу.
- **«Маржа» у Фінансах для молодшого бухгалтера** вже схована (`canSeeSensitive` у `FinancesPage.tsx` — лише суперадмін і головбух). Нічого робити не треба.
- **Розпізнавання рахунку з PDF/Word** (Влад, 22.10) — наступний етап, не цей. Поле для файлу рахунку теж не додаємо зараз.

## Review Focus

1. Менеджер відкриває замовлення або кличе `list_order_purchases` / `select` напряму → вкладки немає, RPC кидає 42501, `select` дає 0 рядків.
2. Склад (`pm`) кличе `list_order_purchases` → `amount`, `cost_with_vat`, `paid_on`, `expense_id` приходять `null`; підсумку на екрані немає.
3. Бухгалтер у Фінансах міняє суму чи видаляє витрату, що походить із закупки → помилка 42501 з текстом «Витрату із закупки виправляють у замовленні»; категорію й нотатки змінити можна.
4. ВН вносять на замовленні без рядків і без позначки, або з неотриманим рядком → тригер кидає помилку з переліком; замовлення «актом» і замовлення, де ВН уже стояла, — без перевірки.
5. Сума рахунку 0 або валюта USD/EUR → маржа не рахується, текст замість числа; ділення на нуль ніде немає.

---

### Task 1: База — таблиця, доступи, RPC, тригери

**Files:**
- Create: `scripts/order-purchases.sql`
- Modify: `docs/DB_MAP.md` (новий розділ «Order purchases» поруч з «Order payments»)
- Modify: `src/lib/database.types.ts` (таблиця, нові колонки `orders`, RPC — вручну, за зразком `finance_payments` / `record_order_payment`)

**Interfaces:**
- Produces (SQL):
  - таблиця `tosho.order_purchases`: `id uuid pk`, `team_id uuid not null`, `order_id uuid not null → orders on delete cascade`, `order_item_id uuid → order_items on delete set null`, `description text not null` (1–300), `supplier_name text not null`, `supplier_invoice_number text`, `supplier_invoice_date date not null`, `qty numeric`, `unit text`, `amount numeric(14,2) not null check (amount >= 0)`, `vat_mode text not null default 'with_vat' check in ('with_vat','no_vat')`, `cost_with_vat numeric(14,2) generated always as (...) stored`, `received_on date`, `received_qty numeric`, `received_doc_kind text check in ('waybill','act')`, `received_doc_number text`, `received_by uuid`, `received_at timestamptz`, `expense_id uuid unique → finance_expenses on delete restrict`, `paid_on date`, `created_by uuid`, `created_at`, `updated_at`.
  - `tosho.orders`: `purchases_none_at timestamptz`, `purchases_none_by uuid`.
  - хелпери (не для клієнта): `tosho.is_order_purchase_receiver(uuid) → boolean`, `tosho.is_order_purchase_none_marker(uuid) → boolean`, `tosho.assert_order_purchase_access(_team_id uuid, _need text)` де `_need in ('writer','receiver','none_marker')`.
  - RPC:
    - `save_order_purchase(p_id uuid, p_order_id uuid, p_order_item_id uuid, p_description text, p_supplier_name text, p_invoice_number text, p_invoice_date date, p_qty numeric, p_unit text, p_amount numeric, p_vat_mode text) → uuid` (writer; `p_id null` = новий; на оплаченому міняє лише `description`, `supplier_invoice_number`, `qty`, `unit`; відмова, якщо на замовленні стоїть «закупок немає»);
    - `delete_order_purchase(p_id uuid) → void` (writer; лише неоплачений);
    - `pay_order_purchase(p_id uuid, p_paid_on date, p_account_id uuid, p_amount numeric) → uuid` (writer; створює `finance_expenses` і пише `expense_id`, `paid_on`; категорія «Закупки під замовлення», `kind = 'variable'`, створюється для команди, якщо немає; `legal_entity_id` = `orders.our_legal_entity_id`; `notes` = `'<quote_number або order id> · <description> · <invoice number>'`; рахунок має бути цієї команди; `p_paid_on` не в майбутньому);
    - `cancel_order_purchase_payment(p_id uuid, p_reason text) → void` (writer; причина обов'язкова; видаляє витрату під прапорцем `tosho.purchase_sync`, чистить `expense_id`, `paid_on`);
    - `confirm_order_purchase_receipt(p_id uuid, p_received_on date, p_received_qty numeric, p_doc_kind text, p_doc_number text) → void` (receiver; усе обов'язкове, дата не в майбутньому, кількість > 0; повторний виклик виправляє);
    - `set_order_purchases_none(p_order_id uuid, p_none boolean) → void` (none-marker; відмова, якщо є рядки);
    - `list_order_purchases(p_order_id uuid) → jsonb` (writer, amounts або receiver; для receiver-без-amounts поля `amount`, `cost_with_vat`, `vat_mode`, `paid_on`, `expense_id` = `null`); масив об'єктів із ключами як колонки таблиці + `received_by_name`;
    - `list_pending_purchase_receipts(p_team_id uuid) → jsonb` (receiver або writer): `{ pending: [{purchase_id, order_id, order_number, description, supplier_name, supplier_invoice_number, supplier_invoice_date}], none_orders: [{order_id, order_number, marked_at, marked_by_name}] }` по замовленнях з `order_status not in ('completed','cancelled')`; без сум.
  - Тригери: `finance_expenses_purchase_guard` (before update or delete на `finance_expenses`; якщо витрата зв'язана з `order_purchases`, `auth.uid()` не null і `tosho.purchase_sync` ≠ `on`: delete → 42501; update `amount`/`currency`/`expense_date` → 42501, текст «Витрату із закупки виправляють у замовленні»); `orders_waybill_purchase_gate` (before update of `waybill_number`; коли `old.waybill_number is null and new.waybill_number is not null`, `coalesce(new.closing_document,'waybill') <> 'act'`, `auth.uid()` не null: немає рядків і `purchases_none_at is null` → помилка «Внесіть закупки або позначку «закупок немає»»; є рядки з `received_on is null` → «Склад ще не підтвердив отримання: <description, …>»; errcode `P0001`).
  - RLS на `order_purchases`: `select` — `public.is_team_member(team_id) and tosho.has_finance_access(team_id)`; insert/update/delete — немає політик (лише RPC).

- [ ] **Step 1: Написати `scripts/order-purchases.sql`** за інтерфейсом вище, у стилі `scripts/order-payments.sql` (шапка «НАВІЩО», `create ... if not exists`, ідемпотентно, `notify pgrst, 'reload schema'` у кінці).

- [ ] **Step 2: Прогнати файл на проді в транзакції з rollback** і приміряти ролі (агент `rls-verifier`, `model: "opus"` не потрібен — він сам лише читає): для `seo`, `accountant`, `junior_accountant`, `pm`, `logistics`, `manager` — `list_order_purchases`, `save_order_purchase`, `pay_order_purchase`, `confirm_order_purchase_receipt`, `set_order_purchases_none`, прямий `select`.
  Очікувано: таблиця з п. «Хто що робить» дизайну; manager — 42501 скрізь, `select` 0 рядків; pm — список без сум, receipt проходить, save — 42501; junior — список із сумами, save — 42501; accountant — усе; `update finance_expenses set amount=...` на витраті із закупки — 42501, `set notes=...` — проходить; `update orders set waybill_number='РН-1'` на замовленні без рядків — помилка гейта, на замовленні з `closing_document='act'` — проходить.

- [ ] **Step 3: Віддати Артему команду накатки** (класифікатор не дає мені писати в прод) і після накатки перевірити читанням: `select count(*) from tosho.order_purchases;` → `0`, `\df tosho.*purchase*` → 9 функцій.

- [ ] **Step 4: Оновити `docs/DB_MAP.md` і `src/lib/database.types.ts`**; `npm run check:fast` → чисто.

- [ ] **Step 5: Commit** — тема: «Закупки під замовлення зберігаються в базі: рахунок постачальника, оплата у Фінанси, отримання складом і заборона ВН без нього».

---

### Task 2: Логіка економіки на клієнті

**Files:**
- Create: `src/features/orders/orderPurchases.ts`
- Test: `src/features/orders/orderPurchases.test.ts`
- Modify: `src/lib/permissions.ts` (поруч із `canIssueOrderInvoice`)

**Interfaces:**
- Produces:
  ```ts
  export type PurchaseVatMode = "with_vat" | "no_vat";
  export type OrderPurchase = {
    id: string; orderId: string; orderItemId: string | null;
    description: string; supplierName: string;
    supplierInvoiceNumber: string | null; supplierInvoiceDate: string;
    qty: number | null; unit: string | null;
    amount: number | null; vatMode: PurchaseVatMode | null; costWithVat: number | null; // null — суми сховані
    receivedOn: string | null; receivedQty: number | null;
    receivedDocKind: "waybill" | "act" | null; receivedDocNumber: string | null; receivedByName: string | null;
    expenseId: string | null; paidOn: string | null;
  };
  export function purchaseCostWithVat(amount: number, vatMode: PurchaseVatMode): number;
  export function purchaseExpenseVat(paid: number, vatMode: PurchaseVatMode): number;
  export type OrderEconomicsSummary = {
    invoiceTotal: number; costAll: number; costPaid: number;
    expectedRemainder: number; confirmedRemainder: number;
    marginPct: number | null; expectedMarginPct: number | null; // null — немає суми або валюта
    received: number; total: number;
  };
  export function summarizeOrderEconomics(purchases: OrderPurchase[], invoiceTotal: number, currency: string | null): OrderEconomicsSummary;
  export type PurchaseGroup = { itemId: string | null; title: string; qtyLabel: string | null; purchases: OrderPurchase[] };
  export function groupPurchasesByItem(purchases: OrderPurchase[], items: { id: string; name: string; qty: number | null; unit: string | null }[]): PurchaseGroup[];
  export function isPurchaseShortReceived(p: OrderPurchase): boolean; // receivedQty < qty
  export function waybillBlockers(purchases: OrderPurchase[], purchasesNone: boolean): string[]; // [] — можна
  ```
  У `permissions.ts`: `canViewOrderEconomics`, `canSeeOrderPurchaseAmounts`, `canSeeOrderMargin`, `canEditOrderPurchases`, `canConfirmPurchaseReceipt`, `canMarkNoPurchases` — усі `(accessRole, jobRole) => boolean`, ролі з Global Constraints.

- [ ] **Step 1: Тести** (`orderPurchases.test.ts`), значення з таблиці 378:
  ```ts
  expect(purchaseCostWithVat(1000, "no_vat")).toBe(1200);
  expect(purchaseCostWithVat(5250.3, "with_vat")).toBe(5250.3);
  expect(purchaseCostWithVat(16.67, "no_vat")).toBe(20); // 20.004 → 20.00
  expect(purchaseExpenseVat(6434.5, "with_vat")).toBe(1072.42);
  expect(purchaseExpenseVat(1000, "no_vat")).toBe(0);
  // 378: рахунок 95 400; рядки 16,50 · 26,10 · 5 250,30 · 6 434,50 · 44 699,18 · 70,00 · 0,00 — оплачені всі, крім 44 699,18
  const s = summarizeOrderEconomics(rows378, 95400, "UAH");
  expect(s.costAll).toBe(56496.58);
  expect(s.expectedRemainder).toBe(38903.42);
  expect(s.confirmedRemainder).toBe(83602.6);
  expect(s.expectedMarginPct).toBeCloseTo(40.78, 2);
  expect(summarizeOrderEconomics(rows378, 0, "UAH").marginPct).toBeNull();
  expect(summarizeOrderEconomics(rows378, 95400, "USD").marginPct).toBeNull();
  expect(summarizeOrderEconomics([lineWithHiddenAmounts], 95400, "UAH").costAll).toBe(0);
  expect(groupPurchasesByItem([wholeOrderLine, itemLine], items).at(-1)?.title).toBe("На все замовлення");
  expect(waybillBlockers([], false)).toEqual(["Внесіть закупки або позначку «закупок немає»"]);
  expect(waybillBlockers([], true)).toEqual([]);
  expect(waybillBlockers([unreceived("Парасолі")], false)).toEqual(["Склад ще не підтвердив отримання: Парасолі"]);
  ```
  Плюс по одному тесту на кожну функцію доступу: `pm` → `canConfirmPurchaseReceipt` true, `canSeeOrderPurchaseAmounts` false; `junior_accountant` → amounts true, margin false; `manager` → `canViewOrderEconomics` false; `accountant` → `canMarkNoPurchases` true, `seo` → false.

- [ ] **Step 2:** `npx vitest run src/features/orders/orderPurchases.test.ts` → FAIL (модуля немає).
- [ ] **Step 3:** Реалізувати. Гроші — копійками (`Math.round(x * 100) / 100`) після кожної операції; `marginPct` від `confirmedRemainder`.
- [ ] **Step 4:** Той самий запуск → PASS; `npm run check:fast` → чисто.
- [ ] **Step 5: Commit** — «Маржа замовлення рахується з рахунку замовнику мінус закупки, ФОП-рахунки з поправкою на ПДВ».

---

### Task 3: Запити й сторожі записів

**Files:**
- Create: `src/features/orders/orderPurchaseQueries.ts`
- Modify: `src/lib/viewOnlyGuard.ts`, `e2e/writeGuard.ts`

**Interfaces:**
- Consumes: RPC з Task 1; `OrderPurchase` з Task 2.
- Produces:
  ```ts
  export type SavePurchaseInput = { id: string | null; orderId: string; orderItemId: string | null; description: string; supplierName: string; invoiceNumber: string | null; invoiceDate: string; qty: number | null; unit: string | null; amount: number; vatMode: PurchaseVatMode };
  export function listOrderPurchases(orderId: string): Promise<OrderPurchase[]>;
  export function saveOrderPurchase(input: SavePurchaseInput): Promise<string>;
  export function deleteOrderPurchase(id: string): Promise<void>;
  export function payOrderPurchase(input: { id: string; paidOn: string; accountId: string; amount: number }): Promise<string>;
  export function cancelOrderPurchasePayment(id: string, reason: string): Promise<void>;
  export function confirmOrderPurchaseReceipt(input: { id: string; receivedOn: string; receivedQty: number; docKind: "waybill" | "act"; docNumber: string }): Promise<void>;
  export function setOrderPurchasesNone(orderId: string, none: boolean): Promise<void>;
  export type PendingReceipts = { pending: Array<{ purchaseId: string; orderId: string; orderNumber: string; description: string; supplierName: string; supplierInvoiceNumber: string | null; supplierInvoiceDate: string }>; noneOrders: Array<{ orderId: string; orderNumber: string; markedAt: string; markedByName: string | null }> };
  export function listPendingPurchaseReceipts(teamId: string): Promise<PendingReceipts>;
  export function listSupplierNameHints(teamId: string): Promise<string[]>; // distinct supplier_name з order_purchases (лише для amounts-ролей) + finance_expenses.supplier_name, до 200
  ```
  RPC — через `supabase.schema("tosho").rpc(...)`, як в `orderPaymentQueries.ts`; помилки кидаються з текстом бази.

- [ ] **Step 1:** Додати в обидва списки сторожів: `cancel_order_purchase_payment`, `confirm_order_purchase_receipt`, `delete_order_purchase`, `pay_order_purchase`, `save_order_purchase`, `set_order_purchases_none` (за абеткою, як сусіди).
- [ ] **Step 2:** `npx vitest run e2e/writeGuard.test.ts src/lib` → PASS (тест збігу списків).
- [ ] **Step 3:** Написати `orderPurchaseQueries.ts` (мапінг snake → camel, числа через `Number()`, `null` зберігається).
- [ ] **Step 4:** `npm run check:fast` → чисто.
- [ ] **Step 5: Commit** — «Режим «приміряти роль» і перевірки в браузері не можуть записати закупки в прод».

---

### Task 4: Вкладка «Економіка»

**Files:**
- Create: `src/features/orders/order-details/useOrderEconomicsPanel.tsx`
- Create: `src/features/orders/order-details/OrderEconomicsTab.tsx`
- Create: `src/features/orders/order-details/OrderPurchaseDialog.tsx` (внести/правити рядок)
- Create: `src/features/orders/order-details/OrderPurchasePayDialog.tsx` (оплата + скасування з причиною — дві форми одного віконця)
- Create: `src/features/orders/order-details/OrderPurchaseReceiptDialog.tsx`
- Test: `src/features/orders/order-details/OrderEconomicsTab.test.tsx`
- Modify: `src/pages/OrdersProductionDetailsPage.tsx` (тип вкладки, елемент у `orderTabs`, рендер — без росту файлу)

**Interfaces:**
- Consumes: Task 2 (логіка, доступи), Task 3 (запити), `listOrderPaymentAccounts(teamId, legalEntityId, quoteId, prefer)` з `orderPaymentQueries.ts` для рахунку списання.
- Produces:
  ```ts
  export function useOrderEconomicsPanel(args: { record: DerivedOrderRecord | null; teamId: string | null | undefined; userId: string | null | undefined; accessRole: string | null | undefined; jobRole: string | null | undefined; onChanged: () => void }): {
    tab: { value: "economics"; label: "Економіка"; badge: string | null } | null; // null — посаді вкладка не належить або запис не stored
    content: React.ReactNode; // вкладка + віконця
    purchases: OrderPurchase[]; purchasesNone: boolean; // для Task 5
  };
  ```
  `badge` — `"отримано N/M"` для складу, `"<marginPct>%"` для тих, хто бачить маржу, інакше кількість рядків.

- [ ] **Step 1: Тести компонента** (`OrderEconomicsTab.test.tsx`, рендер `OrderEconomicsTab` з пропсами, без мережі):
  - роль accountant, 378: видно «95 400,00», «Залишок», «Маржа», групу «Парасоля з логотипом - 200 шт», кнопки «+ Закупка» й «Оплачено»;
  - роль junior_accountant: суми рядків видно, «Залишок» і «Маржа» — ні, кнопок запису немає;
  - роль pm: сум немає ніде (`queryByText(/5 250/)` → null), видно «отримано 6 з 7», кнопка «Отримано» на неотриманому рядку;
  - ФОП-рядок 1 000: видно «1 000,00 → 1 200,00 з ПДВ»;
  - `purchasesNone`: замість рядків — «Закупок немає · <хто>», «+ Закупка» немає;
  - отримано менше, ніж у рахунку: рядок має позначку «недовіз» для бухгалтера.
- [ ] **Step 2:** `npx vitest run src/features/orders/order-details/OrderEconomicsTab.test.tsx` → FAIL.
- [ ] **Step 3: Реалізувати компоненти.** Підсумок — мова дому «велике число + смуга» (див. `OrderPaymentCard`), тони з `src/lib/statusTones.ts`; від'ємний залишок — `danger`. Рядки згруповані `groupPurchasesByItem`. `OrderPurchaseDialog`: поля з дизайну, «ФОП, без ПДВ» — перемикач, підказки постачальника з `listSupplierNameHints`, після «Зберегти й ще одну» віконце лишається відкритим з тією ж позицією й постачальником (серія 5–7 рядків). `OrderPurchasePayDialog`: «Сьогодні / Вчора / інша» за київським часом — перевикористати хелпер дат із `OrderPaymentDialog.tsx` (винести в `src/features/orders/kyivDate.ts`, якщо він там локальний), сума за замовчуванням = `amount`. Валюта замовлення USD/EUR — підсумок показує «маржа для валютних замовлень — поки ні».
- [ ] **Step 4: Хук.** Завантажує `listOrderPurchases` при зміні `record.id`; після кожного запису — перезавантаження + `onChanged`; тости з текстом помилки бази; подія в стрічку — Task 6.
- [ ] **Step 5: Сторінка.** `OrderPageTab` += `"economics"`; `orderTabs` += `economicsPanel.tab` (лише коли не null); `{activeTab === "economics" ? economicsPanel.content : null}`. `npm run check:file-growth` → без росту (компенсуй стисненням сусідніх рядків, як із `useOrderPaymentPanel`).
- [ ] **Step 6:** тести Step 1 → PASS; `npm run check:fast` → чисто.
- [ ] **Step 7: Commit** — «У замовленні з'явилась вкладка «Економіка»: бухгалтерія вносить закупки й оплати постачальникам, склад відмічає отримання, видно залишок і маржу».

---

### Task 5: Гейт ВН в інтерфейсі й позначка «закупок немає»

**Files:**
- Modify: `src/features/orders/order-details/OrderClosingDocumentDeskCard.tsx`
- Modify: `src/features/orders/order-details/OrderEconomicsTab.tsx` (кнопка «Закупок немає» / «Зняти позначку»)
- Modify: `src/pages/OrdersProductionDetailsPage.tsx` (передати `waybillBlockers(...)` у картку — без росту)
- Test: доповнити `OrderEconomicsTab.test.tsx`; новий `OrderClosingDocumentDeskCard.test.tsx`

**Interfaces:**
- Consumes: `waybillBlockers`, `canMarkNoPurchases` (Task 2), `setOrderPurchasesNone` (Task 3), `purchases`/`purchasesNone` з `useOrderEconomicsPanel` (Task 4).
- Produces: проп `waybillBlockers?: string[]` у `OrderClosingDocumentDeskCard`.

- [ ] **Step 1: Тести:** картка з `closingDocument` ВН і `waybillBlockers=["Склад ще не підтвердив отримання: Парасолі"]` → поле номера ВН неактивне, текст блокера видно; з актом — проп ігнорується; `[]` → поле активне. У вкладці: accountant без рядків бачить «Закупок немає», seo — не бачить; з рядками кнопки немає.
- [ ] **Step 2:** запуск → FAIL. **Step 3:** реалізувати. **Step 4:** запуск → PASS, `npm run check:fast`.
- [ ] **Step 5: Commit** — «ВН не внести, поки склад не підтвердив отримання закупок; для замовлень без закупок бухгалтерія ставить позначку».

---

### Task 6: Події в стрічці замовлення

**Files:**
- Modify: `src/features/taskChat/threadEvents.ts` (нова дія `order_purchase` у переліку подій, підпис і значок як в `order_payment`)
- Modify: `src/features/orders/order-details/useOrderEconomicsPanel.tsx`
- Test: доповнити тест подій у `src/features/taskChat` (якщо є тест переліку дій — додати `order_purchase`)

**Interfaces:**
- Consumes: `logActivity` (`src/lib/activityLogger.ts`) з тим самим `entityType: "orders"`, `href`, `metadata` `{quote_id, order_id}`, що в `useOrderPayments.followUp`.
- Produces: `ORDER_PURCHASE_EVENT = "order_purchase"`. Заголовки рівно: «Внесено закупку», «Закупку оплачено», «Скасовано оплату закупки: <причина>», «Товар отримано», «Позначено: закупок немає», «Знято позначку «закупок немає»».

- [ ] **Step 1:** тест: заголовки не містять цифр сум і назви постачальника (перевірити на прикладі рядка «Коробка-200 шт», постачальник «КОРОБКА», сума 5 250,30).
- [ ] **Step 2–4:** FAIL → реалізувати (подія пишеться одразу, без 10-секундного відкладання — скасування оплати закупки йде окремою дією з причиною) → PASS, `npm run check:fast`.
- [ ] **Step 5: Commit** — «У стрічці замовлення видно, коли внесли, оплатили й отримали закупку — без сум».

---

### Task 7: Фінанси

**Files:**
- Modify: `src/features/finances/api.ts` (у витратах — `orderPurchase: { orderId, orderNumber } | null` для витрат, зв'язаних із закупкою; новий `listPaidOrderPurchaseCosts(teamId)` → `Array<{ quoteId: string | null; orderId: string; orderNumber: string; costWithVat: number; expenseId: string }>`)
- Modify: `src/features/finances/types.ts`
- Modify: `src/features/finances/FinanceMargin.tsx`
- Modify: компонент списку витрат у `src/features/finances/` (той, де кнопки «Редагувати»/«Видалити» витрати)
- Test: `src/features/finances/financeMarginRows.test.ts` (винести розрахунок рядків маржі з `FinanceMargin.tsx` у `financeMarginRows.ts`, якщо він там у `useMemo`)

**Interfaces:**
- Consumes: таблиця `order_purchases` (прямий `select`, бо Фінанси бачать лише `has_finance_access`).
- Produces: `buildFinanceMarginRows({ invoices, payments, expenses, purchaseCosts, ordersByQuote })` — витрати рядка = Σ `costWithVat` оплачених закупок цього прорахунку + Σ розподілів витрат, **крім** `expenseId`, що є серед `purchaseCosts`; замовлення без `quoteId` — окремий рядок з ключем `order:<orderId>`.

- [ ] **Step 1: Тести:** витрата 6 434,50 зі зв'язаною закупкою і розподілом на той самий прорахунок рахується один раз (6 434,50); ФОП-закупка 1 000 дає витрату маржі 1 200; замовлення без прорахунку дає власний рядок.
- [ ] **Step 2–4:** FAIL → реалізувати → PASS. У заголовку колонки маржі — «по оплатах». Витрата із закупки в списку витрат: бейдж «Замовлення <номер>», без «Видалити», у віконці редагування сума, валюта й дата неактивні з підказкою «Виправляють у замовленні».
- [ ] **Step 5:** `npm run check:fast` → чисто. **Commit** — «У Фінансах закупки під замовлення рахуються в маржі один раз, а витрату із закупки не можна переписати чи видалити».

---

### Task 8: «Документи постачальників» на головній

**Files:**
- Create: `src/features/overview/SupplierDocumentsCard.tsx`
- Modify: `src/pages/OverviewPage.tsx` (показати картку поруч з `OverviewAside` для `jobRole` in `pm`, `logistics`, `head_of_logistics`, `head_of_production` і для owner/seo)
- Test: `src/features/overview/SupplierDocumentsCard.test.tsx`

**Interfaces:**
- Consumes: `listPendingPurchaseReceipts` (Task 3), `canConfirmPurchaseReceipt` (Task 2).
- Produces: `SupplierDocumentsCard({ data, now }: { data: PendingReceipts; now: Date })` — чиста розмітка; завантаження — в `OverviewPage`.

- [ ] **Step 1: Тести:** два розділи «Чекають документів» і «Без закупок»; рядки згруповані за постачальником; рядок із датою рахунку 8+ днів тому — угорі й із тоном попередження; клік-посилання веде на `/orders/production/<orderId>`; порожньо в обох — картка не рендериться; сум немає.
- [ ] **Step 2–4:** FAIL → реалізувати → PASS, `npm run check:fast`.
- [ ] **Step 5: Commit** — «Проджект і склад бачать на головній, які документи постачальників ще не прийшли й де бухгалтерія позначила «закупок немає»».

---

### Task 9: Прибрати заглушку «Економіка» з прорахунку

**Files:**
- Delete: `src/features/quotes/quote-details/EconomicsComingSoon.tsx`
- Modify: `src/pages/QuoteDetailsPage.tsx` (вкладка `soon: true` ~:3976 і рендер ~:5458 — див. `docs/LARGE_FILES_MAP.md`)

- [ ] **Step 1:** видалити вкладку, рендер і імпорт; `npm run check:fast` → чисто (немає мертвих імпортів, файл не виріс).
- [ ] **Step 2: Commit** — «З прорахунку прибрано порожню вкладку «Економіка» — економіка тепер у замовленні».

---

### Task 10: Перевірка живцем, рецензія, закриття

- [ ] **Step 1: Браузер.** Тимчасовий `e2e/_economics.spec.ts` (`--project=checks`, фікстура `guard`, тестовий акаунт SEO): відкрити замовлення, вкладка «Економіка» є; «+ Закупка» → заповнити → «Зберегти» перехоплено сторожем (`guard.blockedWrites` містить `save_order_purchase`), у прод не пішло; віконце оплати відкривається з сумою рядка й «Сьогодні»; картка ВН показує блокер. Скріншот вкладки — Артему. Файл спеки видалити після.
- [ ] **Step 2:** `npm run check` → усі 17 перевірок чисті.
- [ ] **Step 3: Рецензія** — агент з `model: "opus"` на весь дифф етапу (база, RLS, гроші), потім `/security-review`. Виправлення — окремими комітами.
- [ ] **Step 4:** Останній коміт етапу з трейлером окремим рядком:
  ```
  Закриває: REQ-56#c7, REQ-56#c9, REQ-56#c10, REQ-56#c11
  ```
  (c12 — гейт закриття й зарплати — наступний етап, лишається відкритим.)
- [ ] **Step 5:** Звіт «накопичено N комітів, готові до викочування» + що перевірено в браузері, а що ні. Не пушити.
