# Картка замовлення в мові прорахунку — план (REQ-322#p11)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `/orders/production/:id` виглядає й поводиться як картка прорахунку: шапка з одним статусом, вкладки, права колонка «замовник → оплата → обговорення». Заодно виправлено шість багів нинішньої картки.

**Architecture:** Логіку, яку можна перевірити без браузера (шлях до запуску, розбивка оплати, стан документа), виносимо в чисті модулі `src/features/orders/` з тестами. Візуальні частини лягають у `src/features/orders/order-details/` як окремі компоненти. Сторінка лишається диригентом стану, діалогів і друку, а розкладку бере з прорахунку: `@container/record`, `record-split` / `record-stack`, `ThreadDock` + `TaskThreadRail`, `TabBar`, `HeroShell` + `SplitBar`, `QuotePartyCard`.

**Tech Stack:** React 19, TypeScript 7, Tailwind v4, Vitest, Playwright (`e2e/fixtures` з writeGuard).

**Spec:** [docs/superpowers/specs/2026-10-14-order-documents-by-payment-design.md](../specs/2026-10-14-order-documents-by-payment-design.md), розділ «Картка замовлення» та етап 9. Макет: канва https://claude.ai/artifact/BxW8r1DmV7KWF33Xs1DQ9T (Main — безготівка, Cash — готівка, DocStates — стани документів).

## Global Constraints

- Без змін у базі. Чого ще немає в даних, того картка не вигадує:
  - підписів (p7);
  - погоджень (p6);
  - рахунку з BAS (p10);
  - воріт запуску (p8);
  - винятку запуску (p8);
  - внесення оплати (облік оплат — лише у Фінансах).
- Правила оплати — з `paymentRules.ts` і `orderDocumentRequirements.ts` (p4/p5). Документи — `getOrderDocumentKinds(record)`.
- `OrdersProductionDetailsPage.tsx` не росте: ратчет «розростання файлів», стеля 3069. Очікувано він схудне.
- Тексти — українською, людською мовою, без «Будь ласка».
- Помилка дії більше не ховає сторінку. Сторінку ховає лише помилка завантаження.
- Обговорення замовлення з прорахунком — та сама нитка `quote:<quoteId>` (docs/TASK_CHAT_DESIGN.md). Ручне замовлення без прорахунку — `order:<id>`.

## Review Focus

1. **Ручне замовлення без прорахунку.** Немає `quoteId`, дизайну й матеріалів. Картка відкривається, обговорення працює на `order:<id>`, вкладка «Матеріали» показує порожній стан, а не падає.
2. **Готівка.** У «Документах» одне речення й техкарта. У шляху до запуску — передоплата, а не договір і СП. Наявний старий договір лишається видно (M1 з p4).
3. **Вузьке вікно (`record-stack`).** Права колонка йде у вкладку «Деталі», обговорення — у шторку, а дії документів досяжні без прокрутки в кінець сторінки.
4. **Помилки дій.** Заблокований попап друку, невдала зміна статусу чи збій збереження умов дають тост, а сторінка лишається.
5. **Незбережений запис** (`record.source !== "stored"`, затверджений прорахунок без рядка в `orders`). Статус показано текстом. Дій, що пишуть у базу, немає.

---

### Task 1: Чисті правила картки

**Files:**
- Create: `src/features/orders/orderLaunchPath.ts`, `src/features/orders/orderLaunchPath.test.ts`
- Modify: `src/features/orders/orderDocumentRequirements.ts` (+ test)

**Produces:**
- `type LaunchStepState = "done" | "current" | "todo" | "locked"`
- `type LaunchStep = { key: string; title: string; note: string; state: LaunchStepState }`
- `buildLaunchPath(record): { heading: string; steps: LaunchStep[]; blocker: string | null }`
- `type OrderPaymentPart = { key: "prepayment" | "balance"; label: string; amount: number; pct: number }`
- `buildOrderPaymentParts(record): OrderPaymentPart[]`
- `formatPaymentTermsChip(record): string | null`

Правила `buildLaunchPath`:
- **Готівка** (`!customerRequiresDocuments` і не безготівка). Кроки:
  - «Передоплата» — `done`, коли `paymentStatus` не `awaiting_payment`. Примітка: сума · %, «На готівці не менше 50%».
  - «Запуск у виробництво» — `done`, коли `orderStatus` у виробництві або пізніше. `locked`, поки передоплати немає.
  - «Доплата» — лише якщо `balancePct > 0`.
  - «Відвантаження» — «Лише коли надійшла вся сума».
