import { format } from "date-fns";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateInput } from "@/components/ui/picker-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  FilePlus2,
  Mail,
  MoreHorizontal,
  FileSignature,
  Pencil,
  Phone,
  Send,
  ChevronDown,
} from "@/components/icons/appIcons";
import {
  getDocumentApprovalState,
  getSendToCustomerBlocker,
  SIGNATURE_VIA_LABELS,
  type OrderApproval,
  type SignatureVia,
} from "@/features/orders/orderApprovals";
import {
  formatShortCreatedDate,
  getDocumentActionState,
  type OrderDocumentKind,
} from "@/features/orders/orderDocumentRequirements";
import {
  CLOSING_DOCUMENT_LABELS,
  executorBadge,
  legalEntityLockReason,
  storedLegalEntityId,
  getExecutorGaps,
  type ClosingDocument,
} from "@/features/orders/orderExecutor";
import { openCustomerContractFile } from "@/features/orders/customerContractsQueries";
import type { OrderLegalEntityOption } from "@/features/orders/orderLegalEntityQueries";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { isCashlessPaymentMethod, PAYMENT_METHOD_LABELS } from "@/features/orders/paymentRules";
import { formatTelegramHandle } from "@/lib/telegramContact";
import { cn } from "@/lib/utils";

import { CustomerContractEntry } from "./CustomerContractDialog";
import { InfoHint, RequirementList } from "./OrderHints";

export type OrderDocumentAction = { kind: OrderDocumentKind } & ReturnType<typeof getDocumentActionState>;

export type OrderApprovalHandlers = {
  busy: string | null;
  onRequestApproval: (kind: "contract" | "specification") => void;
  onWithdraw: (approval: OrderApproval) => void;
  /** `signedOn` — yyyy-MM-dd, день підпису; без нього — сьогодні. */
  onSign: (kind: "contract" | "specification", via: SignatureVia | null, signedOn?: string) => void;
};

const SIGN_OPTIONS: SignatureVia[] = ["paper", "vchasno", "medoc"];

/**
 * «Позначити підписаним»: як підписали і коли (REQ-322#p27). Документ часто
 * підписують раніше, ніж менеджер ставить позначку, а від дати підпису СП
 * рахуються терміни — тож день обирається, за замовчуванням сьогодні. Той самий
 * поповер правив дату вже поставленої позначки.
 */
