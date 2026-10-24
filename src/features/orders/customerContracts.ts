import type { SignatureVia } from "@/features/orders/orderApprovals";

/**
 * Договір, підписаний поза CRM (REQ-322#p39): бухгалтер вносить його файлом,
 * і замовлення без власного договору успадковують його так само, як договір,
 * створений у CRM на попередньому замовленні.
 */
export type CustomerContract = {
  id: string;
  customerId: string;
  ourLegalEntityId: string | null;
  number: string;
  /** yyyy-MM-dd */
  date: string;
  /** yyyy-MM-dd; null — безстроковий */
  validUntil: string | null;
  autoProlongation: boolean;
  signedVia: SignatureVia;
  filePath: string | null;
  fileName: string | null;
  createdAt: string;
};

export type CustomerContractRow = {
  id: string;
  customer_id: string;
  our_legal_entity_id: string | null;
  number: string;
  contract_date: string;
  valid_until: string | null;
  auto_prolongation: boolean | null;
  signed_via: string | null;
  file_path: string | null;
  file_name: string | null;
  created_at: string;
};

export const CUSTOMER_CONTRACT_COLUMNS =
  "id,customer_id,our_legal_entity_id,number,contract_date,valid_until,auto_prolongation,signed_via,file_path,file_name,created_at";

export const toCustomerContract = (row: CustomerContractRow): CustomerContract => ({
  id: row.id,
  customerId: row.customer_id,
  ourLegalEntityId: row.our_legal_entity_id,
  number: row.number.trim(),
  date: row.contract_date,
  validUntil: row.valid_until,
  autoProlongation: row.auto_prolongation === true,
  signedVia: row.signed_via === "vchasno" || row.signed_via === "medoc" ? row.signed_via : "paper",
  filePath: row.file_path,
  fileName: row.file_name,
  createdAt: row.created_at,
});

/**
 * Чи діє договір на дату `today` (yyyy-MM-dd). Пролонгований не закінчується;
 * без терміну — безстроковий. Закінчений не успадковується: рахунок на ньому
 * виписати не можна, як і без договору взагалі.
 */
export const isCustomerContractActive = (contract: Pick<CustomerContract, "validUntil" | "autoProlongation">, today: string) =>
  contract.autoProlongation || !contract.validUntil || contract.validUntil >= today;

/** Підпис для «Успадковано з …» і рядка договору. */
export const externalContractLabel = (contract: Pick<CustomerContract, "number">) =>
  `договору поза CRM № ${contract.number}`;
