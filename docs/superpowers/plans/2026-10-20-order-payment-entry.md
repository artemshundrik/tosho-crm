# «Внести оплату» в замовленні — план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** бухгалтерія вносить надходження сумою й датою в замовленні; статус оплати, шлях до запуску й Фінанси беруть це з одного рядка `tosho.finance_payments`.

**Architecture:** запис і читання з замовлення — лише через security-definer RPC (менеджер таблиці не бачить); статус оплати перераховує RPC у тій самій транзакції, тригер на `orders` не дає ручному меню розійтися з сумою. Клієнт: чисті функції в `orderPayments.ts`, запити в `orderPaymentQueries.ts`, хук `useOrderPayments`, картка + два віконця.

**Tech Stack:** Postgres (Supabase, схема `tosho`), React 19 + TS 7, vitest, sonner, наявні примітиви діалогу й `DateInput`.

**Spec:** [docs/superpowers/specs/2026-10-20-order-payment-entry-design.md](../specs/2026-10-20-order-payment-entry-design.md)

## Global Constraints

- Права запису: `tosho.is_order_invoice_issuer(auth.uid())` (owner, seo, accountant, chief_accountant) + `public.is_team_member(order.team_id)` — обидві перевірки, бо перша команду не дивиться.
- Права бачити рахунок і № платіжки: `is_order_invoice_issuer` АБО `tosho.has_finance_access(team_id)`.
- Помилки RPC — `errcode '42501'` (права) / `'22023'` (дані), текст людський українською.
- `pre = round(total * prepayment_pct / 100, 2)`; пресети, якщо `prepayment_pct` null: `50/50`→50, `70/30`→70, `100_prepaid`→100, `100_after`→0 (`src/features/orders/config.ts:31`).
- Статус із суми: `paid >= total` → `fully_paid`; `(pre > 0 and paid >= pre) or (pre = 0 and paid > 0)` → `partially_paid` (але якщо поточний `awaiting_balance` — лишається `awaiting_balance`); інакше `awaiting_payment`.
- Прапорець для тригерів: `set_config('tosho.payment_sync', 'on', true)` лише всередині RPC.
- Швидкі суми: % з умов, 50, 70 — без дублів, > 0 і < залишку; потім «Увесь залишок», «Інша».
- Причини скасування: «Помилка в сумі», «Не те замовлення», «Дубль», «Повернули гроші».
- Подія стрічки: `action = "order_payment"`, `entityType "orders"`, `metadata { quote_id: record.linkedQuoteId ?? record.id, order_id }`.
- Затримка події й сповіщення після внесення: 10 с; «Скасувати» в тості — `undo_order_payment` (сервер пускає 30 с).
- Нічого не пушимо. Кожен коміт — людська тема, тіло — технічне; останній коміт — трейлер `Закриває: REQ-322#p26`.

## Review Focus

1. Менеджер шле прямий PostgREST-запит до `finance_payments` або RPC запису — має бути відмова (рольова приміряка, Task 1 крок 4).
2. Двічі клікнута «Внести» → два платежі. Кнопка неактивна, поки запит летить (Task 6, тест `disables submit while saving`).
3. Скасування останнього платежу на запущеному замовленні → статус «Очікує оплату», але запуск не відкочується і віконце попереджає (Task 1 тест-запит + Task 6 текст).
4. Сума «49 680» / «49680,5» / «49 680.00 грн» — розбір дає число; «0», «-5», «abc» → кнопка неактивна (Task 2 `parseAmountInput`).
5. Ручна зміна статусу оплати в меню, коли платежі є, → пункти неактивні з підписом, а прямий update — помилка тригера (Task 1 крок 4, Task 6).

---

### Task 1: База — колонки, тригери, RPC

**Files:**
- Create: `scripts/order-payments.sql` (шапка як у `scripts/orders-invoice-request.sql:1-27`: навіщо, чому RPC, `Застосування: npm run db:apply scripts/order-payments.sql`)
- Create (scratchpad, не в репо): `order-payments-probe.sql` — приміряка ролей у транзакції з `rollback`
- Modify: `src/lib/database.types.ts` (рядок ~2564 `finance_payments`: нові колонки; секція Functions: 4 RPC)

