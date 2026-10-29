import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import { toneDotClass, toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_KIND_TONE,
  formatDocumentDate,
  type RegistryDocument,
} from "./documentRegistry";

/**
 * Рядок реєстру документів і його мобільна картка (макет E). Колонки: тип,
 * номер, замовник із підставою, стан трьома смужками, сума, хто відповідає, час.
 */
export type DocumentPerson = { label: string; avatarUrl: string | null };

const initials = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

const kyivTime = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kiev", hour: "2-digit", minute: "2-digit" });

export const formatDocumentTime = (doc: RegistryDocument) =>
  doc.createdAtPrecise ? kyivTime.format(new Date(doc.createdAt)) : "—";

export const formatDocumentSum = (doc: RegistryDocument) =>
  doc.total === null ? "—" : formatOrderMoney(doc.total, doc.currency);

export function DocumentKindBadge({ doc, className }: { doc: Pick<RegistryDocument, "kind">; className?: string }) {
  return (
    <Badge tone={DOCUMENT_KIND_TONE[doc.kind]} size="sm" className={cn("rounded-md", className)}>
      {DOCUMENT_KIND_LABELS[doc.kind]}
    </Badge>
  );
}

/** Смужки кроків: заповнені — кольором стану, решта сірі. */
export function DocumentStepBars({ doc, className }: { doc: RegistryDocument; className?: string }) {
  return (
    <span className={cn("flex gap-[3px]", className)} aria-hidden>
      {doc.steps.map((step) => (
        <span
          key={step.label}
          className={cn("h-1 w-[22px] rounded-full", step.done ? toneDotClass[doc.status.tone] : "bg-muted")}
        />
      ))}
    </span>
  );
}

export function DocumentStatusText({ doc }: { doc: RegistryDocument }) {
  const { tone, label, detail } = doc.status;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs">
      <span className={cn("truncate font-medium", tone === "neutral" ? "text-foreground" : toneTextClass[tone])}>
        {label}
        {detail ? <span className="font-normal text-muted-foreground"> · {detail}</span> : null}
      </span>
    </span>
  );
}

export function PersonAvatar({ person, role, size = 22 }: { person: DocumentPerson | null; role: string; size?: number }) {
  if (!person) return null;
  return (
    <span title={`${role}: ${person.label}`}>
      <AvatarBase
        src={person.avatarUrl}
        name={person.label}
        fallback={initials(person.label)}
        size={size}
        className="shrink-0 border-2 border-card"
        fallbackClassName="text-3xs font-semibold"
      />
    </span>
  );
}

function CustomerWithBasis({ doc }: { doc: RegistryDocument }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <EntityAvatar src={doc.customerLogoUrl} name={doc.customerName} fallback={initials(doc.customerName)} size={24} />
      <div className="min-w-0">
        <div className="truncate text-sm text-foreground">{doc.customerName}</div>
        <div className="truncate text-xs text-muted-foreground" title={doc.basis}>
          {doc.basis}
        </div>
      </div>
    </div>
  );
}

type RowProps = {
  doc: RegistryDocument;
  manager: DocumentPerson | null;
  accountant: DocumentPerson | null;
  selected: boolean;
  onOpen: (doc: RegistryDocument) => void;
};

export function DocumentDayRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="h-8 bg-muted/30 py-0 pl-6 text-xs font-semibold text-muted-foreground">
        {label}
      </TableCell>
    </TableRow>
  );
}

export function DocumentTableRow({ doc, manager, accountant, selected, onOpen }: RowProps) {
  return (
    <TableRow
      className={cn("relative cursor-pointer hover:bg-muted/10", selected && "bg-primary/[0.05] hover:bg-primary/[0.05]")}
      onClick={() => onOpen(doc)}
      aria-selected={selected}
    >
      <TableCell className="relative pl-6">
        {selected ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-primary" aria-hidden /> : null}
        <DocumentKindBadge doc={doc} />
      </TableCell>
      <TableCell>
        <div className="truncate font-mono text-sm font-semibold text-foreground" title={doc.number}>
          {doc.number}
        </div>
        <div className="truncate text-xs text-muted-foreground">від {formatDocumentDate(doc.documentDate)}</div>
      </TableCell>
      <TableCell>
        <CustomerWithBasis doc={doc} />
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 flex-col gap-1.5">
          <DocumentStepBars doc={doc} />
          <DocumentStatusText doc={doc} />
        </div>
      </TableCell>
      <TableCell className="figure text-right font-semibold text-foreground">{formatDocumentSum(doc)}</TableCell>
      <TableCell className="@max-4xl:pr-6">
        <span className="flex -space-x-1.5">
          <PersonAvatar person={manager} role="Менеджер" />
          <PersonAvatar person={accountant} role="Бухгалтер" />
        </span>
      </TableCell>
      <TableCell className="figure pr-6 text-right text-xs text-muted-foreground @max-4xl:hidden">{formatDocumentTime(doc)}</TableCell>
    </TableRow>
  );
}

export function DocumentMobileCard({ doc, manager, onOpen }: Pick<RowProps, "doc" | "manager" | "onOpen">) {
  return (
    <button
      type="button"
      onClick={() => onOpen(doc)}
      className="flex w-full flex-col gap-2 rounded-xl border border-border/60 bg-card p-3 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <DocumentKindBadge doc={doc} />
          <span className="truncate font-mono text-sm font-semibold text-foreground">{doc.number}</span>
        </div>
        <span className="figure shrink-0 text-sm font-semibold text-foreground">{formatDocumentSum(doc)}</span>
      </div>
      <CustomerWithBasis doc={doc} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <DocumentStepBars doc={doc} />
          <DocumentStatusText doc={doc} />
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {formatDocumentDate(doc.documentDate)}
          <PersonAvatar person={manager} role="Менеджер" size={20} />
        </span>
      </div>
    </button>
  );
}
