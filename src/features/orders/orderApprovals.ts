import type { DerivedOrderRecord } from "./orderRecords";
import { isCashlessPaymentMethod } from "./paymentRules";

/**
 * Погодження договору й СП (REQ-322#p6), підписи (p7) і виняток для запуску
 * (p8). Правила переходів тримає тригер tosho.enforce_order_approval_flow
 * (scripts/order-approvals-and-signatures.sql); тут — похідний стан для
 * інтерфейсу. Чиста логіка, без клієнта Supabase — запити в orderApprovalQueries.ts.
 */
export type OrderApprovalKind = "contract" | "specification" | "launch";
export type OrderApprovalStatus = "pending" | "approved" | "returned" | "withdrawn";

export type OrderApproval = {
  id: string;
  orderId: string;
  kind: OrderApprovalKind;
  status: OrderApprovalStatus;
  documentStamp: string | null;
  requestNote: string | null;
  requestedBy: string | null;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
};

export type SignatureVia = "paper" | "vchasno" | "medoc";

export const SIGNATURE_VIA_LABELS: Record<SignatureVia, string> = {
  paper: "паперово",
  vchasno: "у Вчасно",
  medoc: "у Медку",
};

/** Найсвіжіший запит свого виду; відкликані не рахуються — їх ніби й не було. */
export const latestApproval = (
  approvals: OrderApproval[] | undefined,
  kind: OrderApprovalKind
): OrderApproval | null => {
  let latest: OrderApproval | null = null;
  for (const approval of approvals ?? []) {
    if (approval.kind !== kind || approval.status === "withdrawn") continue;
    if (!latest || approval.requestedAt > latest.requestedAt) latest = approval;
  }
  return latest;
};

type StampInput = Pick<
  DerivedOrderRecord,
  | "items"
  | "total"
  | "currency"
  | "prepaymentPct"
  | "balancePct"
  | "balanceTiming"
  | "balanceDaysAfterShipment"
  | "balanceDaysKind"
  | "incotermsCode"
  | "incotermsPlace"
  | "contractNumber"
  | "contractDate"
  | "contractProductionDays"
  | "contractAutoProlongation"
>;

/**
 * Відбиток того, що погоджують. Перестворили СП з іншими умовами чи
 * позиціями — відбиток інший, і старе погодження вже не про цей документ.
 */
export const documentStamp = (record: StampInput, kind: "contract" | "specification"): string => {
  const terms = [
    record.prepaymentPct,
    record.balancePct,
    record.balanceTiming,
    record.balanceDaysAfterShipment,
    record.balanceDaysKind,
    record.contractProductionDays,
  ];
  if (kind === "contract") {
    return ["contract", record.contractNumber, record.contractDate, record.contractAutoProlongation, ...terms].join("|");
  }
  const items = record.items.map((item) => `${item.name}:${item.qty}:${item.unitPrice}`).join(";");
  return [
    "specification",
    record.currency,
    Math.round((Number(record.total) || 0) * 100),
    record.incotermsCode,
    record.incotermsPlace,
    ...terms,
    items,
  ].join("|");
};

/**
 * Стан погодження документа:
 *  - notRequired — готівка, успадкований договір або документ уже підписано;
 *  - missing — документа ще немає;
 *  - none — створено, на погодження не надсилали;
 *  - stale — погодили, але документ відтоді змінився;
 *  - pending / approved / returned — за останнім запитом.
 */
export type DocumentApprovalState = "notRequired" | "missing" | "none" | "stale" | "pending" | "approved" | "returned";

export type ApprovalRecord = StampInput &
  Pick<
    DerivedOrderRecord,
    | "paymentMethodId"
    | "paymentRail"
    | "contractCreatedAt"
    | "specificationCreatedAt"
    | "inheritedContractOrderNumber"
    | "contractSignedAt"
    | "specificationSignedAt"
    | "approvals"
  >;

export const getDocumentApprovalState = (
  record: ApprovalRecord,
  kind: "contract" | "specification"
): { state: DocumentApprovalState; approval: OrderApproval | null } => {
  if (!isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)) return { state: "notRequired", approval: null };
  const created = kind === "contract" ? record.contractCreatedAt : record.specificationCreatedAt;
  // Успадкований договір погоджували й підписували на першому замовленні.
  if (kind === "contract" && record.inheritedContractOrderNumber) return { state: "notRequired", approval: null };
  if (!created) return { state: "missing", approval: null };
  const signed = kind === "contract" ? record.contractSignedAt : record.specificationSignedAt;
  if (signed) return { state: "notRequired", approval: null };
  const approval = latestApproval(record.approvals, kind);
  if (!approval) return { state: "none", approval };
  if (approval.status === "approved" && approval.documentStamp && approval.documentStamp !== documentStamp(record, kind)) {
    return { state: "stale", approval };
  }
  return { state: approval.status as DocumentApprovalState, approval };
};

export const isDocumentCleared = (state: DocumentApprovalState) => state === "approved" || state === "notRequired";

const DOC_TITLES = { contract: "договір", specification: "СП" } as const;

/**
 * Чому документи ще не можна надсилати замовнику (null — можна). Лише
 * безготівка: на готівці документів немає, і писати замовнику можна завжди.
 */
export const getSendToCustomerBlocker = (record: ApprovalRecord): string | null => {
  if (!isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)) return null;
  const pending: string[] = [];
  for (const kind of ["contract", "specification"] as const) {
    const { state } = getDocumentApprovalState(record, kind);
    if (state === "missing") return `Спершу створіть ${DOC_TITLES[kind]}`;
    if (!isDocumentCleared(state)) pending.push(DOC_TITLES[kind]);
  }
  return pending.length > 0 ? `Надіслати можна після погодження: ${pending.join(" і ")}` : null;
};

/** Договір підписано: свій або успадкований від першого замовлення замовника. */
export const isContractSigned = (record: Pick<DerivedOrderRecord, "contractSignedAt">) => Boolean(record.contractSignedAt);

/** Дозвіл на запуск без умов: останній запит виду launch, погоджений. */
export const getLaunchException = (record: Pick<DerivedOrderRecord, "approvals">) => latestApproval(record.approvals, "launch");