**Interfaces — Produces:**
- `finance_payments`: `order_id uuid null references tosho.orders(id) on delete restrict`, `cancelled_at timestamptz`, `cancelled_by uuid`, `cancel_reason text`; `check (order_id is null or amount > 0)`; індекс `finance_payments_order_active_idx (order_id) where cancelled_at is null`.
- `tosho.order_prepayment_amount(_order tosho.orders) returns numeric` (stable, за правилом з Global Constraints).
- `tosho.recompute_order_payment_status(_order_id uuid) returns text` (internal, без grant authenticated).
- `tosho.record_order_payment(p_order_id uuid, p_amount numeric, p_paid_at date, p_account_id uuid, p_bank_txn_ref text default null, p_notes text default null) returns jsonb` → `{payment_id, payment_status, paid_total}`.
- `tosho.cancel_order_payment(p_payment_id uuid, p_reason text) returns jsonb` → `{payment_status, paid_total}`.
- `tosho.undo_order_payment(p_payment_id uuid) returns jsonb` → `{payment_status, paid_total}`.
- `tosho.list_order_payments(p_order_id uuid) returns table(id uuid, amount numeric, paid_at date, kind text, created_at timestamptz, entered_by uuid, entered_by_name text, account_name text, bank_txn_ref text, notes text, cancelled_at timestamptz, cancel_reason text)`; `kind` ∈ `prepayment|balance` — за накопиченою сумою активних платежів до цього (`< pre` → prepayment); `entered_by_name` з `tosho.team_member_profiles` (або `memberships_view`), без email.
- Тригери: `finance_payments_link_order` (before insert/update: заповнює `order_id` з `quote_id`, якщо збігся з `orders.quote_id` або `orders.id` тієї ж команди); `finance_payments_guard_delete` (before delete: рядок з `order_id` — лише при `tosho.payment_sync = on`); `orders_payment_status_guard` (before update of payment_status: пропускає `auth.uid() is null`, прапорець, замовлення без активних платежів, і перехід `partially_paid ↔ awaiting_balance`, коли сума дає `partially_paid`; інакше `42501` «Статус оплати рахується з внесених оплат»).

- [ ] **Step 1: Написати приміряку (scratchpad), що впаде до міграції.** Транзакція, `set local role authenticated`, `set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true)` для трьох реальних користувачів тестової команди (бухгалтер, менеджер, бухгалтер іншої команди — взяти з `tosho.memberships`). Перевірки: бухгалтер `record_order_payment` 50% → `partially_paid`; менеджер те саме → `42501`; менеджер `select * from tosho.finance_payments` → 0 рядків; менеджер `list_order_payments` → `account_name is null and bank_txn_ref is null`; чужа команда → `42501`; менеджер `update tosho.orders set payment_status='fully_paid'` → помилка тригера; `partially_paid → awaiting_balance` менеджером — проходить; бухгалтер `cancel_order_payment` → `awaiting_payment`; `undo` чужого платежу → `42501`; `delete from finance_payments` рядка з order_id роллю бухгалтера → помилка; `p_amount = 0` → `22023`; `p_paid_at = current_date + 1` → `22023`. Наприкінці `rollback`.
- [ ] **Step 2: Прогнати** `psql "$BACKUP_DB_URL" -v ON_ERROR_STOP=0 -f <scratchpad>/order-payments-probe.sql` → помилки «function does not exist».
- [ ] **Step 3: Написати `scripts/order-payments.sql`** за Interfaces. Усі RPC: `security definer set search_path = tosho, public, auth`, `revoke all ... from public`, `grant execute ... to authenticated` (крім recompute). `record_order_payment` перевіряє: валюта замовлення `UAH` (інакше «Валютні оплати — поки у Фінансах»); `p_paid_at <= current_date` і `>= orders.created_at::date - 30`; рахунок цієї команди, `is_active`, і `legal_entity_id is null or = orders.our_legal_entity_id` (коли та є); `quote_id = coalesce(orders.quote_id, orders.id)`; `entered_by = auth.uid()`; `source 'manual'`. Блокування рядка замовлення `for update` перед перерахунком. Наприкінці `notify pgrst, 'reload schema'`.
- [ ] **Step 4: Застосувати й прогнати приміряку.** `npm run db:apply scripts/order-payments.sql -- --dry`, потім без `--dry`; приміряка → кожна перевірка дає очікуване. Окремо агент `rls-verifier` для `finance_payments` і чотирьох RPC — таблиця «хто що бачить/пише».
- [ ] **Step 5: Типи** — дописати колонки й RPC у `database.types.ts`; `npm run check:fast` зелений.
- [ ] **Step 6: Commit** — `git add scripts/order-payments.sql src/lib/database.types.ts`; тема «Оплати замовлення тепер зберігаються сумою й датою, і статус оплати рахується з них» (тіло: колонки, тригери, RPC, приміряка).

