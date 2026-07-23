import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileText,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ContractSectionsEditor } from "./ContractSectionsEditor";
import {
  ceoDecideRevision,
  createDraftRevision,
  getLatestApprovedOrSentRevision,
  getLatestRevision,
  loadContractRevisions,
  markRevisionAsSent,
  STATUS_LABEL,
  submitRevisionForCeoApproval,
  updateDraftRevision,
  type ContractRevision,
  type ContractRevisionStatus,
} from "@/features/contractRevisions/contractRevisions";
import { contractRevisionStatusTone, toneSubtleClass } from "@/lib/statusTones";
import type { ContractSection } from "@/features/contractRevisions/contractSections";
import {
  notifyContractRevisionDecided,
  notifyContractRevisionSubmitted,
} from "@/lib/workflowNotifications";

type RevisionAction =
  | { kind: "create_first"; initialSections: ContractSection[] }
  | { kind: "create_next"; initialSections: ContractSection[] }
  | { kind: "edit"; revision: ContractRevision };

type Props = {
  teamId: string;
  orderId: string;
  currentUserId: string;
  isCeo: boolean;
  quoteNumber?: string | null;
  initialDefaultSections: ContractSection[];
  onOpenPreview: (sections: ContractSection[]) => Promise<void> | void;
  onSnapshotRevision?: (revision: ContractRevision) => Promise<{ storageBucket: string; storagePath: string } | null>;
  onRevisionSent?: (revision: ContractRevision) => void;
};

// Був `Record<ReturnType<typeof STATUS_TONE.draft extends infer T ? () => T : never> | string, string>`
// — умовний тип, який після розгортання давав просто `Record<string, string>`,
// тобто нульову типобезпеку при вигляді складного. Тон тепер приходить з
// реєстру і звужений до `Tone`, тож пропущений статус ловить компілятор.
const statusBadgeClass = (status: ContractRevisionStatus) =>
  toneSubtleClass[contractRevisionStatusTone(status)];

const formatTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("uk-UA")} ${d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}`;
};

export const ContractRevisionsPanel = ({
  teamId,
  orderId,
  currentUserId,
  isCeo,
  quoteNumber,
  initialDefaultSections,
  onOpenPreview,
  onSnapshotRevision,
  onRevisionSent,
}: Props) => {
  const [revisions, setRevisions] = useState<ContractRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<RevisionAction | null>(null);
  const [editingSections, setEditingSections] = useState<ContractSection[]>([]);
  const [editingNotes, setEditingNotes] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ceoCommentDraft, setCeoCommentDraft] = useState<Record<string, string>>({});
  const [expandedRevisionId, setExpandedRevisionId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const rows = await loadContractRevisions(teamId, orderId);
      setRevisions(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не вдалося завантажити ревізії договору.");
    }
  }, [teamId, orderId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        await refresh();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  const latest = useMemo(() => getLatestRevision(revisions), [revisions]);
  const latestApprovedOrSent = useMemo(() => getLatestApprovedOrSentRevision(revisions), [revisions]);

  const buildPreviousSectionsMap = useCallback(
    (revision: ContractRevision): Map<string, string> | null => {
      const previousCandidates = revisions
        .filter(
          (other) =>
            other.id !== revision.id &&
            other.revisionNumber < revision.revisionNumber &&
            (other.status === "approved" || other.status === "sent")
        )
        .sort((a, b) => b.revisionNumber - a.revisionNumber);
      const previous = previousCandidates[0];
      if (!previous) return null;
      const map = new Map<string, string>();
      previous.sections.forEach((section) => map.set(section.id, section.bodyHtml));
      return map;
    },
    [revisions]
  );

  // "Чи має менеджер право створювати нову ревізію зараз" — лише якщо немає активної ще-не-надісланої.
  const canCreateNew = useMemo(() => {
    if (!latest) return true;
    return latest.status === "sent";
  }, [latest]);

  const startEditing = (next: RevisionAction) => {
    setAction(next);
    if (next.kind === "edit") {
      setEditingSections(next.revision.sections);
      setEditingNotes(next.revision.notesForCeo ?? "");
    } else {
      setEditingSections(next.initialSections);
      setEditingNotes("");
    }
  };

  const cancelEditing = () => {
    setAction(null);
    setEditingSections([]);
    setEditingNotes("");
  };

  const notifySubmitted = async (revisionNumber: number) => {
    try {
      await notifyContractRevisionSubmitted({
        teamId,
        orderId,
        revisionNumber,
        quoteNumber,
        actorUserId: currentUserId,
      });
    } catch (notifyError) {
      console.error("Failed to send CEO notification for contract revision", notifyError);
    }
  };

  const notifyDecided = async (revision: ContractRevision, decision: "approved" | "rejected", comment: string | null) => {
    try {
      await notifyContractRevisionDecided({
        orderId,
        revisionNumber: revision.revisionNumber,
        decision,
        ceoComment: comment,
        authorUserId: revision.createdByUserId,
        quoteNumber,
        actorUserId: currentUserId,
      });
    } catch (notifyError) {
      console.error("Failed to send manager notification for contract revision", notifyError);
    }
  };

  const handleCreate = async ({ submit }: { submit: boolean }) => {
    if (!action) return;
    if (action.kind === "edit") return;
    setBusyId("__create__");
    setError(null);
    try {
      const draft = await createDraftRevision({
        teamId,
        orderId,
        sections: editingSections,
        notesForCeo: editingNotes.trim() || null,
        createdByUserId: currentUserId,
      });
      if (submit) {
        await submitRevisionForCeoApproval(draft.id);
        await notifySubmitted(draft.revisionNumber);
      }
      await refresh();
      cancelEditing();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не вдалося створити ревізію.");
    } finally {
      setBusyId(null);
    }
  };

  const handleUpdate = async ({ submit }: { submit: boolean }) => {
    if (!action || action.kind !== "edit") return;
    setBusyId(action.revision.id);
    setError(null);
    try {
      await updateDraftRevision({
        revisionId: action.revision.id,
        sections: editingSections,
        notesForCeo: editingNotes.trim() || null,
      });
      if (submit) {
        await submitRevisionForCeoApproval(action.revision.id);
        await notifySubmitted(action.revision.revisionNumber);
      }
      await refresh();
      cancelEditing();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Не вдалося зберегти ревізію.");
    } finally {
      setBusyId(null);
    }
  };

  const handleCeoDecision = async (revision: ContractRevision, decision: "approved" | "rejected") => {
    setBusyId(revision.id);
    setError(null);
    const comment = (ceoCommentDraft[revision.id] ?? "").trim() || null;
    try {
      await ceoDecideRevision({
        revisionId: revision.id,
        decision,
        comment,
        ceoUserId: currentUserId,
      });
      await notifyDecided(revision, decision, comment);
      setCeoCommentDraft((prev) => {
        const next = { ...prev };
        delete next[revision.id];
        return next;
      });
      await refresh();
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : "Не вдалося зберегти рішення CEO.");
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkSent = async (revision: ContractRevision) => {
    setBusyId(revision.id);
    setError(null);
    try {
      const snapshot = onSnapshotRevision ? await onSnapshotRevision(revision) : null;
      const updated = await markRevisionAsSent({
        revisionId: revision.id,
        sentByUserId: currentUserId,
        snapshotStorageBucket: snapshot?.storageBucket ?? null,
        snapshotStoragePath: snapshot?.storagePath ?? null,
      });
      await refresh();
      onRevisionSent?.(updated);
    } catch (sentError) {
      setError(sentError instanceof Error ? sentError.message : "Не вдалося позначити як відправлено.");
    } finally {
      setBusyId(null);
    }
  };

  const handlePreview = async (sections: ContractSection[]) => {
    try {
      await onOpenPreview(sections);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Не вдалося відкрити перегляд.");
    }
  };

  const renderListItem = (revision: ContractRevision) => {
    const expanded = expandedRevisionId === revision.id;
    const isAuthor = revision.createdByUserId === currentUserId;
    const isDraftLike = revision.status === "draft" || revision.status === "rejected";
    const canEdit = isAuthor && isDraftLike;
    const canSubmit = isAuthor && isDraftLike;
    const canCeoDecide = isCeo && revision.status === "pending_ceo";
    const canMarkSent = isAuthor && revision.status === "approved";
    const busy = busyId === revision.id;

    return (
      <Card key={revision.id} className="border-border/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-foreground">Версія v{revision.revisionNumber}</div>
              <Badge variant="outline" className={cn("rounded-full px-2 py-0 text-3xs", statusBadgeClass(revision.status))}>
                {STATUS_LABEL[revision.status]}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Створено {formatTime(revision.createdAt)}
              {revision.submittedForCeoAt ? ` • На розгляд CEO ${formatTime(revision.submittedForCeoAt)}` : ""}
              {revision.ceoReviewedAt ? ` • CEO: ${formatTime(revision.ceoReviewedAt)}` : ""}
              {revision.sentToCustomerAt ? ` • Відправлено ${formatTime(revision.sentToCustomerAt)}` : ""}
            </div>
            {revision.notesForCeo ? (
              <div className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Для CEO:</span> {revision.notesForCeo}
              </div>
            ) : null}
            {revision.ceoComment ? (
              <div className={cn("mt-2 rounded-md border px-3 py-2 text-xs", revision.status === "rejected" ? "tone-warning-subtle" : "tone-info-subtle")}>
                <span className="font-medium">Коментар CEO:</span> {revision.ceoComment}
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpandedRevisionId((current) => (current === revision.id ? null : revision.id))}
            aria-label={expanded ? "Згорнути" : "Розгорнути"}
            className="h-7 px-2"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => handlePreview(revision.sections)} disabled={busy}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Переглянути PDF
          </Button>
          {canEdit ? (
            <Button type="button" variant="outline" size="sm" onClick={() => startEditing({ kind: "edit", revision })} disabled={busy}>
              <Edit3 className="mr-1.5 h-3.5 w-3.5" />
              Редагувати
            </Button>
          ) : null}
          {canSubmit ? (
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                setBusyId(revision.id);
                try {
                  await submitRevisionForCeoApproval(revision.id);
                  await notifySubmitted(revision.revisionNumber);
                  await refresh();
                } catch (submitError) {
                  setError(submitError instanceof Error ? submitError.message : "Не вдалося надіслати на схвалення.");
                } finally {
                  setBusyId(null);
                }
              }}
              disabled={busy}
            >
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
              Надіслати CEO на схвалення
            </Button>
          ) : null}
          {canMarkSent ? (
            <Button type="button" size="sm" onClick={() => handleMarkSent(revision)} disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
              Позначити як відправлено
            </Button>
          ) : null}
        </div>

        {canCeoDecide ? (
          <div className="mt-4 rounded-lg border border-border/60 bg-muted/[0.04] p-3">
            <div className="text-sm font-semibold text-foreground">Рішення CEO</div>
            <Textarea
              value={ceoCommentDraft[revision.id] ?? ""}
              onChange={(event) => setCeoCommentDraft((prev) => ({ ...prev, [revision.id]: event.target.value }))}
              placeholder="Коментар (обов’язковий при поверненні на правки)"
              className="mt-2 min-h-[80px]"
              disabled={busy}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => handleCeoDecision(revision, "approved")} disabled={busy}>
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                Схвалити
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleCeoDecision(revision, "rejected")}
                disabled={busy || !(ceoCommentDraft[revision.id]?.trim())}
              >
                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                Повернути на правки
              </Button>
            </div>
            {!ceoCommentDraft[revision.id]?.trim() ? (
              <div className="mt-2 text-2xs text-muted-foreground">
                Коментар обов’язковий для повернення на правки; для схвалення — за бажанням.
              </div>
            ) : null}
          </div>
        ) : null}

        {expanded ? (
          (() => {
            const previousMap = buildPreviousSectionsMap(revision);
            return (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Зміст</div>
                  {previousMap ? (
                    <div className="text-2xs text-muted-foreground">
                      Жовтим виділено пункти, які відрізняються від попередньої схваленої версії.
                    </div>
                  ) : null}
                </div>
                <div className="space-y-3 rounded-lg border border-border/60 bg-muted/[0.04] p-3">
                  {revision.sections.map((section, index) => {
                    const previousBody = previousMap?.get(section.id);
                    const changed = previousMap !== null && previousBody !== section.bodyHtml;
                    const isNewSection = previousMap !== null && previousBody === undefined;
                    return (
                      <div
                        key={section.id}
                        className={cn(
                          "rounded-md border px-3 py-2 text-sm",
                          changed ? "tone-warning-subtle border" : "border-transparent"
                        )}
                      >
                        <div className="mb-1 flex items-center gap-2 font-semibold text-foreground">
                          <span>
                            {index + 1}. {section.title}
                          </span>
                          {changed ? (
                            <Badge variant="outline" className="rounded-full px-2 py-0 text-3xs tone-warning-subtle">
                              {isNewSection ? "Новий пункт" : "Змінено"}
                            </Badge>
                          ) : null}
                        </div>
                        <div
                          className="prose prose-sm max-w-none text-foreground [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1"
                          dangerouslySetInnerHTML={{ __html: section.bodyHtml }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        ) : null}
      </Card>
    );
  };

  if (loading) {
    return (
      <Card className="border-border/60 p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Завантажуємо ревізії договору...
        </div>
      </Card>
    );
  }

  const editorOpen = action !== null;

  return (
    <Card className="border-border/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-foreground">Версії договору</div>
          <div className="text-xs text-muted-foreground">
            Менеджер створює нову версію після правок замовника; CEO схвалює перед відправкою.
          </div>
        </div>
        {!editorOpen && canCreateNew ? (
          <Button
            type="button"
            size="sm"
            onClick={() =>
              startEditing({
                kind: latest ? "create_next" : "create_first",
                initialSections: latestApprovedOrSent
                  ? latestApprovedOrSent.sections
                  : initialDefaultSections,
              })
            }
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            {latest ? "Створити нову версію" : "Створити Договір (v1)"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="tone-warning-subtle mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
          <AlertCircle className="tone-text-warning mt-0.5 h-4 w-4 shrink-0" />
          <div>{error}</div>
        </div>
      ) : null}

      {editorOpen ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-muted/[0.04] p-3 text-sm">
            <div className="font-semibold text-foreground">
              {action?.kind === "edit"
                ? `Редагування v${action.revision.revisionNumber}`
                : action?.kind === "create_next"
                  ? "Нова версія договору"
                  : "Перша версія договору"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Можна редагувати пункти 1–8, додати власні пункти у кінець. Реквізити сторін і заголовок генеруються автоматично.
            </div>
          </div>

          <ContractSectionsEditor sections={editingSections} onChange={setEditingSections} disabled={busyId !== null} />

          <div>
            <div className="mb-1 text-sm font-semibold text-foreground">Коментар для CEO (опційно)</div>
            <Textarea
              value={editingNotes}
              onChange={(event) => setEditingNotes(event.target.value)}
              placeholder="Що змінено і чому. Допоможе CEO швидше схвалити."
              className="min-h-[80px]"
              disabled={busyId !== null}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={cancelEditing} disabled={busyId !== null}>
              Скасувати
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => handlePreview(editingSections)} disabled={busyId !== null}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Попередній перегляд
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => (action?.kind === "edit" ? handleUpdate({ submit: false }) : handleCreate({ submit: false }))}
              disabled={busyId !== null}
            >
              {busyId ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Зберегти чернетку
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => (action?.kind === "edit" ? handleUpdate({ submit: true }) : handleCreate({ submit: true }))}
              disabled={busyId !== null}
            >
              {busyId ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
              Зберегти й надіслати CEO
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {revisions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
              Договір ще не створено. Натисніть «Створити Договір (v1)», щоб згенерувати першу версію зі стандартного шаблону.
            </div>
          ) : (
            revisions.map(renderListItem)
          )}
        </div>
      )}
    </Card>
  );
};
