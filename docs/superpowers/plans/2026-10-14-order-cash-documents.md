# Готівка без бухдокументів (REQ-322#p4): план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Спосіб оплати замовлення береться з картки замовника. На готівці CRM не вимагає реквізитів, договору, СП і рахунку, а передоплата на готівці не може бути меншою за 50%.

**Architecture:** Правила оплати виносимо з `orderRecords.ts` у чистий модуль `paymentRules.ts`, а побудову кроків готовності — у чистий `orderReadiness.ts`. Обидва модулі мають тести. `orderRecords.ts` лише збирає вхідні дані й викликає ці модулі. Сторінка замовлення і вікно ручного створення читають ті самі правила. Схема бази не змінюється: `customers.payment_type` уже є і має значення `"cash"`, `"invoice"` або `null`.

**Tech Stack:** React 19, TypeScript 7, Vitest, Supabase (`tosho` schema).

**Spec:** [docs/superpowers/specs/2026-10-14-order-documents-by-payment-design.md](../specs/2026-10-14-order-documents-by-payment-design.md), розділ «Готівка» і етап 1.

## Global Constraints

- Готівка: «Немає договору, СП, рахунку, ВН чи акта. Реквізити замовника не перевіряються.»
- Готівка: «Умови: 50/50, 70/30 або 100%. Передоплата не менше 50%, варіант «100% після» недоступний.»
- Спосіб оплати підставляється з `customers.payment_type`.
- Без змін у базі, без нових залежностей.
- Ідентифікатори способу оплати не міняються: `cash`, `bank_uah`, `bank_fx`, `crypto`, `pending`.
- Перевірка: `npm run check:fast` після кожної задачі, `npm run check` у кінці.
- Тема коміта людською мовою, у кінці коміта трейлер з початку рядка `Закриває: REQ-322#p4` (лише в останньому коміті).
- `git push` не робити.

## Review Focus

1. **Замовник без `payment_type` (`null`, старі записи).** Поведінка має лишитись, як була: валюта, далі повні реквізити → безготівка, інакше готівка. Тест у Task 1.
2. **`payment_type = "cash"`, а прорахунок у USD/EUR.** Готівка перемагає валюту, бо менеджер у картці замовника явно сказав «готівка». Тест у Task 1.
3. **Готівка з `prepaymentPct = null`.** Перевірка бере відсоток передоплати з `paymentTerms`: `"100_after"` → 0 → помилка, `"70/30"` → 70 → гаразд. Тест у Task 1.
4. **Помилка валідації у вікні умов не повинна ховати сторінку.** `setError` на сторінці замовлення ховає ВСЮ сторінку (відомий баг), тож помилку показуємо всередині вікна. Перевірка в браузері в Task 4.
5. **Криптовалюта.** Вона не безготівка, тож документів не вимагає (як і зараз для СП). Мінімум 50% стосується лише `cash`. Тест у Task 1.

---

## File Structure

| Файл | Що робить |
|---|---|
| Create `src/features/orders/paymentRules.ts` | мітки способів оплати, `normalizePaymentMethodId`, `isCashlessPaymentMethod`, `resolveOrderPaymentMethod`, `getAllowedPaymentTermsOptions`, `getMinimumPrepaymentError` |
| Create `src/features/orders/paymentRules.test.ts` | тести правил |
| Create `src/features/orders/orderReadiness.ts` | `buildDerivedReadinessSteps`, `getReadinessColumn` |
| Create `src/features/orders/orderReadiness.test.ts` | тести кроків готовності |
| Modify `src/features/orders/orderRecords.ts` | імпорт правил замість локальних, `payment_type` у трьох запитах до `customers`, виклик нових функцій |
| Modify `src/pages/OrdersProductionDetailsPage.tsx` | на готівці лише «Техкарта» в документах, картка «Умови оплати» замість «Умови СП», перевірка в діалозі умов |
| Modify `src/lib/toshoApi.ts` | `payment_type` у `CustomerRow` і в пошуку замовників |
| Modify `src/components/orders/CreateManualOrderDialog.tsx` | спосіб оплати з картки замовника, умови без «100% після» на готівці |

---

### Task 1: Правила оплати в окремому модулі

