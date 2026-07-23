// Contract revisions CRUD + state machine.
//
// State machine:
//   draft → pending_ceo → approved → sent
//                      ↘ rejected → (author edits → pending_ceo again via new submission)
//
// RLS is permissive at the team level; this module enforces transitions in code.

import { supabase } from "@/lib/supabaseClient";
import {
  CORE_CONTRACT_SECTION_IDS,
  isContractSectionArray,
  type ContractSection,
} from "./contractSections";

export type ContractRevisionStatus = "draft" | "pending_ceo" | "approved" | "rejected" | "sent";
export type ContractRevisionCeoDecision = "approved" | "rejected";

export type ContractRevision = {
  id: string;
  teamId: string;
  orderId: string;
  revisionNumber: number;
  status: ContractRevisionStatus;
  sections: ContractSection[];
  notesForCeo: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  submittedForCeoAt: string | null;
  ceoReviewedByUserId: string | null;
  ceoReviewedAt: string | null;
  ceoDecision: ContractRevisionCeoDecision | null;
  ceoComment: string | null;
  sentToCustomerAt: string | null;
  sentByUserId: string | null;
  snapshotStorageBucket: string | null;
  snapshotStoragePath: string | null;
};

type ContractRevisionRow = {
  id: string;
  team_id: string;
  order_id: string;
  revision_number: number;
  status: ContractRevisionStatus;
  sections: unknown;
  notes_for_ceo: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  submitted_for_ceo_at: string | null;
  ceo_reviewed_by_user_id: string | null;
  ceo_reviewed_at: string | null;
  ceo_decision: ContractRevisionCeoDecision | null;
  ceo_comment: string | null;
  sent_to_customer_at: string | null;
  sent_by_user_id: string | null;
  snapshot_storage_bucket: string | null;
  snapshot_storage_path: string | null;
};

const mapRow = (row: ContractRevisionRow): ContractRevision => ({
  id: row.id,
  teamId: row.team_id,
  orderId: row.order_id,
  revisionNumber: row.revision_number,
  status: row.status,
  sections: isContractSectionArray(row.sections) ? (row.sections as ContractSection[]) : [],
  notesForCeo: row.notes_for_ceo,
  createdByUserId: row.created_by_user_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  submittedForCeoAt: row.submitted_for_ceo_at,
  ceoReviewedByUserId: row.ceo_reviewed_by_user_id,
  ceoReviewedAt: row.ceo_reviewed_at,
  ceoDecision: row.ceo_decision,
  ceoComment: row.ceo_comment,
  sentToCustomerAt: row.sent_to_customer_at,
  sentByUserId: row.sent_by_user_id,
  snapshotStorageBucket: row.snapshot_storage_bucket,
  snapshotStoragePath: row.snapshot_storage_path,
});

export const isCoreContractSectionId = (id: string): boolean =>
  (CORE_CONTRACT_SECTION_IDS as ReadonlyArray<string>).includes(id);

export const loadContractRevisions = async (
  teamId: string,
  orderId: string
): Promise<ContractRevision[]> => {
  const { data, error } = await supabase
    .schema("tosho")
    .from("contract_revisions")
    .select("*")
    .eq("team_id", teamId)
    .eq("order_id", orderId)
    .order("revision_number", { ascending: false });
  if (error) throw error;
  return ((data as ContractRevisionRow[] | null) ?? []).map(mapRow);
};

export const loadPendingCeoRevisions = async (teamId: string): Promise<ContractRevision[]> => {
  const { data, error } = await supabase
    .schema("tosho")
    .from("contract_revisions")
    .select("*")
    .eq("team_id", teamId)
    .eq("status", "pending_ceo")
    .order("submitted_for_ceo_at", { ascending: true });
  if (error) throw error;
  return ((data as ContractRevisionRow[] | null) ?? []).map(mapRow);
};

