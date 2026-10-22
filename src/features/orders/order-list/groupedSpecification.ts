import {
  isCashlessPaymentMethod,
  markOrderDocumentCreated,
  type DerivedOrderRecord,
} from "@/features/orders/orderRecords";
import { buildSpecificationHtml } from "@/features/orders/specificationDocument";
import { loadSpecificationItemTexts, resolveVisualizationImageUrls } from "@/features/orders/specificationQueries";
import { declineToGenitive } from "@/lib/nameDeclension";
import { supabase } from "@/lib/supabaseClient";
import { openDocumentWindow } from "../documentPrintWindow";

/**
 * «Одна СП на обрані»: кілька замовлень одного замовника в одній специфікації
 * (REQ-322#p12). Документ той самий, що й СП одного замовлення, — шаблон № 31
 * (REQ-322#p21), а номер СП у межах договору один на всю групу (REQ-322#p22).
 */
const normalizeText = (value?: string | null) => (value ?? "").trim().toLowerCase();

export const getSpecificationRecordBlocker = (record: DerivedOrderRecord) => {
  if (record.source !== "stored") return "СП можна додавати тільки зі створених замовлень.";
  if (record.items.length === 0) return "У замовленні немає позицій.";
  if (!isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)) return "СП створюється тільки для безготівки.";
  if (!record.contractCreatedAt) return "Спочатку потрібно створити договір.";
  if (!record.customerVatId?.trim()) return "У картці замовника не вказано ІПН.";
  if (!record.specificationCreatedAt && !record.invoiceNumber) return "Спочатку рахунок: бухгалтерія ще його не виписала.";
  if (!record.docs.specification) return "У замовленні ще не виконані умови для СП.";
  return null;
};

const getSpecificationCustomerKey = (record: DerivedOrderRecord) =>
  [
    record.customerId || "",
    normalizeText(record.legalEntityLabel || record.customerName),
    normalizeText(record.customerTaxId),
  ].join("|");

export const getSpecificationGroupBlocker = (records: DerivedOrderRecord[]) => {
  if (records.length === 0) return "Обери хоча б одне замовлення для СП.";
  const first = records[0];
  const firstKey = getSpecificationCustomerKey(first);
  for (const record of records) {
    const blocker = getSpecificationRecordBlocker(record);
    if (blocker) return `${record.quoteNumber}: ${blocker}`;
    if (getSpecificationCustomerKey(record) !== firstKey) return "В одну СП можна додати тільки замовлення одного Замовника.";
    if ((record.ourLegalEntityId ?? "") !== (first.ourLegalEntityId ?? "")) {
      return "В одну СП можна додати тільки замовлення від однієї нашої юрособи.";
    }
    if (
      record.paymentTerms !== first.paymentTerms ||
      record.prepaymentPct !== first.prepaymentPct ||
      record.balancePct !== first.balancePct ||
      record.balanceTiming !== first.balanceTiming
    ) {
      return "Для групової СП обери замовлення з однаковими умовами оплати.";
    }
    if (record.incotermsCode !== first.incotermsCode || (record.incotermsPlace ?? "") !== (first.incotermsPlace ?? "")) {
      return "Для групової СП обери замовлення з однаковими умовами Incoterms.";
    }
  }
  return null;
};

export type GroupedSpecificationMark = { specificationCreatedAt: string; specificationNumber: number | null };

/**
 * Позначає СП створеною на замовленнях групи, у яких її ще не було, і видає
 * всім один номер. Номер бере тригер на першому замовленні, решта отримує той
 * самий: це один документ. Замовлення, де СП уже була, лишаються як є, — дата
 * й номер підписаної СП не зсуваються.
 */
async function markGroupedSpecification(teamId: string, records: DerivedOrderRecord[]) {
  const marks = new Map<string, GroupedSpecificationMark>();
  let number = records.find((record) => record.specificationNumber !== null)?.specificationNumber ?? null;
  for (const record of records) {
    if (record.specificationCreatedAt) {
      marks.set(record.id, { specificationCreatedAt: record.specificationCreatedAt, specificationNumber: record.specificationNumber });
      continue;
    }
    if (number === null) {
      const created = await markOrderDocumentCreated({ teamId, orderId: record.id, documentKind: "specification" });
      number = created.specificationNumber;
      marks.set(record.id, { specificationCreatedAt: created.createdAt, specificationNumber: number });
      continue;
    }
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .schema("tosho")
      .from("orders")
      .update({ specification_created_at: nowIso, specification_number: number, updated_at: nowIso })
      .eq("team_id", teamId)
      .eq("id", record.id);
    if (error) throw error;
    marks.set(record.id, { specificationCreatedAt: nowIso, specificationNumber: number });
  }
  return marks;
}

/**
 * Відкриває групову СП у новій вкладці. Позначку створення ставить ДО збирання
 * документа: номер СП видає база, і він має стояти вже в першому примірнику.
 * Повертає позначки за id замовлення; помилку кидає з людським текстом.
 */
export async function openGroupedSpecification(
  teamId: string,
  selectedRecords: DerivedOrderRecord[]
): Promise<Map<string, GroupedSpecificationMark>> {
  const blocker = getSpecificationGroupBlocker(selectedRecords);
  if (blocker) throw new Error(blocker);

  // Вікно — одразу в кліку, до запитів: інакше браузер його блокує (див. documentPrintWindow).
  const printWindow = openDocumentWindow("Специфікація");
  if (printWindow.blocked) throw new Error("Браузер заблокував відкриття документа. Дозволь popup для цього сайту.");

  let marks: Map<string, GroupedSpecificationMark>;
  try {
    marks = await markGroupedSpecification(teamId, selectedRecords);
  } catch (markError: unknown) {
    printWindow.cancel();
    throw new Error(markError instanceof Error ? markError.message : "Не вдалося зберегти позначку створення СП.", {
      cause: markError,
    });
  }
  const records = selectedRecords.map((record) => ({ ...record, ...marks.get(record.id) }));
  const first = records[0];

  // Відмінюємо ПІБ і посаду підписанта замовника у родовий відмінок (паралельно, з кешем + fallback).
  const [customerSignatoryNameGenitive, customerSignatoryRoleGenitive, visualizationImageUrls, itemTexts] =
    await Promise.all([
      first.customerSignatoryName ? declineToGenitive(first.customerSignatoryName) : Promise.resolve(""),
      first.customerSignatoryPosition ? declineToGenitive(first.customerSignatoryPosition) : Promise.resolve(""),
      resolveVisualizationImageUrls(records.flatMap((record) => record.approvedVisualizationAssets)),
      loadSpecificationItemTexts(teamId, records).catch(() => []),
    ]);
  printWindow.mark("відмінювання ПІБ, візуалізації й тексти позицій");
  printWindow.show(
    buildSpecificationHtml({
      records,
      specificationNumber: first.specificationNumber,
      itemTexts: new Map(itemTexts.map((entry) => [entry.itemId, entry.text])),
      visualizationImageUrls,
      customerSignatoryNameGenitive,
      customerSignatoryRoleGenitive,
    }),
    { teamId, orderId: first.id }
  );
  return marks;
}
