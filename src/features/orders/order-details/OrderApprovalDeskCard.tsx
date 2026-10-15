import { useState } from "react";

import { ExternalLink, FileSignature, Rocket } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { OrderApproval } from "@/features/orders/orderApprovals";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";

const TITLES = {
  contract: "Погодити договір",
  specification: "Погодити СП",
  launch: "Дозволити запуск без умов",
} as const;

const formatAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

function ApprovalItem({
  record,
  approval,
  busy,
  onDecide,
  onPreview,
}: {
  record: DerivedOrderRecord;
  approval: OrderApproval;
  busy: boolean;
  onDecide: (approval: OrderApproval, status: "approved" | "returned", note?: string) => Promise<boolean>;
  onPreview: ((kind: "contract" | "specification") => void) | null;
}) {
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const isLaunch = approval.kind === "launch";
  const requester =
    approval.requestedBy && approval.requestedBy === record.managerUserId ? record.managerLabel : "Менеджер";
  const at = formatAt(approval.requestedAt);
  const Icon = isLaunch ? Rocket : FileSignature;

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-info-foreground" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{TITLES[approval.kind]}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Просить {requester}
              {at ? ` · ${at}` : ""}
            </div>
            {approval.requestNote ? (
              <div className="mt-1 text-sm text-foreground">«{approval.requestNote}»</div>
            ) : null}
          </div>
        </div>
        {!isLaunch && onPreview ? (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 px-2 text-xs"
            onClick={() => onPreview(approval.kind as "contract" | "specification")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Переглянути
          </Button>
        ) : null}
      </div>
      {returning ? (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            autoFocus
            aria-label={isLaunch ? "Чому відмовляєте" : "Що виправити"}
            placeholder={isLaunch ? "Чому ні — менеджер побачить це в стрічці" : "Що виправити менеджеру"}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setReturning(false)} disabled={busy}>
              Скасувати
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!note.trim() || busy}
              onClick={async () => {
                if (await onDecide(approval, "returned", note)) setReturning(false);
              }}
            >
              {isLaunch ? "Відмовити" : "Повернути менеджеру"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setReturning(true)}>
            {isLaunch ? "Відмовити" : "Повернути"}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void onDecide(approval, "approved")}>
            {isLaunch ? "Дозволити" : "Погодити"}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Плашка погоджувача на замовленні (REQ-322#p6, p8): договір і СП на погодженні
 * — для бухгалтерії й СЕО, прохання запустити без умов — для СЕО й головбуха.
 * Погоджувач приходить сюди зі сповіщення, тож плашка стоїть згори картки.
 */
export function OrderApprovalDeskCard({
  record,
  pending,
  busy,
  onDecide,
  onPreview,
}: {
  record: DerivedOrderRecord;
  pending: OrderApproval[];
  busy: boolean;
  onDecide: (approval: OrderApproval, status: "approved" | "returned", note?: string) => Promise<boolean>;
  onPreview: (kind: "contract" | "specification") => void;
}) {
  if (pending.length === 0) return null;
  return (
    <section
      className="divide-y divide-info-soft-border/60 rounded-xl border border-info-soft-border bg-info-soft/40"
      aria-label="Запити на погодження"
    >
      {pending.map((approval) => (
        <ApprovalItem
          key={approval.id}
          record={record}
          approval={approval}
          busy={busy}
          onDecide={onDecide}
          onPreview={onPreview}
        />
      ))}
    </section>
  );
}