const nextRevisionNumber = async (teamId: string, orderId: string): Promise<number> => {
  const { data, error } = await supabase
    .schema("tosho")
    .from("contract_revisions")
    .select("revision_number")
    .eq("team_id", teamId)
    .eq("order_id", orderId)
    .order("revision_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  const rows = (data as { revision_number: number }[] | null) ?? [];
  return rows.length > 0 ? rows[0].revision_number + 1 : 1;
};

export const createDraftRevision = async (params: {
  teamId: string;
  orderId: string;
  sections: ContractSection[];
  notesForCeo?: string | null;
  createdByUserId: string;
}): Promise<ContractRevision> => {
  const revisionNumber = await nextRevisionNumber(params.teamId, params.orderId);
  const { data, error } = await supabase
    .schema("tosho")
    .from("contract_revisions")
    .insert({
      team_id: params.teamId,
      order_id: params.orderId,
      revision_number: revisionNumber,
      status: "draft" as ContractRevisionStatus,
      sections: params.sections,
      notes_for_ceo: params.notesForCeo ?? null,
      created_by_user_id: params.createdByUserId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data as ContractRevisionRow);
};

export const updateDraftRevision = async (params: {
  revisionId: string;
  sections: ContractSection[];
  notesForCeo?: string | null;
}): Promise<ContractRevision> => {
  const { data, error } = await supabase
    .schema("tosho")
    .from("contract_revisions")
    .update({
      sections: params.sections,
      notes_for_ceo: params.notesForCeo ?? null,
    })
    .eq("id", params.revisionId)
    .in("status", ["draft", "rejected"])
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Ревізію не знайдено або вже відправлено на схвалення.");
  return mapRow(data as ContractRevisionRow);
};

export const submitRevisionForCeoApproval = async (revisionId: string): Promise<ContractRevision> => {
  const { data, error } = await supabase
    .schema("tosho")
    .from("contract_revisions")
    .update({
      status: "pending_ceo" as ContractRevisionStatus,
      submitted_for_ceo_at: new Date().toISOString(),
      ceo_reviewed_at: null,
      ceo_reviewed_by_user_id: null,
      ceo_decision: null,
      ceo_comment: null,
    })
    .eq("id", revisionId)
    .in("status", ["draft", "rejected"])
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Можна надсилати на схвалення лише чернетку.");
  return mapRow(data as ContractRevisionRow);
};

export const ceoDecideRevision = async (params: {
  revisionId: string;
  decision: ContractRevisionCeoDecision;
  comment?: string | null;
  ceoUserId: string;
}): Promise<ContractRevision> => {
  const nextStatus: ContractRevisionStatus = params.decision === "approved" ? "approved" : "rejected";
  const { data, error } = await supabase
    .schema("tosho")
    .from("contract_revisions")
    .update({
      status: nextStatus,
      ceo_decision: params.decision,
      ceo_comment: params.comment?.trim() || null,
      ceo_reviewed_by_user_id: params.ceoUserId,
      ceo_reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.revisionId)
    .eq("status", "pending_ceo")
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Цю ревізію вже розглянуто.");
  return mapRow(data as ContractRevisionRow);
};

export const markRevisionAsSent = async (params: {
  revisionId: string;
  sentByUserId: string;
  snapshotStorageBucket?: string | null;
  snapshotStoragePath?: string | null;
}): Promise<ContractRevision> => {
  const { data, error } = await supabase
    .schema("tosho")
    .from("contract_revisions")
    .update({
      status: "sent" as ContractRevisionStatus,
      sent_to_customer_at: new Date().toISOString(),
      sent_by_user_id: params.sentByUserId,
      snapshot_storage_bucket: params.snapshotStorageBucket ?? null,
      snapshot_storage_path: params.snapshotStoragePath ?? null,
    })
    .eq("id", params.revisionId)
    .eq("status", "approved")
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Позначити як відправлене можна лише схвалену ревізію.");
  return mapRow(data as ContractRevisionRow);
};

export const STATUS_LABEL: Record<ContractRevisionStatus, string> = {
  draft: "Чернетка",
  pending_ceo: "На схваленні CEO",
  approved: "Схвалено CEO",
  rejected: "Повернено на правки",
  sent: "Відправлено замовнику",
};

// STATUS_TONE переїхав у @/lib/statusTones як CONTRACT_REVISION_STATUS_TONE —
// разом з тонами прорахунків і дизайн-задач, щоб мапи статус→тон жили в одному
// місці, а не по одній на домен.

export const getLatestRevision = (revisions: ContractRevision[]): ContractRevision | null => {
  if (revisions.length === 0) return null;
  return revisions.reduce((latest, current) =>
    current.revisionNumber > latest.revisionNumber ? current : latest
  );
};

export const getLatestApprovedOrSentRevision = (revisions: ContractRevision[]): ContractRevision | null => {
  const candidates = revisions.filter((r) => r.status === "approved" || r.status === "sent");
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, current) =>
    current.revisionNumber > latest.revisionNumber ? current : latest
  );
};