**Files:**
- Create: `src/features/orders/paymentRules.ts`
- Create: `src/features/orders/paymentRules.test.ts`
- Modify: `src/features/orders/orderRecords.ts:596-631` (видалити локальні `PAYMENT_METHOD_LABELS`, `normalizePaymentMethodId`, `isCashlessPaymentMethod`, `resolvePaymentMethod`)

**Interfaces:**
- Produces:
  - `PAYMENT_METHOD_LABELS: Record<string, string>`
  - `normalizePaymentMethodId(value?: string | null): string`
  - `isCashlessPaymentMethod(methodId?: string | null, label?: string | null): boolean`
  - `resolveOrderPaymentMethod(input: { partyType: "customer" | "lead"; customerPaymentType?: string | null; currency?: string | null; hasLegalEntityIdentity: boolean }): { id: string; label: string }`
  - `getAllowedPaymentTermsOptions(methodId?: string | null)` → підмножина `ORDER_PAYMENT_TERMS_OPTIONS`
  - `getMinimumPrepaymentError(input: { methodId?: string | null; prepaymentPct?: number | null; paymentTerms?: string | null }): string | null`
  - `CASH_MIN_PREPAYMENT_PCT = 50`

- [ ] **Step 1: Write the failing test**

`src/features/orders/paymentRules.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  getAllowedPaymentTermsOptions,
  getMinimumPrepaymentError,
  isCashlessPaymentMethod,
  resolveOrderPaymentMethod,
} from "./paymentRules";

/**
 * Спосіб оплати вирішує, які документи потрібні замовленню. До 14.10.2026 CRM
 * його вгадувала (повні реквізити → безготівка) і не читала, що менеджер
 * поставив у картці замовника. Готівковий КСІТ через це вимагав IBAN і СП.
 */
describe("resolveOrderPaymentMethod", () => {
  const base = { partyType: "customer" as const, currency: "UAH", hasLegalEntityIdentity: true };

  it("лід — спосіб ще не обрано", () => {
    expect(resolveOrderPaymentMethod({ ...base, partyType: "lead", customerPaymentType: "cash" }).id).toBe("pending");
  });

  it("готівка з картки замовника перемагає повні реквізити", () => {
    expect(resolveOrderPaymentMethod({ ...base, customerPaymentType: "cash" }).id).toBe("cash");
  });

  it("готівка з картки перемагає й валюту прорахунку", () => {
    expect(resolveOrderPaymentMethod({ ...base, currency: "USD", customerPaymentType: "cash" }).id).toBe("cash");
  });

  it("рахунок з картки — безготівка навіть без реквізитів", () => {
    expect(
      resolveOrderPaymentMethod({ ...base, hasLegalEntityIdentity: false, customerPaymentType: "invoice" }).id
    ).toBe("bank_uah");
  });

  it("рахунок з картки у валюті — валютна безготівка", () => {
    expect(resolveOrderPaymentMethod({ ...base, currency: "EUR", customerPaymentType: "invoice" }).id).toBe("bank_fx");
  });

  it("порожня картка — як раніше: реквізити → безготівка, без них → готівка", () => {
    expect(resolveOrderPaymentMethod({ ...base, customerPaymentType: null }).id).toBe("bank_uah");
    expect(
      resolveOrderPaymentMethod({ ...base, customerPaymentType: null, hasLegalEntityIdentity: false }).id
    ).toBe("cash");
    expect(resolveOrderPaymentMethod({ ...base, customerPaymentType: null, currency: "USD" }).id).toBe("bank_fx");
  });
});

describe("isCashlessPaymentMethod", () => {
  it("безготівка — лише bank_uah і bank_fx", () => {
    expect(isCashlessPaymentMethod("bank_uah")).toBe(true);
    expect(isCashlessPaymentMethod("bank_fx")).toBe(true);
    expect(isCashlessPaymentMethod("cash")).toBe(false);
    expect(isCashlessPaymentMethod("crypto")).toBe(false);
  });

  it("старі записи без id впізнаються за підписом", () => {
    expect(isCashlessPaymentMethod(null, "Безготівкові, грн.")).toBe(true);
    expect(isCashlessPaymentMethod(null, "Готівкові / на карту")).toBe(false);
  });
});

describe("getAllowedPaymentTermsOptions", () => {
  it("на готівці немає «100% після готовності»", () => {
    expect(getAllowedPaymentTermsOptions("cash").map((option) => option.id)).toEqual(["50/50", "70/30", "100_prepaid"]);
  });

  it("на безготівці доступні всі умови", () => {
    expect(getAllowedPaymentTermsOptions("bank_uah").map((option) => option.id)).toContain("100_after");
  });
});

describe("getMinimumPrepaymentError", () => {
  it("готівка з передоплатою менше 50% — помилка", () => {
    expect(getMinimumPrepaymentError({ methodId: "cash", prepaymentPct: 30 })).toMatch(/не менше 50%/);
  });

  it("готівка рівно 50% — гаразд", () => {
    expect(getMinimumPrepaymentError({ methodId: "cash", prepaymentPct: 50 })).toBeNull();
  });

  it("без відсотка береться передоплата з умов", () => {
    expect(getMinimumPrepaymentError({ methodId: "cash", prepaymentPct: null, paymentTerms: "100_after" })).toMatch(
      /не менше 50%/
    );
    expect(getMinimumPrepaymentError({ methodId: "cash", prepaymentPct: null, paymentTerms: "70/30" })).toBeNull();
  });

  it("безготівка й крипта — без обмеження", () => {
    expect(getMinimumPrepaymentError({ methodId: "bank_uah", prepaymentPct: 0 })).toBeNull();
    expect(getMinimumPrepaymentError({ methodId: "crypto", prepaymentPct: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/orders/paymentRules.test.ts`
