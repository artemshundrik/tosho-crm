import { format } from "date-fns";

import type { OrderApproval, OrderApprovalKind, OrderApprovalStatus, SignatureVia } from "./orderApprovals";
import { supabase } from "@/lib/supabaseClient";

/**
 * Запити погоджень і позначок підпису (REQ-322#p6–p8). Права й переходи тримає
 * база (тригери в scripts/order-approvals-and-signatures.sql); тексти її
 * помилок уже людські — показуємо як є.
 */
type ApprovalRow = {
  id: string;
  order_id: string;
  kind: OrderApprovalKind;
  status: OrderApprovalStatus;
  document_stamp: string | null;
  request_note: string | null;
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

const COLUMNS =
  "id,order_id,kind,status,document_stamp,request_note,requested_by,requested_at,decided_by,decided_at,decision_note";

const toApproval = (row: ApprovalRow): OrderApproval => ({
  id: row.id,
  orderId: row.order_id,
  kind: row.kind,
  status: row.status,
  documentStamp: row.document_stamp,
  requestNote: row.request_note,
  requestedBy: row.requested_by,
  requestedAt: row.requested_at,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at,
  decisionNote: row.decision_note,
});

const asError = (error: { message: string; code?: string }) => {
  if (error.code === "23505") {
    return new Error("Такий запит уже на погодженні.", { cause: error });
  }
  return new Error(error.message || "Не вдалося зберегти погодження.", { cause: error });
};

/**
 * Усі запити команди одним читанням: їх одиниці на замовлення. Якщо таблиці ще
 * немає (міграцію не застосовано) — порожньо, список замовлень не падає.
 */
export async function loadOrderApprovalsByOrderId(teamId: string): Promise<Map<string, OrderApproval[]>> {
  const byOrderId = new Map<string, OrderApproval[]>();
  const { data, error } = await supabase
    .schema("tosho")
    .from("order_approvals")
    .select(COLUMNS)
    .eq("team_id", teamId)
    .order("requested_at", { ascending: false });
  if (error) {
    // Таблиці ще немає — порожньо. Іншу помилку не ковтаємо: інакше погоджені
    // документи мовчки виглядали б непогодженими.
    if (/order_approvals|does not exist|schema cache/i.test(error.message)) return byOrderId;
    throw new Error(error.message, { cause: error });
  }
  for (const row of (data as ApprovalRow[] | null) ?? []) {
    const list = byOrderId.get(row.order_id) ?? [];
    list.push(toApproval(row));
    byOrderId.set(row.order_id, list);
  }
  return byOrderId;
}

export async function requestOrderApproval(params: {
  teamId: string;
  orderId: string;
  kind: OrderApprovalKind;
  documentStamp?: string | null;
  note?: string | null;
}): Promise<OrderApproval> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("order_approvals")
    .insert({
      team_id: params.teamId,
      order_id: params.orderId,
      kind: params.kind,
      document_stamp: params.documentStamp ?? null,
      request_note: params.note?.trim() || null,
    })
    .select(COLUMNS)
    .single<ApprovalRow>();
  if (error) throw asError(error);
  return toApproval(data);
}

export async function decideOrderApproval(params: {
  approvalId: string;
  status: "approved" | "returned" | "withdrawn";
  note?: string | null;
}): Promise<OrderApproval> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("order_approvals")
    .update({ status: params.status, decision_note: params.note?.trim() || null })
    .eq("id", params.approvalId)
    .eq("status", "pending")
    .select(COLUMNS)
    .maybeSingle<ApprovalRow>();
  if (error) throw asError(error);
  if (!data) throw new Error("Цей запит уже розглянули.");
  return toApproval(data);
}

/**
 * Позначка підпису: `via` — паперово / Вчасно / Медок; null знімає позначку.
 * `signedOn` (yyyy-MM-dd) — день, коли документ справді підписали; порожній або
 * сьогоднішній — ставимо поточний момент, інший — полудень того дня, щоб часовий
 * пояс не зсунув дату.
 */
export async function setOrderSignature(params: {
  teamId: string;
  orderId: string;
  kind: "contract" | "specification";
  via: SignatureVia | null;
  signedOn?: string | null;
}): Promise<{ signedAt: string | null; via: SignatureVia | null }> {
  const at = params.kind === "contract" ? "contract_signed_at" : "specification_signed_at";
  const viaColumn = params.kind === "contract" ? "contract_signed_via" : "specification_signed_via";
  const now = new Date().toISOString();
  const signedAt = params.via ? signedAtFromDay(params.signedOn) : null;
  const { data, error } = await supabase
    .schema("tosho")
    .from("orders")
    .update(
      params.kind === "contract"
        ? { contract_signed_at: signedAt, contract_signed_via: params.via, updated_at: now }
        : { specification_signed_at: signedAt, specification_signed_via: params.via, updated_at: now }
    )
    .eq("team_id", params.teamId)
    .eq("id", params.orderId)
    .select(`${at},${viaColumn}`)
    .single<Record<string, string | null>>();
  if (error) throw asError(error);
  return { signedAt: data[at] ?? null, via: (data[viaColumn] as SignatureVia | null) ?? null };
}

function signedAtFromDay(day: string | null | undefined): string {
  const now = new Date();
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day === format(now, "yyyy-MM-dd")) return now.toISOString();
  return new Date(`${day}T12:00:00`).toISOString();
}
