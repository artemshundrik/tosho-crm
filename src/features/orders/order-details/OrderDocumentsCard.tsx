import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  FilePlus2,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Send,
} from "@/components/icons/appIcons";
import { getDocumentActionState, type OrderDocumentKind } from "@/features/orders/orderDocumentRequirements";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { isCashlessPaymentMethod } from "@/features/orders/paymentRules";
import { formatTelegramHandle } from "@/lib/telegramContact";
import { cn } from "@/lib/utils";

import { InfoHint, RequirementList } from "./OrderHints";

export type OrderDocumentAction = { kind: OrderDocumentKind } & ReturnType<typeof getDocumentActionState>;

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
}: {
  record: DerivedOrderRecord;
  document: OrderDocumentAction;
  onAction: (kind: OrderDocumentKind) => void;
  onParams: (kind: OrderDocumentKind) => void;
  onFixRequisites: (() => void) | null;
}) {
  const isCreated = document.actionMode === "open" && Boolean(document.createdDateLabel);
  // Уже створений документ можна перестворити з іншими параметрами — і договір, і СП.
  const canEditParams =
    (document.kind === "contract" && Boolean(record.contractCreatedAt)) ||
    (document.kind === "specification" && Boolean(record.specificationCreatedAt));
  const StatusIcon =
    document.actionMode === "blocked" ? AlertTriangle : document.actionMode === "open" ? CheckCircle2 : Circle;
  const statusIconTone =
    document.actionMode === "blocked"
      ? "tone-text-warning"
      : document.actionMode === "open"
        ? "tone-text-success"
        : "text-muted-foreground/70";
  // Договір підписується раз на замовника — на наступних замовленнях він
  // успадковується, і це має бути видно, щоб ніхто не шукав «другий договір».
  const inheritedContractLabel =
    document.kind === "contract" && record.inheritedContractOrderNumber
      ? `Успадковано з ${record.inheritedContractOrderNumber}`
      : null;
  const secondaryText =
    inheritedContractLabel ??
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
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {document.actionMode === "create" ? (
          <Button size="sm" className="gap-1 px-2.5 text-xs" onClick={() => onAction(document.kind)}>
            <FilePlus2 className="h-3.5 w-3.5" />
            Створити
          </Button>
        ) : document.actionMode === "open" ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 px-2 text-xs text-foreground hover:bg-muted/60"
              onClick={() => onAction(document.kind)}
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
}: {
  record: DerivedOrderRecord;
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
  const rowProps = { record, onAction, onParams, onFixRequisites };

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
            {cashless ? "Безготівка: договір, СП, рахунок" : "Готівка — не оформлюються"}
          </span>
        </div>
        {!cashless ? (
          <p className="border-t border-border/40 px-4 py-3 text-sm text-muted-foreground">
            Договору, СП, рахунку й видаткової на готівці немає.
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
        {cashless ? (
          <div className="flex flex-wrap items-center gap-2 rounded-b-xl border-t border-border/40 bg-muted/20 px-4 py-2.5">
            <span className="flex w-full items-baseline gap-2 sm:w-auto sm:flex-1">
              <span className="text-sm font-semibold text-foreground">Надіслати замовнику</span>
              {record.contactTelegram ? (
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
        ) : null}
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