Expected: FAIL — `Failed to resolve import "./paymentRules"`.

- [ ] **Step 3: Write minimal implementation**

`src/features/orders/paymentRules.ts`:

```ts
import { ORDER_PAYMENT_TERMS_OPTIONS } from "./config";

/**
 * Правила, що залежать від способу оплати замовлення. Погоджено СЕО 14.10.2026:
 * на готівці немає договору, СП, рахунку й ВН, а передоплата — щонайменше 50%.
 * Спец: docs/superpowers/specs/2026-10-14-order-documents-by-payment-design.md.
 */

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Готівкові / на карту",
  bank_uah: "Безготівкові, грн.",
  bank_fx: "Безготівкові (валютні), $ / €",
  crypto: "Криптовалюта",
  pending: "Потрібно обрати після конвертації ліда",
};

export const CASH_MIN_PREPAYMENT_PCT = 50;

export const normalizePaymentMethodId = (value?: string | null) => {
  const normalized = (value ?? "").trim();
  return normalized in PAYMENT_METHOD_LABELS ? normalized : "";
};

export const isCashlessPaymentMethod = (methodId?: string | null, label?: string | null) => {
  const normalizedId = normalizePaymentMethodId(methodId);
  if (normalizedId === "bank_uah" || normalizedId === "bank_fx") return true;
  return (label ?? "").trim().toLowerCase().includes("безготів");
};

const method = (id: string) => ({ id, label: PAYMENT_METHOD_LABELS[id] });

/**
 * Картка замовника — головне джерело: менеджер там явно обрав «Готівка» чи
 * «Рахунок». Порожнє поле (старі замовники) лишає колишнє вгадування, щоб не
 * перевернути вже наявні прорахунки.
 */
export const resolveOrderPaymentMethod = (input: {
  partyType: "customer" | "lead";
  customerPaymentType?: string | null;
  currency?: string | null;
  hasLegalEntityIdentity: boolean;
}) => {
  if (input.partyType === "lead") return method("pending");
  const paymentType = (input.customerPaymentType ?? "").trim();
  if (paymentType === "cash") return method("cash");
  const currency = (input.currency ?? "UAH").trim().toUpperCase();
  const isForeignCurrency = currency === "USD" || currency === "EUR";
  if (paymentType === "invoice") return method(isForeignCurrency ? "bank_fx" : "bank_uah");
  if (isForeignCurrency) return method("bank_fx");
  return method(input.hasLegalEntityIdentity ? "bank_uah" : "cash");
};

export const getAllowedPaymentTermsOptions = (methodId?: string | null) =>
  normalizePaymentMethodId(methodId) === "cash"
    ? ORDER_PAYMENT_TERMS_OPTIONS.filter((option) => option.advance >= CASH_MIN_PREPAYMENT_PCT)
    : [...ORDER_PAYMENT_TERMS_OPTIONS];

export const getMinimumPrepaymentError = (input: {
  methodId?: string | null;
  prepaymentPct?: number | null;
  paymentTerms?: string | null;
}) => {
  if (normalizePaymentMethodId(input.methodId) !== "cash") return null;
  const advance =
    typeof input.prepaymentPct === "number"
      ? input.prepaymentPct
      : ORDER_PAYMENT_TERMS_OPTIONS.find((option) => option.id === input.paymentTerms)?.advance ?? null;
  if (advance === null || advance >= CASH_MIN_PREPAYMENT_PCT) return null;
  return `На готівці передоплата не менше ${CASH_MIN_PREPAYMENT_PCT}%: 50/50, 70/30 або 100%.`;
};
```