- **Безготівка.** Кроки:
  - «Договір» — `contractCreatedAt` → `done`. Інакше `current` з причиною з `getContractRequirementChecks`.
  - «СП» — `specificationCreatedAt` → `done`.
  - «Оплата»:
    - при `prepaymentPct === 0` — `done` з приміткою «До запуску не потрібна: 100% за N р.д. від ВН»;
    - інакше — як передоплата на готівці.
  - «Запуск у виробництво».
- `heading` — «Готівка, 70/30» / «Безготівка, оплата після відвантаження» / «Безготівка, 70/30».
- `blocker` — перший незроблений крок для чипа праворуч: «Чекає передоплату», «Бракує СП»…

`buildOrderPaymentParts`:
- Суми з `record.total` × `prepaymentPct` / `balancePct`. Без розбивки — одна частина «До оплати» 100%.
- Підпис доплати:
  - `before_shipment` → «До відвантаження»;
  - `after_shipment` → `Після ВН, до ${formatBalanceDaysShort(days, kind)}`.

`formatPaymentTermsChip`:
- «Відтермінування 14 р.д.» при 0% наперед;
- «70/30» при розбивці;
- `null` без розбивки.

`orderDocumentRequirements.ts`:
- **Bug fix.** Додати перевірку «Погоджена візуалізація» (`record.hasApprovedVisualization`) у `getSpecificationRequirementChecks`. Без неї рядок СП казав «Можна створити», а друк відмовляв.
- Перенести сюди `getDocumentActionState` і `DocumentActionMode` зі сторінки, без змін поведінки (крім рядка вище).

- [ ] Тести на кожне правило вище (готівка 70/30 до і після оплати; безготівка 0/100 after_shipment 14 calendar; 70/30 без договору; без розбивки; СП без погодженого візуалу → `blocked`). Побачити RED.
- [ ] Реалізація, GREEN, `npm run check:fast`.
- [ ] Коміт.

### Task 2: Частини картки

**Files (create, `src/features/orders/order-details/`):**
- `OrderStatusControl.tsx`:
  - спліт-кнопка з тоном поточного статусу замовлення;
  - меню з трьома групами радіо: «Замовлення», «Оплата», «Доставка» з `ORDER_STATUS_SECTIONS`;
  - Props: `record`, `busy`, `onChange(field, value)`, `readOnly`;
  - тон — нова мапа `ORDER_STATUS_TONE` у `src/lib/statusTones.ts`.
- `OrderLaunchPathCard.tsx`:
  - картка «Шлях до запуску» з `buildLaunchPath`: заголовок, чип блокера, сітка кроків як у макеті Main;
  - знизу смуга умов: «Оплата … · Виробництво N р.д. · Поставка …» і посилання «Змінити умови».
- `OrderPaymentCard.tsx`:
  - `HeroShell` (label «Оплата», value — сума, badge — статус оплати);
  - `SplitBar` з `buildOrderPaymentParts`.
- `OrderDocumentsCard.tsx`:
  - рядки документів, перенесені з aside сторінки разом із `InfoHint` / `RequirementList`;
  - блок «Надіслати замовнику» (Email/Telegram/Viber);
  - на готівці одне речення замість рядків;
  - техкарту винесено окремою смугою «Внутрішні».
  - Props: `record`, `documentActions`, обробники `onAction(kind)`, `onParams(kind)`, `onFixRequisites`, `onEmail` / `onTelegram` / `onViber`.
- `OrderItemsTable.tsx`: таблиця позицій, перенесена зі сторінки, плюс рядок «Разом».
- `OrderMaterialsTab.tsx`:
  - стан дизайну й посилання на дизайн-задачу;
  - списки «Візуал» / «Макет» (`renderDesignAssetList` переїжджає сюди);
  - порожній стан для ручного замовлення.
- `OrderDeliveryTab.tsx`: картка доставки й ТТН, перенесена зі сторінки.

- [ ] Створити компоненти, перенісши JSX зі сторінки без зміни поведінки кнопок.
- [ ] `npm run check:fast`, коміт.