### Task 2: Чисті правила оплати

**Files:**
- Create: `src/features/orders/orderPayments.ts`
- Test: `src/features/orders/orderPayments.test.ts`

**Interfaces — Consumes:** `resolveBreakdown`, `LaunchPathInput` з `orderLaunchPath.ts`.
**Produces:**
- `type OrderPayment = { id: string; amount: number; paidAt: string; kind: "prepayment" | "balance"; createdAt: string; enteredBy: string | null; enteredByName: string | null; accountName: string | null; bankTxnRef: string | null; notes: string | null; cancelledAt: string | null; cancelReason: string | null }`
- `prepaymentAmount(total: number, input: LaunchPathInput): number`
- `paidTotal(payments: OrderPayment[]): number` (лише нескасовані)
- `derivePaymentStatus(paid: number, total: number, pre: number, current: string): "awaiting_payment" | "partially_paid" | "fully_paid" | "awaiting_balance"`
- `quickAmounts(total: number, prePct: number | null, paid: number): Array<{ key: string; label: string; amount: number | null }>`
- `parseAmountInput(raw: string): number | null`
- `paymentHint(paid: number, total: number, pre: number): string`
- `paymentWarnings(p: { amount: number; paid: number; total: number; pre: number; ref: string; payments: OrderPayment[] }): string[]`
- `CANCEL_REASONS` (з Global Constraints).

- [ ] **Step 1: Тести** (значення з прототипу, total 99 360, 50/50):
```ts
expect(prepaymentAmount(99360, { prepaymentPct: 50, balancePct: 50 } as LaunchPathInput)).toBe(49680);
expect(prepaymentAmount(99360, { paymentTerms: "70/30" } as LaunchPathInput)).toBe(69552);
expect(derivePaymentStatus(49680, 99360, 49680, "awaiting_payment")).toBe("partially_paid");
expect(derivePaymentStatus(45000, 99360, 49680, "awaiting_payment")).toBe("awaiting_payment");
expect(derivePaymentStatus(99360, 99360, 49680, "partially_paid")).toBe("fully_paid");
expect(derivePaymentStatus(60000, 99360, 49680, "awaiting_balance")).toBe("awaiting_balance");
expect(derivePaymentStatus(1, 99360, 0, "awaiting_payment")).toBe("partially_paid");
expect(quickAmounts(99360, 50, 0).map((c) => c.key)).toEqual(["p50", "p70", "rest", "other"]);
expect(quickAmounts(99360, 30, 0).map((c) => c.key)).toEqual(["p30", "p50", "p70", "rest", "other"]);
expect(quickAmounts(99360, 50, 49680).map((c) => c.key)).toEqual(["rest", "other"]);
expect(parseAmountInput("49 680,00")).toBe(49680);
expect(parseAmountInput("49680.5 грн")).toBe(49680.5);
expect(parseAmountInput("0")).toBeNull();
expect(parseAmountInput("-5")).toBeNull();
expect(parseAmountInput("abc")).toBeNull();
expect(paymentHint(45000, 99360, 49680)).toBe("До передоплати бракує 4 680,00 грн");
expect(paymentWarnings({ amount: 120000, paid: 0, total: 99360, pre: 49680, ref: "", payments: [] })[0]).toMatch(/^Більше за залишок на 20 640,00 грн/);
```
Плюс: скасований платіж не входить у `paidTotal`; дубль № платіжки серед нескасованих дає попередження «Платіжку № 9898 вже внесено».
- [ ] **Step 2:** `npx vitest run src/features/orders/orderPayments.test.ts` → FAIL (модуля немає).
- [ ] **Step 3:** реалізувати; гроші форматувати наявним `formatOrderMoney(n, "UAH")`, якщо дає «49 680,00 грн», інакше локальний форматер з тим самим виглядом.
- [ ] **Step 4:** той самий запуск → PASS.
- [ ] **Step 5: Commit** (разом із Task 3, якщо робиться підряд) — тема «Правила оплати замовлення: передоплата, статус і швидкі суми рахуються однаково всюди».