У `src/features/orders/orderRecords.ts` видалити рядки 596–631 (`PAYMENT_METHOD_LABELS` … кінець `resolvePaymentMethod`) і додати до імпортів угорі:

```ts
import {
  PAYMENT_METHOD_LABELS,
  isCashlessPaymentMethod,
  normalizePaymentMethodId,
  resolveOrderPaymentMethod,
} from "./paymentRules";
```

Щоб наявні імпорти `isCashlessPaymentMethod` з `@/features/orders/orderRecords` не зламались, лишити в `orderRecords.ts` реекспорт:

```ts
export { isCashlessPaymentMethod } from "./paymentRules";
```

Виклик у рядку ~1115 поки що замінити так, щоб поведінка не змінилась (`payment_type` прийде в Task 2):

```ts
const paymentMethod = resolveOrderPaymentMethod({
  partyType,
  customerPaymentType: null,
  currency: quote.currency,
  hasLegalEntityIdentity,
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/orders/paymentRules.test.ts && npm run check:fast`
Expected: тести PASS, `check:fast` чистий.

- [ ] **Step 5: Commit**

```bash
git add src/features/orders/paymentRules.ts src/features/orders/paymentRules.test.ts src/features/orders/orderRecords.ts
git commit -m "Правила оплати замовлення винесено в окремий модуль з тестами — поведінка поки та сама"
```

---

### Task 2: Готовність до замовлення за способом оплати

**Files:**
- Create: `src/features/orders/orderReadiness.ts`
- Create: `src/features/orders/orderReadiness.test.ts`
- Modify: `src/features/orders/orderRecords.ts` — три запити `.from("customers")` (рядки ~844, ~1310, ~1944), тип рядка замовника в цьому файлі, блок кроків готовності (~1113–1147), `docs.contract` (~1222)

**Interfaces:**
- Consumes: `resolveOrderPaymentMethod`, `isCashlessPaymentMethod` з Task 1.
- Produces:
  - `buildDerivedReadinessSteps(input: DerivedReadinessInput): DerivedReadinessStep[]`
  - `getReadinessColumn(blockers: string[]): "counterparty" | "design" | "ready"`
  - `type DerivedReadinessInput = { partyType: "customer" | "lead"; requiresCustomerDocuments: boolean; hasEmail: boolean; hasPhone: boolean; hasLegalEntityIdentity: boolean; hasFullSignatoryName: boolean; isVatPayer: boolean; hasValidVatId: boolean; hasItems: boolean; runChoicePending: boolean; requiresVisualization: boolean; hasApprovedVisualization: boolean; requiresLayout: boolean; hasApprovedLayout: boolean }`

- [ ] **Step 1: Write the failing test**