### Task 3: Сторінка: шапка, вкладки, права колонка

**Files:** Modify `src/pages/OrdersProductionDetailsPage.tsx`.

- Корінь: `@container/record`, `ThreadDockProvider`, сітка `record-split`, як у `QuoteDetailsPage.tsx:3989-4009` і `5471-5582`. `RecordRailResizer storageKey="tosho_order_rail_width"`.
- **Шапка:**
  - ← до списку, номер `HoverCopyText`;
  - чип способу оплати («Безготівка» / «Готівка» / «Криптовалюта»), чип `formatPaymentTermsChip`;
  - праворуч: `ThreadDockButton`, «Надіслати замовнику ▾» (лише безготівка, пункти Email / Telegram / Viber), `OrderStatusControl`;
  - ⋮: «Картка замовника», «Доставка», «ТТН Нової пошти».
- **Вкладки `TabBar`:**
  - «Запуск» (`кроків done/всього`): `OrderLaunchPathCard`, `OrderDocumentsCard`, `ContractRevisionsPanel` за чинною умовою;
  - «Позиції» (кількість);
  - «Матеріали» (кількість файлів);
  - «Доставка» (Incoterms);
  - «Деталі» — лише у вузькому вигляді, показує aside.
- **Aside:**
  - `QuotePartyCard`:
    - замовник;
    - менеджер;
    - дедлайни «Запуск» / «Готовність» (`contractProductionDays` р.д.) / «Відвантаження»;
    - extras: «Реквізити» (ЄДРПОУ або «бракує»), «Підписант», «Дизайн»;
  - `OrderPaymentCard`;
  - `ThreadDock` + `TaskThreadRail` з `threadKey = quoteId ? threadKeyForQuote(quoteId) : threadKeyForOrder(id)`.
- Прибрати картку «Чекліст» із захардкодженим «6/6» (**bug fix**): її роль бере «Шлях до запуску». `readinessSteps` лишаються для списку.

- [ ] Переписати розкладку. Діалоги, друк і обробники лишаються на сторінці.
- [ ] `npm run check` (ратчет розміру).
- [ ] Коміт.

### Task 4: Баги нинішньої картки

- **Помилка ховає сторінку.** Розвести `loadError` (ховає сторінку) і помилки дій: `toast.error` у `handleStatusChange`, `openDocumentPrint` (блокер, номер рахунку, попап, позначка створення) і в збереженні умов СП.
- **«Переглянути PDF» чернетки ставить `contractCreatedAt`.** `openDocumentPrint` отримує опцію `markCreated?: boolean` (типово `true`). `ContractRevisionsPanel.onOpenPreview` передає `false`.
- **«Скасувати ТТН» без підтвердження.** У `NovaPoshtaTtnDialog` кнопка відкриває `AlertDialog` «Скасувати ТТН {номер}? Нова пошта видалить накладну». Видаляє лише «Так, скасувати».
- **СП «Можна створити» без погодженого візуалу** — закрито в Task 1.
- **«6/6»** — закрито в Task 3.

- [ ] Правки, `npm run check`, коміт із трейлером `Закриває: REQ-322#p11`.

### Task 5: Перевірка в браузері

Тимчасовий `e2e/_order-card.spec.ts` (writeGuard), без `E2E_SKIP_BUILD`:
- безготівка ZM-1026-0003: шапка, вкладки, «Шлях до запуску», документи, права колонка, обговорення;
- готівка ZM-1026-0004: одне речення в документах, кроки передоплати;
- ширина 390 px: вкладка «Деталі» та шторка обговорення;
- знімки в scratchpad. Spec після прогону видалити.

## Свідомо поза p11 (рішення)

- **Email / Telegram / Viber не прикладають файлів.** Через deep-link файл не прикласти; надсилання переробляє p6 («надіслати після погодження»). У p11 кнопки лишаються чернеткою повідомлення.
- **Сповіщення в нитці `order:<id>`.** `netlify/functions/quote-comments.ts` не має гілки для замовлень, і повідомлення в ручному замовленні зберігається без сповіщення. Це Netlify-функція з авторизацією, окремий пункт із `/security-review`.
- **«Внести оплату», «Запустити», «Попросити дозвіл»** — p8 і фінанси.