### Task 3: Запити до бази

**Files:**
- Create: `src/features/orders/orderPaymentQueries.ts`

**Interfaces — Consumes:** RPC з Task 1, `OrderPayment` з Task 2.
**Produces:**
- `listOrderPayments(orderId: string): Promise<OrderPayment[]>`
- `recordOrderPayment(input: { orderId: string; amount: number; paidAt: string; accountId: string; bankTxnRef?: string | null; notes?: string | null }): Promise<{ paymentId: string; paymentStatus: string; paidTotal: number }>`
- `cancelOrderPayment(paymentId: string, reason: string): Promise<{ paymentStatus: string; paidTotal: number }>`
- `undoOrderPayment(paymentId: string): Promise<{ paymentStatus: string; paidTotal: number }>`
- `listOrderPaymentAccounts(teamId: string, legalEntityId: string | null, intendedAccountId: string | null): Promise<{ accounts: Array<{ id: string; name: string }>; defaultId: string | null }>` — читає `finance_accounts` (бухгалтерія має `has_finance_access`; owner/seo теж) і `finance_order_meta.intended_account_id`.
- `toOrderPaymentError(error): Error` — `42501`/`22023` → текст з бази як є; решта → «Не вдалося зберегти оплату. Спробуйте ще раз.»

Виклики — `supabase.schema("tosho").rpc(...)` (див. пам'ять про типізацію RPC). Окремих тестів немає: покриває Task 1 (приміряка) і Task 6 (прев'ю).

- [ ] **Step 1:** реалізувати; `npm run check:fast` зелений.
- [ ] **Step 2: Commit** разом із Task 2.

### Task 4: Сповіщення й стрічка

**Files:**
- Modify: `src/lib/notificationCategories.ts` (union :13, список :72, switch :238 — дві категорії)
- Modify: `src/lib/workflowNotifications.ts` (після `notifyOrderInvoiceDecided`, ~:790)
- Modify: `src/features/taskChat/threadEvents.ts:12-24` (+ `"order_payment"`)
- Test: `src/lib/notificationCategories.test.ts` (якщо є — дописати; немає — створити)

**Produces:**
- Категорії `order_payment` («Оплати замовлень», отримує менеджер — завжди true для членів) і `order_payment_check` («Перевірити оплату», `isInvoiceIssuer`).
- `notifyOrderPaymentRecorded(p: { orderId; orderNumber; amountLabel: string; statusLabel: string; managerUserId: string | null; actorUserId: string | null; actorName: string | null }): Promise<void>` — заголовок `Оплата ${amountLabel} · ${orderNumber}`, тіло `${who} вніс(ла) оплату. Статус: ${statusLabel}.`, `type "success"`.
- `notifyOrderPaymentCancelled(p: { …те саме; reason: string })` — `Платіж ${amountLabel} скасовано · ${orderNumber}`, тіло з причиною, `type "warning"`.
- `notifyOrderPaymentCheckRequested(p: { teamId; orderId; orderNumber; dueLabel: string; note: string; actorUserId; actorName })` — отримувачі `pickInvoiceIssuerUserIds`, заголовок `Замовник каже, що оплатив · ${orderNumber}`.
- Автор дії собі не отримує (як у наявних хелперах). Застарілий коментар про «молодшого» у `pickInvoiceIssuerUserIds` і `notificationCategories.ts:236` — виправити заодно.