`src/features/orders/orderReadiness.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildDerivedReadinessSteps, getReadinessColumn, type DerivedReadinessInput } from "./orderReadiness";

const ready: DerivedReadinessInput = {
  partyType: "customer",
  requiresCustomerDocuments: true,
  hasEmail: true,
  hasPhone: true,
  hasLegalEntityIdentity: true,
  hasFullSignatoryName: true,
  isVatPayer: true,
  hasValidVatId: true,
  hasItems: true,
  runChoicePending: false,
  requiresVisualization: true,
  hasApprovedVisualization: true,
  requiresLayout: true,
  hasApprovedLayout: true,
};

const blockersOf = (input: DerivedReadinessInput) =>
  buildDerivedReadinessSteps(input)
    .filter((step) => !step.done && step.blocking)
    .map((step) => step.label);

describe("buildDerivedReadinessSteps", () => {
  it("безготівка без реквізитів блокується реквізитами, ПІБ і ІПН", () => {
    const blockers = blockersOf({
      ...ready,
      hasLegalEntityIdentity: false,
      hasFullSignatoryName: false,
      hasValidVatId: false,
    });
    expect(blockers).toEqual([
      "Заповнені реквізити, юр. назва та підписант",
      "Вказано повне ПІБ підписанта (прізвище, імʼя, по-батькові)",
      "Вказано ІПН платника ПДВ (12 цифр)",
    ]);
  });

  it("готівка без реквізитів не блокується", () => {
    expect(
      blockersOf({
        ...ready,
        requiresCustomerDocuments: false,
        hasLegalEntityIdentity: false,
        hasFullSignatoryName: false,
        hasValidVatId: false,
        hasEmail: false,
      })
    ).toEqual([]);
  });

  it("готівка без телефону блокується телефоном", () => {
    expect(blockersOf({ ...ready, requiresCustomerDocuments: false, hasPhone: false })).toEqual([
      "Заповнений мобільний номер",
    ]);
  });

  it("безготівка вимагає і email, і телефон", () => {
    expect(blockersOf({ ...ready, hasEmail: false })).toEqual(["Заповнені email та мобільний номер"]);
  });

  it("дизайн блокує будь-який спосіб оплати", () => {
    expect(blockersOf({ ...ready, requiresCustomerDocuments: false, hasApprovedLayout: false })).toEqual([
      "Макет погоджено",
    ]);
  });
});

describe("getReadinessColumn", () => {
  it("контрагент, дизайн, готово", () => {
    expect(getReadinessColumn(["Заповнений мобільний номер"])).toBe("counterparty");
    expect(getReadinessColumn(["Заповнені реквізити, юр. назва та підписант"])).toBe("counterparty");
    expect(getReadinessColumn(["Макет погоджено"])).toBe("design");
    expect(getReadinessColumn([])).toBe("ready");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/orders/orderReadiness.test.ts`
Expected: FAIL — `Failed to resolve import "./orderReadiness"`.

- [ ] **Step 3: Write minimal implementation**

`src/features/orders/orderReadiness.ts`:

