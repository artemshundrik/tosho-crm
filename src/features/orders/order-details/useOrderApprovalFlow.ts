import { useState } from "react";
import { toast } from "sonner";

import { documentStamp, SIGNATURE_VIA_LABELS, type OrderApproval, type SignatureVia } from "@/features/orders/orderApprovals";
import { decideOrderApproval, requestOrderApproval, setOrderSignature } from "@/features/orders/orderApprovalQueries";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { logActivity } from "@/lib/activityLogger";
import { getCurrentUser } from "@/lib/currentUser";
import { buildUserNameFromMetadata, type UserNameMetadata } from "@/lib/userName";
import { notifyOrderApprovalDecided, notifyOrderApprovalRequested } from "@/lib/workflowNotifications";

/** Подія для стрічки замовлення — у білому списку THREAD_EVENT_ACTIONS. */
export const ORDER_APPROVAL_EVENT = "order_approval";

const SUBJECT = { contract: "договір", specification: "СП", launch: "запуск без умов" } as const;

async function currentUserName() {
  const user = await getCurrentUser();
  if (!user) return null;
  const name = buildUserNameFromMetadata(user.user_metadata as UserNameMetadata | undefined, user.email);
  return name.displayName || user.email || null;
}

/**
 * Погодження договору й СП (REQ-322#p6), позначки підпису (p7) і дозвіл на
 * запуск без умов (p8). Запис у базу — головне; сповіщення й рядок у стрічці
 * йдуть услід, і їхній збій лише попереджає.
 */
export function useOrderApprovalFlow({
  record,
  teamId,
  userId,
  onRecordPatch,
  loadFresh,
}: {
  record: DerivedOrderRecord | null;
  teamId: string | null | undefined;
  userId: string | null | undefined;
  onRecordPatch: (patch: (current: DerivedOrderRecord) => DerivedOrderRecord) => void;
  /**
   * Свіжий запис із бази. Відбиток документа рахуємо саме з нього: локальний
   * запис після правки умов відрізняється від того, що прийде після
   * перезавантаження (успадковані умови, ціни з тиражів), і погоджений документ
   * хибно ставав би «зміненим».
   */
  loadFresh: () => Promise<DerivedOrderRecord | null>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const followUp = async (title: string, notify: (actorName: string | null) => Promise<void>) => {
    if (!record || !teamId) return;
    try {
      const actorName = await currentUserName();
      await Promise.all([
        logActivity({
          teamId,
          action: ORDER_APPROVAL_EVENT,
          entityType: "orders",
          entityId: record.id,
          title,
          href: `/orders/production/${record.id}`,
          metadata: { quote_id: record.linkedQuoteId ?? record.id, order_id: record.id },
        }),
        notify(actorName),
      ]);
    } catch {
      toast.warning("Збережено, але сповіщення не надіслалось — скажіть колегам самі.");
    }
  };

  const upsertApproval = (approval: OrderApproval) =>
    onRecordPatch((current) => ({
      ...current,
      approvals: [approval, ...current.approvals.filter((item) => item.id !== approval.id)],
    }));

  const guard = async (key: string, action: () => Promise<void>) => {
    if (!record || !teamId || busy) return false;
    setBusy(key);
    try {
      await action();
      return true;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const request = (kind: "contract" | "specification" | "launch", note?: string) =>
    guard(`request:${kind}`, async () => {
      const fresh = kind === "launch" ? null : await loadFresh();
      const approval = await requestOrderApproval({
        teamId: teamId!,
        orderId: record!.id,
        kind,
        documentStamp: kind === "launch" ? null : documentStamp(fresh ?? record!, kind),
        note,
      });
      if (fresh) onRecordPatch(() => fresh);
      upsertApproval(approval);
      toast.success(kind === "launch" ? "Попросили дозволу — СЕО й головбух отримали сповіщення" : `${SUBJECT[kind]} надіслано на погодження`);
      void followUp(
        kind === "launch" ? `Попросив(ла) дозволу запустити без умов: ${note?.trim() ?? ""}` : `Надіслав(ла) ${SUBJECT[kind]} на погодження`,
        (actorName) =>
          notifyOrderApprovalRequested({
            teamId: teamId!,
            orderId: record!.id,
            orderNumber: record!.quoteNumber,
            customerName: record!.customerName,
            kind,
            note,
            requesterName: actorName,
            actorUserId: userId,
          })
      );
    });

  const decide = (approval: OrderApproval, status: "approved" | "returned", note?: string) =>
    guard(`decide:${approval.id}`, async () => {
      const next = await decideOrderApproval({ approvalId: approval.id, status, note });
      upsertApproval(next);
      const approved = status === "approved";
      const subject = SUBJECT[approval.kind];
      toast.success(approval.kind === "launch" ? (approved ? "Запуск дозволено" : "Відмовлено") : approved ? `${subject} погоджено` : `${subject} повернуто`);
      void followUp(
        approval.kind === "launch"
          ? approved
            ? "Дозволив(ла) запустити без умов"
            : `Відмовив(ла) в запуску без умов: ${note?.trim() ?? ""}`
          : approved
            ? `Погодив(ла) ${subject}`
            : `Повернув(ла) ${subject}: ${note?.trim() ?? ""}`,
        (actorName) =>
          notifyOrderApprovalDecided({
            orderId: record!.id,
            orderNumber: record!.quoteNumber,
            kind: approval.kind,
            decision: status,
            note,
            requesterUserId: approval.requestedBy,
            deciderName: actorName,
            actorUserId: userId,
          })
      );
    });

  /** Відкликати свій запит — щоб виправити документ і надіслати наново. */
  const withdraw = (approval: OrderApproval) =>
    guard(`withdraw:${approval.id}`, async () => {
      upsertApproval(await decideOrderApproval({ approvalId: approval.id, status: "withdrawn" }));
      toast.success("Запит відкликано — виправте документ і надішліть на погодження знову");
    });

  const sign = (kind: "contract" | "specification", via: SignatureVia | null) =>
    guard(`sign:${kind}`, async () => {
      // Успадкований договір підписують один раз — позначка йде на замовлення, де
      // він живе, і тоді її бачать усі наступні замовлення замовника.
      const orderId = kind === "contract" && record!.inheritedContractOrderId ? record!.inheritedContractOrderId : record!.id;
      const result = await setOrderSignature({ teamId: teamId!, orderId, kind, via });
      onRecordPatch((current) =>
        kind === "contract"
          ? { ...current, contractSignedAt: result.signedAt, contractSignedVia: result.via }
          : { ...current, specificationSignedAt: result.signedAt, specificationSignedVia: result.via }
      );
      const what = kind === "contract" ? "Договір" : "СП";
      toast.success(via ? `${what}: позначено підписаним ${SIGNATURE_VIA_LABELS[via]}` : `${what}: позначку підпису знято`);
      void followUp(
        via ? `${what} підписано ${SIGNATURE_VIA_LABELS[via]}` : `Зняв(ла) позначку підпису: ${what}`,
        async () => undefined
      );
    });

  return { busy, request, decide, withdraw, sign };
}