- [ ] **Step 1: Тест** — `canReceiveCategory`-подібна функція (назву взяти з файлу) для `order_payment_check`: бухгалтер true, менеджер false, junior_accountant false.
- [ ] **Step 2:** запуск → FAIL. **Step 3:** реалізувати. **Step 4:** PASS + `check:fast`.
- [ ] **Step 5: Commit** — «Менеджер дізнається про внесену чи скасовану оплату, бухгалтерія — про "замовник каже, що оплатив"».

### Task 5: Хук `useOrderPayments`

**Files:**
- Create: `src/features/orders/order-details/useOrderPayments.ts`

**Interfaces — Consumes:** Task 2, 3, 4; `logActivity`, `currentUserName`-підхід з `useOrderInvoiceFlow.ts:20-25`.
**Produces:**
```ts
useOrderPayments({ record, teamId, userId, canEnter, onChanged }: {
  record: DerivedOrderRecord | null; teamId: string | null | undefined; userId: string | null | undefined;
  canEnter: boolean; onChanged: () => void;   // onChanged = refreshRecord сторінки
}): {
  payments: OrderPayment[]; loading: boolean; saving: boolean;
  record(input: { amount: number; paidAt: string; accountId: string; bankTxnRef: string | null }): Promise<boolean>;
  undo(paymentId: string): Promise<void>;
  cancel(paymentId: string, reason: string): Promise<boolean>;
  requestCheck(note: string): Promise<void>; checkRequested: boolean;
}
```
Поведінка: після успішного `record` — тост sonner «Внесено X» з описом «Статус: …» і дією «Скасувати», `duration: 10_000`; follow-up (подія `order_payment` + `notifyOrderPaymentRecorded`) ставиться в чергу на 10 с; `pagehide` і unmount — виконати чергу одразу (`logActivity`/`notifyUsers` уже роблять fetch; для `pagehide` достатньо викликати без await). «Скасувати» в тості — прибрати з черги, `undoOrderPayment`, тост «Внесення скасовано». `cancel` і `requestCheck` — follow-up одразу. Кожна зміна → `listOrderPayments` + `onChanged()`. Помилки → `toast.error(toOrderPaymentError(e).message)`.

- [ ] **Step 1:** реалізувати; `check:fast` зелений.
- [ ] **Step 2: Commit** разом із Task 6.

### Task 6: Картка «Оплата», віконця, меню статусу

**Files:**
- Modify: `src/features/orders/order-details/OrderPaymentCard.tsx` (прибрати коментар про «свідомо немає кнопки»)
- Create: `src/features/orders/order-details/OrderPaymentDialog.tsx`
- Create: `src/features/orders/order-details/OrderPaymentCancelDialog.tsx`
- Create: `src/features/orders/order-details/OrderPaymentCheckDialog.tsx`
- Modify: `src/features/orders/order-details/OrderStatusControl.tsx` (новий проп `paymentLockedReason?: string | null`)
- Modify: `src/pages/OrdersProductionDetailsPage.tsx` (~:1442 і ~:1700 — підключити хук, передати пропи; стрибати за `docs/LARGE_FILES_MAP.md`)
- Test: `src/features/orders/order-details/OrderPaymentDialog.test.tsx`