```ts
import type { DerivedReadinessStep } from "./orderRecords";

export type DerivedReadinessInput = {
  partyType: "customer" | "lead";
  /** Безготівка: потрібні договір, СП і рахунок, а з ними й реквізити. */
  requiresCustomerDocuments: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasLegalEntityIdentity: boolean;
  hasFullSignatoryName: boolean;
  isVatPayer: boolean;
  hasValidVatId: boolean;
  hasItems: boolean;
  runChoicePending: boolean;
  requiresVisualization: boolean;
  hasApprovedVisualization: boolean;
  requiresLayout: boolean;
  hasApprovedLayout: boolean;
};

/**
 * Що треба, щоб прорахунок став замовленням. На готівці договору, СП і рахунку
 * немає (погоджено СЕО 14.10.2026), тож реквізити й ПІБ підписанта не питаємо —
 * так само, як у переведенні ліда (getLeadConversionMissingFields). Телефон
 * лишається: доставка й звʼязок.
 */
export const buildDerivedReadinessSteps = (input: DerivedReadinessInput): DerivedReadinessStep[] => [
  { label: "Прорахунок затверджено менеджером", done: true },
  { label: "Ліда переведено у Замовника", done: input.partyType === "customer", blocking: true },
  ...(input.requiresCustomerDocuments
    ? [
        { label: "Заповнені email та мобільний номер", done: input.hasEmail && input.hasPhone, blocking: true },
        { label: "Заповнені реквізити, юр. назва та підписант", done: input.hasLegalEntityIdentity, blocking: true },
        {
          label: "Вказано повне ПІБ підписанта (прізвище, імʼя, по-батькові)",
          done: input.hasFullSignatoryName,
          blocking: true,
        },
        ...(input.isVatPayer
          ? [{ label: "Вказано ІПН платника ПДВ (12 цифр)", done: input.hasValidVatId, blocking: true }]
          : []),
      ]
    : [{ label: "Заповнений мобільний номер", done: input.hasPhone, blocking: true }]),
  { label: "Підготовлені позиції для рахунку та СП", done: input.hasItems, blocking: true },
  // Кілька тиражів на позицію = кілька різних цін. Доки не позначено, який
  // із них погодив клієнт, замовлення робити нема з чого — до 25.08.2026
  // мовчки брався перший створений.
  ...(input.runChoicePending ? [{ label: "Позначено тираж, який погодив клієнт", done: false, blocking: true }] : []),
  ...(input.requiresVisualization
    ? [{ label: "Візуал погоджено", done: input.hasApprovedVisualization, blocking: true }]
    : []),
  ...(input.requiresLayout ? [{ label: "Макет погоджено", done: input.hasApprovedLayout, blocking: true }] : []),
];

const COUNTERPARTY_MARKERS = ["Ліда", "email", "мобільний", "реквізити", "ІПН", "ПІБ"];

export const getReadinessColumn = (blockers: string[]) =>
  blockers.some((label) => COUNTERPARTY_MARKERS.some((marker) => label.includes(marker)))
    ? ("counterparty" as const)
    : blockers.length > 0
      ? ("design" as const)
      : ("ready" as const);
```

Підпис «Підготовлені позиції для рахунку та СП» лишаємо незмінним: від нього можуть залежати інші читачі. Перед зміною перевір `grep -rn "Підготовлені позиції" src`.

У `src/features/orders/orderRecords.ts`:

1. У трьох запитах `.from("customers").select("id,name,legal_name,logo_url,contacts,contact_phone,contact_email,tax_id,iban,signatory_name,signatory_position,legal_entities")` дописати в кінець рядка `,payment_type`. У тип рядка замовника, який ці запити повертають (знайти: `grep -n "legal_entities" src/features/orders/orderRecords.ts`), додати `payment_type?: string | null;`.
2. Замінити блок від `const paymentMethod = resolvePaymentMethod(...)` до кінця обчислення `readinessColumn` на:

```ts
    const paymentMethod = resolveOrderPaymentMethod({
      partyType,
      customerPaymentType: customer?.payment_type ?? null,
      currency: quote.currency,
      hasLegalEntityIdentity,
    });
    const requiresCustomerDocuments = isCashlessPaymentMethod(paymentMethod.id);
    const canCreateSpecification = false;
    const readinessSteps = buildDerivedReadinessSteps({
      partyType,
      requiresCustomerDocuments,
      hasEmail: Boolean(contactEmail),
      hasPhone: Boolean(contactPhone),
      hasLegalEntityIdentity,
      hasFullSignatoryName,
      isVatPayer,
      hasValidVatId,
      hasItems: items.length > 0,
      runChoicePending,
      requiresVisualization,
      hasApprovedVisualization,
      requiresLayout,
      hasApprovedLayout,
    });
    const blockers = readinessSteps.filter((step) => !step.done && step.blocking).map((step) => step.label);
    const readinessColumn = getReadinessColumn(blockers);
```

3. У `docs` цього ж запису:

```ts
        contract:
          requiresCustomerDocuments &&
          partyType === "customer" &&
          hasLegalEntityIdentity &&
          Boolean(contactEmail && contactPhone),
        invoice: requiresCustomerDocuments && items.length > 0,
```

