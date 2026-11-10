import { supabase } from "@/lib/supabaseClient";

import {
  CUSTOMER_CONTRACT_COLUMNS,
  toCustomerContract,
  type CustomerContract,
  type CustomerContractRow,
} from "./customerContracts";
import { isBrowserViewable, storageExtension, type RecognitionInput } from "./customerContractFile";

const BUCKET = "attachments";

/**
 * Договори поза CRM для замовників зі списку. До застосування міграції таблиці
 * немає — тоді порожньо, і замовлення читаються як досі.
 */
export async function listCustomerContracts(teamId: string, customerIds: string[]): Promise<CustomerContract[]> {
  if (customerIds.length === 0) return [];
  const { data, error } = await supabase
    .schema("tosho")
    .from("customer_contracts")
    .select(CUSTOMER_CONTRACT_COLUMNS)
    .eq("team_id", teamId)
    .in("customer_id", customerIds);
  if (error) return [];
  return ((data ?? []) as CustomerContractRow[]).map(toCustomerContract);
}

export type CustomerContractDraft = {
  customerId: string;
  ourLegalEntityId: string | null;
  number: string;
  date: string;
  validUntil: string | null;
  autoProlongation: boolean;
  signedVia: CustomerContract["signedVia"];
  file: File;
};

/** Файл кладемо до рядка: договір без скана нікому не довести. */
export async function saveCustomerContract(teamId: string, draft: CustomerContractDraft) {
  const path = `teams/${teamId}/customer-contracts/${draft.customerId}/${crypto.randomUUID()}.${storageExtension(draft.file)}`;
  const upload = await supabase.storage.from(BUCKET).upload(path, draft.file, {
    contentType: draft.file.type || undefined,
    upsert: false,
  });
  if (upload.error) throw new Error(`Файл не завантажився: ${upload.error.message}`);
  const { error } = await supabase
    .schema("tosho")
    .from("customer_contracts")
    .insert({
      team_id: teamId,
      customer_id: draft.customerId,
      our_legal_entity_id: draft.ourLegalEntityId,
      number: draft.number.trim(),
      contract_date: draft.date,
      valid_until: draft.validUntil,
      auto_prolongation: draft.autoProlongation,
      signed_via: draft.signedVia,
      file_path: path,
      file_name: draft.file.name.slice(0, 200),
    });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.code === "42501" ? "Вносити договори можуть СЕО і бухгалтерія." : error.message);
  }
}

/**
 * PDF і фото відкриваються у вкладці; Word, ODT, RTF і TIFF браузер не покаже —
 * їх віддаємо завантаженням під назвою, з якою файл вносили, а не під UUID шляху.
 */
export async function openCustomerContractFile(path: string, fileName?: string | null) {
  const viewable = isBrowserViewable(path);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 300, viewable ? undefined : { download: fileName?.trim() || true });
  if (error || !data?.signedUrl) throw new Error("Не вдалося відкрити файл договору.");
  if (viewable) {
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    return;
  }
  // Відповідь із Content-Disposition: attachment сторінку не покидає — порожньої вкладки не лишається.
  const link = document.createElement("a");
  link.href = data.signedUrl;
  link.rel = "noopener";
  link.click();
}

export type RecognizedContract = {
  number: string | null;
  date: string | null;
  validUntil: string | null;
  autoProlongation: boolean | null;
  customerName: string | null;
  customerCode: string | null;
  warnings: string[];
};

/** Розпізнає номер, дату й термін; нічого не пише — поля звіряє людина. */
export async function recognizeCustomerContract(fileName: string, input: RecognitionInput): Promise<RecognizedContract> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Сесія застаріла — перезайдіть у CRM.");
  const response = await fetch("/.netlify/functions/customer-contract-parse", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(
      input.kind === "text"
        ? { fileName: fileName.slice(0, 200), text: input.text }
        : { fileName: fileName.slice(0, 200), mimeType: input.mimeType, fileBase64: input.base64 }
    ),
  });
  const payload = (await response.json().catch(() => null)) as (RecognizedContract & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error || `Розпізнати не вдалося (${response.status}).`);
  return { ...payload, warnings: payload.warnings ?? [] };
}