**Interfaces — Consumes:** Task 2, 3, 5; `canIssueOrderInvoice` з `src/lib/permissions.ts:349` для `canEnter`.
**Produces:**
- `OrderPaymentCard({ record, payments, canEnter, onEnter, onCancel, onRequestCheck, checkRequested, enterDisabledReason }: …)`. Блок «Надійшло» під SplitBar: сума з загальної, смуга (тон за `paymentHint`), підказка, список (новий зверху; бухгалтерії — рахунок · № платіжки · внесено dd.mm hh:mm, менеджеру — «передоплата · внесла бухгалтерія»; скасовані — закреслені «Скасовано: причина»), «Скасувати» в рядку (canEnter), синя кнопка «Внести оплату» на всю ширину (canEnter), або для менеджера посилання «Замовник каже, що оплатив» (не `fully_paid`, неактивне з текстом «Запит надіслано», коли `checkRequested`). `enterDisabledReason`: валюта ≠ UAH → «Валютні оплати — поки у Фінансах»; рахунків немає → «Додайте рахунок у Фінансах».
- `OrderPaymentDialog({ open, onOpenChange, record, payments, accounts, defaultAccountId, saving, onSubmit })` — вигляд і тексти як у прототипі (спец, розділ «Інтерфейс»), дата: «Сьогодні · dd.mm», «Вчора · dd.mm» + `DateInput`; рядок «Статус стане «…»» (+ « · запуск відкриється», коли було < pre, стане ≥ pre і замовлення не запущене).
- `OrderPaymentCancelDialog` — заголовок «Скасувати платіж X від dd.mm?», причини-кнопки, попередження про запущене замовлення (`LAUNCHED_ORDER_STATUSES`), кнопки «Не скасовувати» / «Скасувати платіж».
- `OrderStatusControl`: коли `paymentLockedReason` — пункти групи «Оплата», крім пари `partially_paid ↔ awaiting_balance`, неактивні, під заголовком групи підпис «рахується з оплат».

- [ ] **Step 1: Тести діалогу** (`@testing-library/react`, як інші `.test.tsx` у репо): `fills 50% by default when nothing paid` (поле = «49 680,00»); `shows 70% chip`; `"Інша" clears the field`; `disables submit for 0 and while saving` (`saving` → кнопка disabled); `shows overpay warning above remainder`; `submit passes parsed amount and ISO date`.
- [ ] **Step 2:** `npx vitest run src/features/orders/order-details/OrderPaymentDialog.test.tsx` → FAIL.
- [ ] **Step 3:** реалізувати компоненти й підключення на сторінці.
- [ ] **Step 4:** тести PASS; `npm run check:fast` зелений.
- [ ] **Step 5: Commit** — «У замовленні з'явилась кнопка "Внести оплату": сума й дата, список платежів і скасування з причиною».

### Task 7: Фінанси не рахують скасоване

**Files:**
- Modify: `src/features/finances/api.ts:334-345` (`listPayments`: `.is("cancelled_at", null)`), `:405` (`deletePayment`: помилку тригера показати людським текстом «Платіж із замовлення скасовують у замовленні»)
- Modify: `src/features/finances/types.ts:89` (`orderId: string | null`)

Рішення плану (відхилення від спеця): журнал Фінансів скасовані НЕ показує — вони видні закресленими в замовленні; так усі сім читачів `listPayments` виправлені одним рядком.

- [ ] **Step 1:** правка; `npm run check:fast`.
- [ ] **Step 2: Commit** — «Скасована в замовленні оплата не потрапляє в доходи Фінансів».

### Task 8: Перевірка й закриття

- [ ] **Step 1:** `npm run check` — зелений (усі 17 перевірок).
- [ ] **Step 2:** рецензент `model: "opus"` на дифф Task 1, 3, 5, 7 (гроші, RLS, security definer) + `/security-review`. Знахідки — виправити, повторити `check`.
- [ ] **Step 3:** прев'ю `dev` тестовим акаунтом (Playwright + `E2E_EMAIL`, без прохання ввійти): тестове замовлення → «Внести оплату» 50% → тост, «Скасувати» в тості → платежу немає; внести знову → дочекатись 10 с → подія в «Обговоренні», статус «Частково оплачено», крок «Оплата» шляху зелений; скасувати з причиною «Дубль» → закреслено, статус «Очікує оплату». Скріншоти. Прев'ю пише в прод — після перевірки лишити тестові платежі скасованими. Закрити прев'ю.
- [ ] **Step 4:** оновити `docs/DB_MAP.md` (розділ Orders: оплати й RPC) і спец (пункт про журнал Фінансів).
- [ ] **Step 5: Commit** з трейлером окремим рядком `Закриває: REQ-322#p26`. Звіт: «накопичено N комітів, готові до викочування» — без пушу.