4. Додати імпорт: `import { buildDerivedReadinessSteps, getReadinessColumn } from "./orderReadiness";`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/orders && npm run check:fast`
Expected: PASS, `check:fast` чистий.

- [ ] **Step 5: Commit**

```bash
git add src/features/orders/orderReadiness.ts src/features/orders/orderReadiness.test.ts src/features/orders/orderRecords.ts
git commit -m "Затверджений прорахунок готівкового замовника стає замовленням без IBAN, ЄДРПОУ й підписанта — спосіб оплати береться з картки замовника"
```

---

### Task 3: Спосіб оплати й умови у вікні ручного створення

**Files:**
- Modify: `src/lib/toshoApi.ts:185-192` (`CustomerRow`), `:660-664` (колонки пошуку)
- Modify: `src/components/orders/CreateManualOrderDialog.tsx:80-81, 185-193, 340, 624, 688-718`

**Interfaces:**
- Consumes: `getAllowedPaymentTermsOptions` з Task 1.

- [ ] **Step 1: Додати `payment_type` у пошук замовників**

У `src/lib/toshoApi.ts` у тип `CustomerRow` додати поле:

```ts
  payment_type?: string | null;
```

У `buildQuery` в `listCustomersBySearch` дописати `,payment_type` до варіантів `"full"` і `"no_logo"`:

```ts
      variant === "full"
        ? "id,name,legal_name,logo_url,manager,manager_user_id,payment_type"
        : variant === "no_logo"
          ? "id,name,legal_name,manager,manager_user_id,payment_type"
          : "id,name,legal_name";
```

- [ ] **Step 2: Підставити спосіб оплати при виборі замовника**

У `CreateManualOrderDialog.tsx` замінити `defaultPaymentMethodForCurrency` на:

```ts
const defaultPaymentMethod = (currency: CurrencyCode, customerPaymentType?: string | null) =>
  customerPaymentType === "cash" ? "cash" : currency === "USD" || currency === "EUR" ? "bank_fx" : "bank_uah";
```

Додати стан поруч із `selectedCustomer`:

```ts
  const [selectedCustomerPaymentType, setSelectedCustomerPaymentType] = useState<string | null>(null);
```

Усі виклики `defaultPaymentMethodForCurrency(x)` замінити на `defaultPaymentMethod(x, selectedCustomerPaymentType)`. У скиданні форми (рядок ~221) додати `setSelectedCustomerPaymentType(null);`. Там, де обирається замовник (рядок ~624), після `setSelectedCustomer(...)` додати:

```ts
                                setSelectedCustomerPaymentType(customer.payment_type ?? null);
                                if (!paymentMethodTouched.current) {
                                  setPaymentMethodId(defaultPaymentMethod(currency, customer.payment_type ?? null));
                                }
```

- [ ] **Step 3: Обмежити умови на готівці**

Імпортувати `getAllowedPaymentTermsOptions` з `@/features/orders/paymentRules`. Над `return` компонента:

```ts
  const paymentTermsOptions = getAllowedPaymentTermsOptions(paymentMethodId);
```

Додати ефект, який не лишає недоступну умову після зміни способу оплати:

```ts
  useEffect(() => {
    if (!paymentTermsOptions.some((option) => option.id === paymentTerms)) setPaymentTerms("70/30");
  }, [paymentTermsOptions, paymentTerms]);