function SignPopover({
  trigger,
  initialVia,
  initialAt,
  disabled,
  onSign,
}: {
  trigger: ReactNode;
  initialVia: SignatureVia | null;
  initialAt: string | null;
  disabled: boolean;
  onSign: (via: SignatureVia, signedOn: string) => void;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [open, setOpen] = useState(false);
  const [via, setVia] = useState<SignatureVia>(initialVia ?? "paper");
  const [day, setDay] = useState(today);
  const invalid = !day || day > today;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setVia(initialVia ?? "paper");
          setDay(initialAt ? format(new Date(initialAt), "yyyy-MM-dd") : today);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Як підписали</div>
          <div className="flex flex-wrap gap-1.5">
            {SIGN_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                size="xs"
                variant={via === option ? "primary" : "outline"}
                aria-pressed={via === option}
                onClick={() => setVia(option)}
              >
                {SIGNATURE_VIA_LABELS[option]}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="order-sign-date" className="text-xs font-medium text-muted-foreground">
            Дата підпису
          </label>
          <DateInput id="order-sign-date" controlSize="sm" value={day} max={today} onChange={(event) => setDay(event.target.value)} />
          {day > today ? <div className="tone-text-warning text-2xs">Дата підпису не може бути в майбутньому</div> : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" size="xs" variant="ghost" onClick={() => setOpen(false)}>
            Скасувати
          </Button>
          <Button
            type="button"
            size="xs"
            disabled={invalid}
            onClick={() => {
              setOpen(false);
              onSign(via, day);
            }}
          >
            Позначити
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type OrderIssuerHandlers = {
  options: OrderLegalEntityOption[];
  busy: boolean;
  onChangeEntity: (option: OrderLegalEntityOption) => void;
  onChangeClosingDocument: (value: ClosingDocument) => void;
};

/**
 * Від кого документи (ТОВ з ПДВ чи ФОП без ПДВ) і чим закриваємо — ВН чи акт
 * (REQ-322#p1, p3). Лише безготівка: на готівці документів немає.
 */
function IssuerLine({ record, issuer }: { record: DerivedOrderRecord; issuer: OrderIssuerHandlers }) {
  const gaps = getExecutorGaps(record.executor);
  const lockReason = legalEntityLockReason(record);
  const closing = record.closingDocument;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/40 px-4 py-2 text-xs">
      <span className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Від кого</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost" className="gap-1 font-medium" disabled={issuer.busy || issuer.options.length === 0 || Boolean(lockReason)}
              title={lockReason ?? undefined}
            >
              {executorBadge(record.executor)}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {issuer.options.map((option) => (
              <DropdownMenuItem
                key={option.row.id}
                onSelect={() => {
                  if (storedLegalEntityId(option) !== (record.ourLegalEntityId ?? null)) issuer.onChangeEntity(option);
                }}
              >
                {executorBadge(option.executor)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Закриваємо</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost" className="gap-1 font-medium" disabled={issuer.busy}>
              {closing ? CLOSING_DOCUMENT_LABELS[closing] : "Не обрано"}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.keys(CLOSING_DOCUMENT_LABELS) as ClosingDocument[]).map((value) => (
              <DropdownMenuItem key={value} onSelect={() => issuer.onChangeClosingDocument(value)}>
                {CLOSING_DOCUMENT_LABELS[value]}
                <span className="ml-2 text-muted-foreground">{value === "act" ? "за послуги" : "за товар, у BAS"}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      {gaps.length > 0 ? (
        <span className="tone-text-warning">
          У довіднику юросіб бракує: {gaps.join(", ")} — Фінанси → Налаштування
        </span>
      ) : null}
    </div>
  );
}

/**
 * Під договором і СП — погодження (p6) і підпис (p7): «На погодження», «На
 * погодженні», «Погоджено» з позначкою підпису, «Підписано … ». Лише безготівка
 * і лише створений документ — до того рядка тут нема чого показувати.
 */
function ApprovalLine({
  record,
  kind,
  approvals,
}: {
  record: DerivedOrderRecord;
  kind: "contract" | "specification";
  approvals: OrderApprovalHandlers;
}) {
  const { state, approval } = getDocumentApprovalState(record, kind);
  const signedAt = kind === "contract" ? record.contractSignedAt : record.specificationSignedAt;
  const signedVia = kind === "contract" ? record.contractSignedVia : record.specificationSignedVia;
  const created = kind === "contract" ? record.contractCreatedAt : record.specificationCreatedAt;
  if (!isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail) || !created) return null;
  const busy = approvals.busy !== null;
  const signLabel = kind === "contract" ? "Підписано обома сторонами" : "Підписано замовником";

  if (signedAt) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs">
        <span className="tone-text-success inline-flex items-center gap-1 font-medium">
          <CheckCircle2 className="h-3 w-3" />
          {signLabel}
          {signedVia ? ` ${SIGNATURE_VIA_LABELS[signedVia]}` : ""} ·
        </span>
        <SignPopover
          initialVia={signedVia}
          initialAt={signedAt}
          disabled={busy}
          onSign={(via, day) => approvals.onSign(kind, via, day)}
          trigger={
            <button
              type="button"
              title="Змінити дату підпису"
              className="tone-text-success -ml-1 font-medium underline decoration-dotted underline-offset-4 hover:opacity-80"
            >
              {formatShortCreatedDate(signedAt)}
            </button>
          }
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => approvals.onSign(kind, null)}
          className="text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
        >
          Зняти позначку
        </button>
      </div>
    );
  }

  const signMenu = (
    <SignPopover
      initialVia={null}
      initialAt={null}
      disabled={busy}
      onSign={(via, day) => approvals.onSign(kind, via, day)}
      trigger={
        <Button size="xs" variant="outline" disabled={busy}>
          <FileSignature />
          Позначити підписаним
        </Button>
      }
    />
  );

  if (state === "approved" || state === "notRequired") {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
        {state === "approved" ? (
          <span className="tone-text-success inline-flex items-center gap-1 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            Погоджено{approval?.decidedAt ? ` · ${formatShortCreatedDate(approval.decidedAt)}` : ""}
          </span>
        ) : null}
        <span>{kind === "contract" ? "Чекаємо підпис обох сторін" : "Чекаємо підпис замовника"}</span>
        {signMenu}
      </div>
    );
  }

  if (state === "pending") {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs">
        <span className="inline-flex items-center gap-1 font-medium tone-text-info">
          <Clock className="h-3 w-3" />
          На погодженні в бухгалтерії — надіслати замовнику можна після рішення
        </span>
        {approval ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => approvals.onWithdraw(approval)}
            className="text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            Відкликати
          </button>
        ) : null}
      </div>
    );
  }

  const reason =
    state === "returned"
      ? `Повернули: ${approval?.decisionNote ?? "без коментаря"}`
      : state === "stale"
        ? "Змінився після погодження — погодьте ще раз"
        : "Не погоджено — замовнику ще не надсилати";
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs">
      <span className={cn(state === "returned" ? "tone-text-warning font-medium" : "text-muted-foreground")}>{reason}</span>
      <Button size="xs" variant="outline" disabled={busy} onClick={() => approvals.onRequestApproval(kind)}>
        На погодження
      </Button>
    </div>
  );
}