```

У списку умов замінити `ORDER_PAYMENT_TERMS_OPTIONS.map` на `paymentTermsOptions.map`. Прибрати імпорт `ORDER_PAYMENT_TERMS_OPTIONS`, якщо він більше ніде не вживається у файлі.

- [ ] **Step 4: Перевірити**

Run: `npm run check:fast`
Expected: чисто.

- [ ] **Step 5: Commit**

```bash
git add src/lib/toshoApi.ts src/components/orders/CreateManualOrderDialog.tsx
git commit -m "У ручному замовленні спосіб оплати підставляється з картки замовника, а на готівці немає «100% після готовності»"
```

---

### Task 4: Сторінка замовлення на готівці

**Files:**
- Modify: `src/pages/OrdersProductionDetailsPage.tsx` — `documentActions` (~1813), картка «Умови СП» (~2173–2240), `openSpecificationParamsDialog` (~1697), діалог «Параметри специфікації» (~2805–3008)

**Interfaces:**
- Consumes: `isCashlessPaymentMethod`, `getAllowedPaymentTermsOptions`, `getMinimumPrepaymentError` з Task 1.

- [ ] **Step 1: Документи лише потрібні**

Замінити рядок 1813:

```ts
  const requiresCustomerDocuments = isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail);
  const documentKinds: OrderDocumentKind[] = requiresCustomerDocuments
    ? ["contract", "specification", "invoice", "techCard"]
    : ["techCard"];
  const documentActions = documentKinds.map((kind) => ({
```

У картці «Документи» (~2364) під описом показати для готівки:

```tsx
              {!requiresCustomerDocuments ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  Готівка: договір, СП і рахунок не оформлюються.
                </div>
              ) : null}
```

- [ ] **Step 2: Картка умов без СП на готівці**

У картці «Умови СП»:
- заголовок: `{requiresCustomerDocuments ? "Умови СП" : "Умови оплати"}`; `InfoHint` з `RequirementList` показувати лише при `requiresCustomerDocuments`;
- опис: `{requiresCustomerDocuments ? "СП доступна тільки для безготівки і після створення договору." : "Готівка: передоплата не менше 50%, далі запуск у виробництво."}`;
- блок `specificationBlocker ? … : …` обгорнути в `requiresCustomerDocuments ? (…) : null`, щоб на готівці не було ні жовтої плашки, ні «Умови СП виконані».

- [ ] **Step 3: Діалог умов — помилка всередині вікна, без СП на готівці**

Додати стан: `const [specDialogError, setSpecDialogError] = useState<string | null>(null);`. В `openSpecificationParamsDialog` додати `setSpecDialogError(null);`.

Заголовок діалогу: `{isCashlessPaymentMethod(specPaymentMethodId) ? "Параметри специфікації" : "Умови оплати"}`. Підпис під вибором типу оплати лишити як є.

У обробнику кнопки, одразу після обчислення `balanceDaysAfterShipment`:

```ts
                const prepaymentError = getMinimumPrepaymentError({
                  methodId: specPaymentMethodId,
                  prepaymentPct,
                  paymentTerms: record.paymentTerms,
                });
                if (prepaymentError) {
                  // Не setError: він ховає всю сторінку замовлення.
                  setSpecDialogError(prepaymentError);
                  return;
                }
                setSpecDialogError(null);
```

Замінити `await openDocumentPrint("specification", {}, nextRecord);` на:

```ts
                  if (isCashlessPaymentMethod(specPaymentMethodId)) {
                    await openDocumentPrint("specification", {}, nextRecord);
                  }
```

Над `<DialogFooter>` показати помилку:

```tsx
          {specDialogError ? (
            <div className="tone-warning-subtle rounded-lg border px-3 py-2 text-sm tone-text-warning">{specDialogError}</div>
          ) : null}
```

Підпис кнопки: `{specDialogSubmitting ? "Збереження..." : isCashlessPaymentMethod(specPaymentMethodId) ? "Створити PDF" : "Зберегти"}`.

- [ ] **Step 4: Перевірити**

Run: `npm run check:fast`
Expected: чисто.

Прев'ю (поведінка інтерфейсу — обов'язково): тимчасовий spec під тестовим акаунтом з `guard` (див. `e2e/` і пам'ять «Прев'ю: тестовий акаунт»), запуск `E2E_SKIP_BUILD=1 npx playwright test e2e/_cash-order.spec.ts --project=checks`:
- відкрити готівкове замовлення ZM-1026-0004 (КСІТ) зі списку `/orders/production`;
- у «Документах» лише «Техкарта» і рядок «Готівка: договір, СП і рахунок не оформлюються.»;
- картка називається «Умови оплати», жовтої плашки про СП немає;
- відкрити «Змінити умови», поставити передоплату 30 і натиснути «Зберегти»: помилка «не менше 50%» показується у вікні, сторінка не зникає. **Запис у прод не доходить, бо валідація спрацьовує раніше. Інші значення не зберігати.**
- зробити знімок, spec видалити.

- [ ] **Step 5: Commit**

```bash
git add src/pages/OrdersProductionDetailsPage.tsx
git commit -m "На готівковому замовленні більше немає договору, СП і рахунку — лише техкарта, а передоплату менше 50% CRM не дає зберегти

Закриває: REQ-322#p4"
```

---

## Перед «готово»

- [ ] `npm run check` — повна перевірка.
- [ ] Звіт: «накопичено N комітів, готові до викочування» + список. Без пушу.