/**
 * «Документи замовнику» + «Внутрішні» (макет Main / Cash). На готівці замість
 * документів одне речення; старий договір чи рахунок, якщо вже є, лишається
 * видно, щоб його можна було відкрити.
 */
function DocumentRow({
  record,
  document,
  onAction,
  onParams,
  onFixRequisites,
  approvals,
  contractEntry,
}: {
  record: DerivedOrderRecord;
  document: OrderDocumentAction;
  onAction: (kind: OrderDocumentKind) => void;
  onParams: (kind: OrderDocumentKind) => void;
  onFixRequisites: (() => void) | null;
  approvals: OrderApprovalHandlers;
  /** «Внести підписаний договір» під рядком договору (REQ-322#p39). */
  contractEntry: ReactNode;
}) {
  // Договір поза CRM (p39) — це файл, а не документ, який CRM друкує: «Відкрити» показує скан.
  const externalFile = document.kind === "contract" ? (record.externalContract?.filePath ?? null) : null;
  const openDocument = (kind: OrderDocumentKind) =>
    externalFile
      ? void openCustomerContractFile(externalFile).catch((error: unknown) =>
          toast.error(error instanceof Error ? error.message : "Не вдалося відкрити файл договору.")
        )
      : onAction(kind);
  const isCreated = document.actionMode === "open" && Boolean(document.createdDateLabel);
  // Уже створений документ можна перестворити з іншими параметрами — і договір, і СП.
  const canEditParams =
    (document.kind === "contract" && Boolean(record.contractCreatedAt) && !externalFile) ||
    (document.kind === "specification" && Boolean(record.specificationCreatedAt));
  const StatusIcon =
    document.actionMode === "blocked"
      ? AlertTriangle
      : document.actionMode === "open"
        ? CheckCircle2
        : document.actionMode === "pending"
          ? Clock
          : Circle;
  const statusIconTone =
    document.actionMode === "blocked"
      ? "tone-text-warning"
      : document.actionMode === "open"
        ? "tone-text-success"
        : document.actionMode === "pending"
          ? "tone-text-info"
          : "text-muted-foreground/70";
  // Договір підписується раз на замовника — на наступних замовленнях він
  // успадковується, і це має бути видно, щоб ніхто не шукав «другий договір».
  const inheritedContractLabel =
    document.kind === "contract" && record.inheritedContractOrderNumber
      ? `Успадковано з ${record.inheritedContractOrderNumber}`
      : null;
  const secondaryText =
    inheritedContractLabel ??
    document.detail ??
    (document.actionMode === "open"
      ? isCreated
        ? `Створено · ${document.createdDateLabel}`
        : document.statusLabel
      : document.actionMode === "create"
        ? "Можна створити"
        : null);

  return (
    <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/20">
      <StatusIcon className={cn("mt-0.5 h-4 w-4 shrink-0", statusIconTone)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{document.title}</span>
          <InfoHint title={`${document.title}: що перевіряється`}>
            <p className="mb-2 text-muted-foreground">{document.hint}</p>
            <RequirementList checks={document.checks} />
          </InfoHint>
        </div>
        {document.actionMode === "blocked" ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs leading-4 text-muted-foreground">
            <span>{document.blockedLabel}</span>
            {document.isRequisitesBlocker && document.kind === "contract" && onFixRequisites ? (
              <button
                type="button"
                onClick={onFixRequisites}
                className="inline-flex items-center gap-1 font-medium text-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-primary"
              >
                <Pencil className="h-3 w-3" />
                Виправити реквізити
              </button>
            ) : null}
          </div>
        ) : secondaryText ? (
          <div className="mt-0.5 text-2xs leading-4 text-muted-foreground">{secondaryText}</div>
        ) : null}
        {document.kind === "contract" || document.kind === "specification" ? (
          <ApprovalLine record={record} kind={document.kind} approvals={approvals} />
        ) : null}
        {document.kind === "contract" && contractEntry ? <div className="mt-1.5">{contractEntry}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {document.actionMode === "create" ? (
          <Button size="sm" className="gap-1 px-2.5 text-xs" onClick={() => openDocument(document.kind)}>
            <FilePlus2 className="h-3.5 w-3.5" />
            {document.createLabel ?? "Створити"}
          </Button>
        ) : document.actionMode === "open" ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 px-2 text-xs text-foreground hover:bg-muted/60"
              onClick={() => openDocument(document.kind)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Відкрити
            </Button>
            {canEditParams ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-7 shrink-0 p-0 text-muted-foreground hover:bg-muted/60"
                    aria-label={`Більше дій: ${document.title}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => onParams(document.kind)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Параметри й перестворити
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function OrderDocumentsCard({
  record,
  documentActions,
  onAction,
  onParams,
  onFixRequisites,
  onEmail,
  onTelegram,
  onViber,
  approvals,
  issuer,
  teamId,
  onContractSaved,
}: {
  record: DerivedOrderRecord;
  teamId: string | null | undefined;
  onContractSaved: () => void;
  approvals: OrderApprovalHandlers;
  issuer: OrderIssuerHandlers | null;
  documentActions: OrderDocumentAction[];
  onAction: (kind: OrderDocumentKind) => void;
  onParams: (kind: OrderDocumentKind) => void;
  onFixRequisites: (() => void) | null;
  onEmail: () => void;
  onTelegram: () => void;
  onViber: () => void;
}) {
  const cashless = isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail);
  const customerDocs = documentActions.filter((item) => item.kind !== "techCard");
  const techCard = documentActions.find((item) => item.kind === "techCard");
  const readyCount = customerDocs.filter((item) => item.actionMode === "open").length;
  const contractEntry =
    cashless && record.source === "stored" ? (
      <CustomerContractEntry record={record} teamId={teamId} onSaved={onContractSaved} />
    ) : null;
  const rowProps = { record, onAction, onParams, onFixRequisites, approvals, contractEntry };
  const sendBlocker = getSendToCustomerBlocker(record);

  return (
    <>
      <section className="rounded-xl border border-border/60 bg-card" aria-labelledby="order-docs-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 id="order-docs-heading" className="text-sm font-semibold text-foreground">
              Документи замовнику
            </h2>
            {cashless ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {readyCount} з {customerDocs.length} готові
              </span>
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground">
            {cashless
              ? `Безготівка: договір, рахунок, СП${record.closingDocument === "act" ? ", акт" : ""}`
              : `${PAYMENT_METHOD_LABELS[record.paymentMethodId] ?? "Готівка"} — не оформлюються`}
          </span>
        </div>
        {cashless && issuer ? <IssuerLine record={record} issuer={issuer} /> : null}
        {!cashless ? (
          <p className="border-t border-border/40 px-4 py-3 text-sm text-muted-foreground">
            Договору, СП, рахунку й видаткової тут немає: вони лише для безготівки.
            {customerDocs.length > 0 ? " Нижче — те, що вже оформили раніше." : ""}
          </p>
        ) : null}
        {customerDocs.length > 0 ? (
          <div className="divide-y divide-border/40 border-t border-border/40">
            {customerDocs.map((document) => (
              <DocumentRow key={document.kind} document={document} {...rowProps} />
            ))}
          </div>
        ) : null}
        {/* Написати замовнику треба й на готівці — тут єдине місце на телефоні, де це можна. */}
        <div className="flex flex-wrap items-center gap-2 rounded-b-xl border-t border-border/40 bg-muted/20 px-4 py-2.5">
          <span className="flex w-full items-baseline gap-2 sm:w-auto sm:flex-1">
            <span className="text-sm font-semibold text-foreground">
              {cashless ? "Надіслати замовнику" : "Написати замовнику"}
            </span>
            {sendBlocker ? (
              <span className="truncate text-2xs tone-text-warning">{sendBlocker}</span>
            ) : record.contactTelegram ? (
              <span className="truncate text-2xs text-muted-foreground">
                Telegram: {formatTelegramHandle(record.contactTelegram)}
              </span>
            ) : null}
          </span>
          <Button size="sm" variant="outline" onClick={onEmail} disabled={!record.contactEmail}>
            <Mail className="mr-2 h-4 w-4" />
            Email
          </Button>
          <Button size="sm" variant="outline" onClick={onTelegram}>
            <Send className="mr-2 h-4 w-4" />
            Telegram
          </Button>
          <Button size="sm" variant="outline" onClick={onViber} disabled={!record.contactPhone}>
            <Phone className="mr-2 h-4 w-4" />
            Viber
          </Button>
        </div>
      </section>

      {techCard ? (
        <section className="rounded-xl border border-border/60 bg-card" aria-label="Внутрішні документи">
          <div className="px-4 pt-3 text-3xs font-semibold uppercase tracking-caps text-muted-foreground">
            Внутрішні · для виробництва
          </div>
          <DocumentRow document={techCard} {...rowProps} />
        </section>
      ) : null}
    </>
  );
}
