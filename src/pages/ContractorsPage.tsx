import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { CountBadge, ToolbarFilterSelect, ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { Button } from "@/components/ui/button";
import {
  SEGMENTED_GROUP,
  SEGMENTED_TRIGGER,
  TOOLBAR_ACTION_BUTTON,
} from "@/components/ui/controlStyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TagsInput, splitTags } from "@/components/ui/tags-input";
import { PhoneListInput } from "@/components/ui/phone-list-input";
import { formatUaPhone } from "@/components/ui/phone-input";
import { DigitsInput } from "@/components/ui/digits-input";
import { DateInput, TimeInput } from "@/components/ui/picker-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetBody,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import {
  buildReminderAtIso,
  getLocalReminderDateInputValue,
  getLocalReminderTimeInputValue,
} from "@/lib/reminderDateTime";
import {
  Building2,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  PlusCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { DeliveryPointsSection } from "@/components/customers/DeliveryPointsSection";
import {
  createEmptyCustomerDeliveryPoint,
  parseCustomerDeliveryPoints,
  serializeCustomerDeliveryPoints,
  DELIVERY_POINT_TYPE_ICONS,
  DELIVERY_POINT_TYPE_LABELS,
  type CustomerDeliveryPoint,
} from "@/lib/customerDeliveryPoints";

type ContractorRow = {
  id: string;
  team_id?: string | null;
  kind?: "contractor" | "supplier" | null;
  name?: string | null;
  services?: string | null;
  phones?: string[] | null;
  emails?: string[] | null;
  website?: string | null;
  edrpou?: string | null;
  legal_name?: string | null;
  ownership_type?: string | null;
  contact_name?: string | null;
  address?: string | null;
  /** Сирий текст доставки до міграції на `delivery_points`. Лишився в 5 записів. */
  delivery_info?: string | null;
  /** jsonb-масив у форматі `customerDeliveryPoints` — спільному із замовниками. */
  delivery_points?: unknown;
  reminder_at?: string | null;
  reminder_repeat?: string | null;
  reminder_comment?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ContractorFormState = {
  name: string;
  legalName: string;
  ownershipType: string;
  edrpou: string;
  services: string;
  phones: string[];
  emails: string;
  website: string;
  contactName: string;
  address: string;
  deliveryInfo: string;
  deliveryPoints: CustomerDeliveryPoint[];
  reminderDate: string;
  reminderTime: string;
  reminderRepeat: ContractorReminderRepeat;
  reminderComment: string;
  notes: string;
};

/** Форми власності, що реально трапляються в базі контрагентів. */
const OWNERSHIP_OPTIONS = ["ТОВ", "ТзОВ", "ФОП", "ПП", "ПрАТ", "АТ"];
const OWNERSHIP_NONE = "__none__";

const ALL_SERVICES_FILTER = "__all__";
const CONTRACTOR_COLUMNS = [
  "id",
  "team_id",
  "kind",
  "name",
  "services",
  "phones",
  "emails",
  "website",
  "edrpou",
  "legal_name",
  "ownership_type",
  "contact_name",
  "address",
  "delivery_info",
  "delivery_points",
  "reminder_at",
  "reminder_repeat",
  "reminder_comment",
  "notes",
  "created_at",
  "updated_at",
].join(",");

/** Повтор нагадування. «none» — разове, як було до появи періодичності. */
export type ContractorReminderRepeat = "none" | "weekly" | "monthly";

const CONTRACTOR_REMINDER_REPEAT_LABEL: Record<ContractorReminderRepeat, string> = {
  none: "Без повтору",
  weekly: "Щотижня",
  monthly: "Щомісяця",
};

function normalizeReminderRepeat(value?: string | null): ContractorReminderRepeat {
  return value === "weekly" || value === "monthly" ? value : "none";
}

/** Скільки послуг влазить у рядок до «+N». У базі максимум 4, тож поки не спрацьовує. */
const SERVICE_TAGS_IN_ROW = 4;

const stopRowClick = (event: { stopPropagation: () => void }) => event.stopPropagation();

/** «·» між шматками мета-рядка. */
function joinWithDots(parts: ReactNode[]) {
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? <span className="mx-1.5 opacity-50">·</span> : null}
      {part}
    </Fragment>
  ));
}

/** «НП №327», «Поштомат №7966» — згорнута точка доставки для рядка таблиці. */
function formatDeliveryPointBadge(point: CustomerDeliveryPoint) {
  const number = point.address.match(/№\s*(\d+)/)?.[1];
  if (point.type === "np_branch") return number ? `НП №${number}` : `НП, ${point.city || "відділення"}`;
  if (point.type === "np_postomat") return number ? `Поштомат №${number}` : "Поштомат НП";
  if (point.type === "np_courier") return point.city ? `Кур'єр НП, ${point.city}` : "Кур'єр НП";
  return point.city || DELIVERY_POINT_TYPE_LABELS[point.type];
}

/** Пошта й сайт одним списком: обидва — клікабельні адреси, а не текст. */
function collectContractorLinks(row: ContractorRow) {
  const website = row.website?.trim() ?? "";
  return [
    ...(row.emails ?? []).map((email) => ({ key: email, label: email, href: `mailto:${email}` })),
    ...(website
      ? [{ key: website, label: website, href: website.startsWith("http") ? website : `https://${website}` }]
      : []),
  ];
}

function MetaLink({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target={href.startsWith("mailto:") ? undefined : "_blank"}
      rel={href.startsWith("mailto:") ? undefined : "noreferrer"}
      onClick={stopRowClick}
      className="text-primary hover:underline underline-offset-2"
    >
      {label}
    </a>
  );
}

/**
 * Другий рядок під назвою: контакт, адреса, ЄДРПОУ, юрособа.
 * Ці поля потрібні, щоб упізнати контрагента, а не щоб порівнювати рядки між
 * собою, — окремі колонки лише розганяли таблицю вшир і різали кожну до
 * трьох слів. Тут вони живуть текстом і місця займають рівно стільки, скільки є.
 */
function ContractorMeta({ row }: { row: ContractorRow }) {
  const contact = splitIntoLines(row.contact_name).join(", ");
  const address = splitIntoLines(row.address).join(", ");
  const edrpou = row.edrpou?.trim() ?? "";
  const legalName = row.legal_name?.trim() ?? "";
  const links = collectContractorLinks(row);

  // Пошта підіймається в перший рядок, тільки коли адреси немає: у «Валко» й
  // «Кліше» адреси не існує взагалі, і без цього перший рядок був би з самого
  // імені, а другий — напівпорожній.
  const inlineLink = !address && links.length > 0 ? links[0] : null;
  const restLinks = inlineLink ? links.slice(1) : links;

  const primary: ReactNode[] = [
    contact || null,
    address || null,
    inlineLink ? <MetaLink key={inlineLink.key} label={inlineLink.label} href={inlineLink.href} /> : null,
  ].filter(Boolean) as ReactNode[];

  const secondary: ReactNode[] = [
    edrpou ? (
      <span key="edrpou" className="font-mono text-2xs">
        {row.ownership_type === "ФОП" ? "ІПН" : "ЄДРПОУ"} {edrpou}
      </span>
    ) : null,
    legalName || null,
    ...restLinks.map((link) => <MetaLink key={link.key} label={link.label} href={link.href} />),
  ].filter(Boolean) as ReactNode[];

  if (primary.length === 0 && secondary.length === 0) return null;

  return (
    <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
      {primary.length > 0 ? <div>{joinWithDots(primary)}</div> : null}
      {secondary.length > 0 ? <div>{joinWithDots(secondary)}</div> : null}
    </div>
  );
}

/** Послуги пілюлями — той самий вигляд, що й у формі, щоб таблиця й дровер збігались. */
function ServiceTags({ value, limit }: { value?: string | null; limit?: number }) {
  const tags = splitTags(value ?? "");
  if (tags.length === 0) return <span className="text-muted-foreground">—</span>;
  const shown = limit ? tags.slice(0, limit) : tags;
  const hidden = tags.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-2xs font-medium text-foreground"
        >
          {tag}
        </span>
      ))}
      {hidden > 0 ? <span className="self-center text-2xs text-muted-foreground">+{hidden}</span> : null}
    </div>
  );
}

/**
 * Колонка «Звʼязок»: телефони й згорнута точка доставки.
 * Телефони лишились окремою колонкою, бо саме їх шукають найчастіше, і кожен
 * має бути клікабельним. Пошта й сайт пішли в мета-рядок — по них не дзвонять.
 */
function ContactColumn({ row, points }: { row: ContractorRow; points: CustomerDeliveryPoint[] }) {
  const phones = row.phones ?? [];
  const [firstPoint, ...restPoints] = points;

  if (phones.length === 0 && !firstPoint) return <span className="text-muted-foreground">—</span>;

  const PointIcon = firstPoint ? DELIVERY_POINT_TYPE_ICONS[firstPoint.type] : null;

  return (
    <div className="flex flex-col items-start gap-1">
      {phones.map((phone) => (
        <a
          key={phone}
          href={`tel:${phone}`}
          onClick={stopRowClick}
          className="text-xs tabular-nums text-foreground hover:text-primary"
        >
          {formatUaPhone(phone)}
        </a>
      ))}
      {firstPoint && PointIcon ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-2xs text-muted-foreground">
          <PointIcon className="h-3 w-3 shrink-0" aria-hidden />
          {formatDeliveryPointBadge(firstPoint)}
          {restPoints.length > 0 ? <span className="opacity-70">+{restPoints.length}</span> : null}
        </span>
      ) : null}
    </div>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-3xs font-semibold uppercase tracking-caps-tight text-muted-foreground">{label}</div>
      <div className="mt-1 text-xs leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * Розгорнутий рядок: те, що свідомо не влізло в три колонки.
 * Показуємо лише непорожнє — інакше половина панелі була б із «Не вказано».
 * Виняток — точки доставки й реквізити: їхня відсутність сама по собі є
 * відповіддю на питання «а куди це везти» й «від кого рахунок».
 */
function ContractorDetail({
  row,
  points,
  onEdit,
  onDelete,
}: {
  row: ContractorRow;
  points: CustomerDeliveryPoint[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tags = splitTags(row.services ?? "");
  const legalName = row.legal_name?.trim() ?? "";
  const edrpou = row.edrpou?.trim() ?? "";
  const ownership = row.ownership_type?.trim() ?? "";
  const legacyDelivery = splitIntoLines(row.delivery_info);

  return (
    <div className="rounded-inner bg-muted/40 p-3.5">
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <DetailField label="Точки доставки">
          {points.length === 0 ? (
            <span className="text-muted-foreground">Не вказано</span>
          ) : (
            <div className="space-y-1.5">
              {points.map((point) => {
                const recipient = [point.contactName, formatUaPhone(point.contactPhone)].filter(Boolean).join(" · ");
                return (
                  <div key={point.id}>
                    <span className="font-medium">
                      {[point.city, point.address].filter(Boolean).join(", ") ||
                        DELIVERY_POINT_TYPE_LABELS[point.type]}
                    </span>
                    {recipient ? <span className="text-muted-foreground"> — {recipient}</span> : null}
                    {point.comment ? (
                      <div className="text-muted-foreground">{point.comment}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </DetailField>

        <DetailField label="Реквізити">
          {legalName || edrpou ? (
            <div className="space-y-0.5">
              {/* Форму власності не дублюємо: юрназву часто вписують уже разом
                  із нею — «ТОВ «Планета Прінт»», а не «Планета Прінт». */}
              {legalName ? (
                <div>{ownership && !legalName.startsWith(ownership) ? `${ownership} ${legalName}` : legalName}</div>
              ) : null}
              {edrpou ? (
                <div className="font-mono text-2xs">
                  {ownership === "ФОП" ? "ІПН" : "ЄДРПОУ"} {edrpou}
                </div>
              ) : null}
            </div>
          ) : (
            <span className="text-muted-foreground">Не вказано</span>
          )}
        </DetailField>

        {tags.length > SERVICE_TAGS_IN_ROW ? (
          <DetailField label="Усі послуги">
            <ServiceTags value={row.services} />
          </DetailField>
        ) : null}

        {row.reminder_at ? (
          <DetailField label="Нагадування">
            <div>
              {new Date(row.reminder_at).toLocaleString("uk-UA", { dateStyle: "medium", timeStyle: "short" })}
              {row.reminder_repeat && row.reminder_repeat !== "none"
                ? ` · ${CONTRACTOR_REMINDER_REPEAT_LABEL[normalizeReminderRepeat(row.reminder_repeat)]}`
                : null}
            </div>
            {row.reminder_comment ? (
              <div className="text-muted-foreground">{row.reminder_comment}</div>
            ) : null}
          </DetailField>
        ) : null}

        {legacyDelivery.length > 0 ? (
          <DetailField label="Стара нотатка про доставку">
            <div className="whitespace-pre-wrap text-muted-foreground">{legacyDelivery.join("\n")}</div>
          </DetailField>
        ) : null}

        {splitIntoLines(row.notes).length > 0 ? (
          <DetailField label="Нотатки">{renderLinkedLines(row.notes)}</DetailField>
        ) : null}
      </div>

      <div className="mt-3.5 flex justify-end gap-2 border-t border-border/40 pt-3">
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onEdit}>
          Редагувати
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Видалити
        </Button>
      </div>
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>Редагувати</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Видалити
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Одна таблиця на обидві вкладки — підрядники й постачальники відрізняються
 * лише заголовком першої колонки, а жили двома копіями тієї самої розмітки.
 *
 * Три колонки замість шести: контакт, адреса та ЄДРПОУ пішли другим рядком під
 * назву, решта — у розкриття рядка. Мобільні картки тепер теж спільні, тож
 * вкладка постачальників уперше має вигляд на телефоні.
 */
function ContractorsTable({
  rows,
  title,
  expandedId,
  onToggle,
  onEdit,
  onDelete,
}: {
  rows: ContractorRow[];
  title: string;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onEdit: (row: ContractorRow) => void;
  onDelete: (row: ContractorRow) => void;
}) {
  return (
    <>
      <div className="space-y-2.5 md:hidden">
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-inner border border-border bg-card p-3.5"
            onClick={() => onEdit(row)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium leading-snug">{row.name ?? "Без назви"}</div>
                <ContractorMeta row={row} />
              </div>
              <div className="shrink-0" onClick={stopRowClick}>
                <RowActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <ServiceTags value={row.services} />
              <ContactColumn row={row} points={parseCustomerDeliveryPoints(row.delivery_points)} />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block">
        <Table
          variant="list"
          size="md"
          stickyHeader
          // Комірка розкриття щільно тулиться до свого рядка: padding таблиці
          // (`[&_td]:py-3.5`) специфічніший за клас на самій комірці, тож
          // перебиваємо його теж із рівня таблиці, через data-атрибут.
          className="[&_td[data-slot=detail]]:pt-0 [&_td[data-slot=detail]]:pb-4"
        >
          <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-md">
            <TableRow>
              <TableHead className="w-[46%]">{title}</TableHead>
              <TableHead className="w-[26%]">Послуги</TableHead>
              <TableHead className="w-[20%]">Звʼязок</TableHead>
              <TableHead className="w-[92px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const points = parseCustomerDeliveryPoints(row.delivery_points);
              const expanded = expandedId === row.id;
              return (
                <Fragment key={row.id}>
                  <TableRow
                    className={cn("group cursor-pointer", expanded && "border-b-0")}
                    onClick={() => onToggle(row.id)}
                  >
                    <TableCell className="align-top">
                      <div className="min-w-0">
                        <div className="font-medium leading-snug">{row.name ?? "Без назви"}</div>
                        <ContractorMeta row={row} />
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <ServiceTags value={row.services} limit={SERVICE_TAGS_IN_ROW} />
                    </TableCell>
                    <TableCell className="align-top">
                      <ContactColumn row={row} points={points} />
                    </TableCell>
                    <TableCell className="align-top" onClick={stopRowClick}>
                      <div className="flex items-center justify-end gap-0.5">
                        <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <RowActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
                        </div>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={expanded ? "Згорнути рядок" : "Розгорнути рядок"}
                          onClick={() => onToggle(row.id)}
                          className="grid h-8 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                        >
                          <ChevronRight
                            className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")}
                            aria-hidden
                          />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {expanded ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell data-slot="detail" colSpan={4}>
                        <ContractorDetail
                          row={row}
                          points={points}
                          onEdit={() => onEdit(row)}
                          onDelete={() => onDelete(row)}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function normalizeKind(value?: string | null): "contractor" | "supplier" {
  return value === "supplier" ? "supplier" : "contractor";
}

const EMPTY_FORM: ContractorFormState = {
  name: "",
  legalName: "",
  ownershipType: "",
  edrpou: "",
  services: "",
  phones: [],
  emails: "",
  website: "",
  contactName: "",
  address: "",
  deliveryInfo: "",
  deliveryPoints: [],
  reminderDate: "",
  reminderTime: "",
  reminderRepeat: "none",
  reminderComment: "",
  notes: "",
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function normalizeScientificNumber(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?e[+-]?\d+$/i.test(normalized)) return normalized;

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return normalized;

  const digits = Math.round(numeric).toString();
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

function normalizeMultilineValue(value?: string | null) {
  if (!value) return "";

  return value
    .split(/\r?\n/)
    .map((part) => normalizeScientificNumber(part).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Рядок бази → стан форми.
 *
 * Тут раніше жила евристика «якщо в контакті є цифри, а в телефоні немає —
 * поля переплутані місцями, міняємо». Вона мала сенс, доки телефони лежали
 * вільним текстом. Після переїзду на `phones[]` колонка `phone` порожня в
 * усіх записах, тож умова стала завжди істинною для будь-якого контакту з
 * цифрою — і при збереженні затирала імʼя. Зловив на «Голден Арт»
 * («1.Шевчук Андрій, 2.Сергій»). Прибрано разом зі старим полем.
 */
function normalizeFormFromRow(row?: ContractorRow | null): ContractorFormState {
  return {
    name: row?.name?.trim() ?? "",
    services: row?.services?.trim() ?? "",
    legalName: row?.legal_name?.trim() ?? "",
    ownershipType: row?.ownership_type?.trim() ?? "",
    edrpou: row?.edrpou?.trim() ?? "",
    phones: row?.phones ?? [],
    emails: (row?.emails ?? []).join(", "),
    website: row?.website?.trim() ?? "",
    contactName: normalizeMultilineValue(row?.contact_name),
    address: normalizeMultilineValue(row?.address),
    deliveryInfo: normalizeMultilineValue(row?.delivery_info),
    deliveryPoints: parseCustomerDeliveryPoints(row?.delivery_points),
    reminderDate: getLocalReminderDateInputValue(row?.reminder_at),
    reminderTime: getLocalReminderTimeInputValue(row?.reminder_at),
    reminderRepeat: normalizeReminderRepeat(row?.reminder_repeat),
    reminderComment: normalizeMultilineValue(row?.reminder_comment),
    notes: normalizeMultilineValue(row?.notes),
  };
}

function splitIntoLines(value?: string | null) {
  return normalizeMultilineValue(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getLineHref(line: string) {
  const trimmed = line.trim();
  if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(trimmed)) return `mailto:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function renderLinkedLines(value?: string | null, emptyLabel = "—") {
  const lines = splitIntoLines(value);
  if (lines.length === 0) return <span className="text-muted-foreground">{emptyLabel}</span>;

  return (
    <div className="space-y-1">
      {lines.map((line, index) => {
        const href = getLineHref(line);
        return href ? (
          <a
            key={`${line}-${index}`}
            href={href}
            target={href.startsWith("mailto:") ? undefined : "_blank"}
            rel={href.startsWith("mailto:") ? undefined : "noreferrer"}
            className="block whitespace-pre-wrap break-words text-primary underline underline-offset-2"
          >
            {line}
          </a>
        ) : (
          <div key={`${line}-${index}`} className="whitespace-pre-wrap break-words">
            {line}
          </div>
        );
      })}
    </div>
  );
}

export default function ContractorsPage() {
  const { teamId, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<ContractorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [activeTab, setActiveTab] = useState<"contractors" | "suppliers">("contractors");
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState(ALL_SERVICES_FILTER);
  /** Розгорнутий рядок один: кілька відкритих деталей перетворюють таблицю на список карток. */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ContractorRow | null>(null);
  const [form, setForm] = useState<ContractorFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ContractorRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadContractors = useCallback(async (options?: { silent?: boolean }) => {
    if (!teamId) {
      setRows([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (options?.silent) setRefreshing(true);
    else setLoading(true);

    setError(null);
    setSchemaMissing(false);

    try {
      const { data, error: queryError } = await supabase
        .schema("tosho")
        .from("contractors")
        .select(CONTRACTOR_COLUMNS)
        .eq("team_id", teamId)
        .order("name", { ascending: true, nullsFirst: false });

      if (queryError) throw queryError;
      setRows((((data ?? []) as unknown) as ContractorRow[]) ?? []);
    } catch (loadError) {
      const message = getErrorMessage(loadError, "Не вдалося завантажити підрядників.");
      const normalized = message.toLowerCase();
      if (
        normalized.includes("could not find the table") ||
        normalized.includes("schema cache") ||
        normalized.includes("does not exist")
      ) {
        setSchemaMissing(true);
        setRows([]);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (authLoading) return;
    void loadContractors();
  }, [authLoading, loadContractors]);

  const serviceOptions = useMemo(() => {
    const currentKind = activeTab === "suppliers" ? "supplier" : "contractor";

    // Розбираємо на окремі теги: у базі 12 із 38 підрядників уже пишуть кілька
    // послуг через кому, і як цілий рядок вони ніколи не збігалися з фільтром.
    // Дублі гасимо без регістру, щоб «Дерево» і «дерево» не жили окремо.
    const byLower = new Map<string, string>();
    rows
      .filter((row) => normalizeKind(row.kind) === currentKind)
      .flatMap((row) => splitTags(row.services ?? ""))
      .forEach((tag) => {
        const key = tag.toLocaleLowerCase("uk");
        if (!byLower.has(key)) byLower.set(key, tag);
      });

    return Array.from(byLower.values()).sort((left, right) => left.localeCompare(right, "uk"));
  }, [activeTab, rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const currentKind = activeTab === "suppliers" ? "supplier" : "contractor";

    return rows.filter((row) => {
      if (normalizeKind(row.kind) !== currentKind) return false;
      const matchesService =
        serviceFilter === ALL_SERVICES_FILTER ||
        splitTags(row.services ?? "").some(
          (tag) => tag.toLocaleLowerCase("uk") === serviceFilter.toLocaleLowerCase("uk")
        );
      if (!matchesService) return false;
      if (!normalizedSearch) return true;

      // Точки доставки теж шукані: «327» або «Малехів» — це те, як менеджер
      // згадує контрагента, коли треба відправити посилку.
      const deliveryPoints = parseCustomerDeliveryPoints(row.delivery_points)
        .map((point) => [point.city, point.address, point.contactName, point.contactPhone].join(" "))
        .join(" ");

      const haystack = [
        row.name,
        row.services,
        row.contact_name,
        (row.phones ?? []).join(" "),
        (row.emails ?? []).join(" "),
        row.website,
        row.address,
        row.edrpou,
        row.legal_name,
        row.delivery_info,
        deliveryPoints,
        row.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [activeTab, rows, search, serviceFilter]);

  const hasActiveFilters = Boolean(search.trim()) || serviceFilter !== ALL_SERVICES_FILTER;
  const activeTabCount = filteredRows.length;
  const contractorsCount = useMemo(
    () => rows.filter((row) => normalizeKind(row.kind) === "contractor").length,
    [rows]
  );
  const suppliersCount = useMemo(
    () => rows.filter((row) => normalizeKind(row.kind) === "supplier").length,
    [rows]
  );

  const openCreate = useCallback(() => {
    setEditingRow(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((row: ContractorRow) => {
    setEditingRow(row);
    setForm(normalizeFormFromRow(row));
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch("");
    setServiceFilter(ALL_SERVICES_FILTER);
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  }, []);

  const addDeliveryPoint = useCallback(() => {
    setForm((current) => ({
      ...current,
      deliveryPoints: [
        ...current.deliveryPoints,
        { ...createEmptyCustomerDeliveryPoint(), isDefault: current.deliveryPoints.length === 0 },
      ],
    }));
  }, []);

  const removeDeliveryPoint = useCallback((index: number) => {
    setForm((current) => {
      const next = current.deliveryPoints.filter((_, i) => i !== index);
      // Якщо видалили основну точку — основною стає перша з решти.
      if (next.length > 0 && !next.some((point) => point.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return { ...current, deliveryPoints: next };
    });
  }, []);

  const updateDeliveryPoint = useCallback((index: number, patch: Partial<CustomerDeliveryPoint>) => {
    setForm((current) => ({
      ...current,
      deliveryPoints: current.deliveryPoints.map((point, i) => (i === index ? { ...point, ...patch } : point)),
    }));
  }, []);

  const setDefaultDeliveryPoint = useCallback((index: number) => {
    setForm((current) => ({
      ...current,
      deliveryPoints: current.deliveryPoints.map((point, i) => ({ ...point, isDefault: i === index })),
    }));
  }, []);

  const headerActions = useMemo(() => (
    <UnifiedPageToolbar
      topLeft={
        <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full lg:w-auto")}>
          <Button
            variant="segmented"
            size="xs"
            aria-pressed={activeTab === "contractors"}
            onClick={() => setActiveTab("contractors")}
            className={cn(SEGMENTED_TRIGGER, "gap-2")}
          >
            <Building2 className="h-4 w-4" />
            Підрядники
            <CountBadge value={contractorsCount} />
          </Button>
          <Button
            variant="segmented"
            size="xs"
            aria-pressed={activeTab === "suppliers"}
            onClick={() => setActiveTab("suppliers")}
            className={cn(SEGMENTED_TRIGGER, "gap-2")}
          >
            <Building2 className="h-4 w-4" />
            Постачальники
            <CountBadge value={suppliersCount} />
          </Button>
        </SegmentedGroup>
      }
      topRight={
        <Button
          onClick={openCreate}
          disabled={schemaMissing}
          className={cn(TOOLBAR_ACTION_BUTTON, "w-full gap-2 sm:w-auto")}
        >
          <PlusCircle className="h-4 w-4" />
          {activeTab === "contractors" ? "Новий підрядник" : "Новий постачальник"}
        </Button>
      }
      search={
        <ToolbarSearch
          value={search}
          onChange={setSearch}
          placeholder={activeTab === "contractors" ? "Пошук підрядника..." : "Пошук постачальника..."}
        />
      }
      filters={
        <ToolbarFilterSelect
          value={serviceFilter}
          onValueChange={setServiceFilter}
          neutralValue={ALL_SERVICES_FILTER}
          className="sm:w-[220px]"
          options={[
            { value: ALL_SERVICES_FILTER, label: "Всі послуги" },
            ...serviceOptions.map((service) => ({ value: service, label: service })),
          ]}
        />
      }
      meta={
        <ToolbarMeta
          count={activeTabCount}
          onReset={clearFilters}
          showReset={hasActiveFilters}
          loading={refreshing}
        />
      }
      searchClassName="xl:max-w-[420px]"
    />
  ), [activeTab, activeTabCount, clearFilters, contractorsCount, hasActiveFilters, openCreate, refreshing, schemaMissing, search, serviceFilter, serviceOptions, suppliersCount]);

  usePageHeaderActions(headerActions, [headerActions]);

  const handleSave = useCallback(async () => {
    if (!teamId) {
      setFormError("Не вдалося визначити команду.");
      return;
    }

    if (!form.name.trim()) {
      setFormError("Вкажіть назву підрядника.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      team_id: teamId,
      kind: editingRow?.id ? normalizeKind(editingRow.kind) : (activeTab === "suppliers" ? "supplier" : "contractor"),
      name: form.name.trim(),
      services: form.services.trim() || null,
      legal_name: form.legalName.trim() || null,
      ownership_type: form.ownershipType.trim() || null,
      edrpou: form.edrpou.trim() || null,
      phones: form.phones,
      emails: splitTags(form.emails),
      website: form.website.trim() || null,
      contact_name: form.contactName.trim() || null,
      address: form.address.trim() || null,
      delivery_info: form.deliveryInfo.trim() || null,
      delivery_points: serializeCustomerDeliveryPoints(form.deliveryPoints),
      reminder_at: buildReminderAtIso(form.reminderDate, form.reminderTime),
      // Періодичність без дати нагадування безглузда — прокручувати нема від чого.
      reminder_repeat:
        form.reminderRepeat === "none" || !form.reminderDate ? null : form.reminderRepeat,
      reminder_comment: form.reminderComment.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingRow?.id) {
        const { error: updateError } = await supabase
          .schema("tosho")
          .from("contractors")
          .update(payload)
          .eq("id", editingRow.id)
          .eq("team_id", teamId);

        if (updateError) throw updateError;
        toast.success("Підрядника оновлено");
      } else {
        const { error: insertError } = await supabase
          .schema("tosho")
          .from("contractors")
          .insert(payload);

        if (insertError) throw insertError;
        toast.success("Підрядника додано");
      }

      setDialogOpen(false);
      setEditingRow(null);
      setForm(EMPTY_FORM);
      await loadContractors({ silent: true });
    } catch (saveError) {
      setFormError(getErrorMessage(saveError, "Не вдалося зберегти підрядника."));
    } finally {
      setSaving(false);
    }
  }, [activeTab, editingRow, form, loadContractors, teamId]);

  const handleDelete = useCallback(async () => {
    if (!teamId || !deleteTarget?.id) return;

    setDeleteLoading(true);
    try {
      const { error: deleteError } = await supabase
        .schema("tosho")
        .from("contractors")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("team_id", teamId);

      if (deleteError) throw deleteError;

      setDeleteTarget(null);
      toast.success("Підрядника видалено");
      await loadContractors({ silent: true });
    } catch (deleteError) {
      toast.error("Не вдалося видалити підрядника", {
        description: getErrorMessage(deleteError, "Спробуйте ще раз."),
      });
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget, loadContractors, teamId]);

  if (authLoading || loading) {
    return <AppPageLoader title="Завантаження" subtitle="Готуємо підрядників і постачальників." />;
  }

  if (!teamId) {
    return <div className="p-6 text-sm text-muted-foreground">Не вдалося визначити команду для модуля підрядників.</div>;
  }

  return (
    <div className="w-full pb-20 md:pb-0 space-y-6">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "contractors" | "suppliers")}>
        <TabsContent value="contractors" className="mt-0 pt-0">
          <div className="overflow-hidden">
            {error ? (
              <div className="p-6 text-sm text-destructive">{error}</div>
            ) : schemaMissing ? (
              <div className="rounded-inner border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
                Таблиця підрядників ще не створена в Supabase. Потрібно застосувати
                {" "}
                <span className="font-medium text-foreground">scripts/contractors-schema.sql</span>
                {" "}
                і, якщо треба стартові дані,
                {" "}
                <span className="font-medium text-foreground">scripts/contractors-seed-from-xlsx.sql</span>.
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-inner border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
                {rows.length === 0
                  ? "Підрядників ще немає. Додайте першого або залийте seed у Supabase."
                  : "За цими фільтрами нічого не знайдено."}
              </div>
            ) : (
              <ContractorsTable
                rows={filteredRows}
                title="Контрагент"
                expandedId={expandedId}
                onToggle={toggleExpanded}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
              />
            )}
          </div>
        </TabsContent>
        <TabsContent value="suppliers" className="mt-0 pt-0">
          <div className="overflow-hidden">
            {error ? (
              <div className="p-6 text-sm text-destructive">{error}</div>
            ) : schemaMissing ? (
              <div className="rounded-inner border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
                Таблиця підрядників ще не створена в Supabase. Потрібно застосувати
                {" "}
                <span className="font-medium text-foreground">scripts/contractors-schema.sql</span>
                {" "}
                і, якщо треба стартові дані,
                {" "}
                <span className="font-medium text-foreground">scripts/contractors-seed-from-xlsx.sql</span>.
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-inner border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
                За цими фільтрами нічого не знайдено.
              </div>
            ) : (
              <ContractorsTable
                rows={filteredRows}
                title="Постачальник"
                expandedId={expandedId}
                onToggle={toggleExpanded}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Sheet
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingRow(null);
            setForm(EMPTY_FORM);
            setFormError(null);
          }
        }}
      >
        <SheetContent className="w-full gap-0 p-0 sm:max-w-[760px]">
          <div className="shrink-0 border-b bg-muted/20 px-6 py-4">
            <SheetHeader>
              <SheetTitle className="text-base font-medium">
              {editingRow
                ? (activeTab === "contractors" ? "Редагувати підрядника" : "Редагувати постачальника")
                : (activeTab === "contractors" ? "Новий підрядник" : "Новий постачальник")}
              </SheetTitle>
              <SheetDescription>
              Зберігається в `tosho.contractors` і доступне всій вашій команді.
              </SheetDescription>
            </SheetHeader>
          </div>

          <SheetBody className="space-y-6 px-6 py-6">

          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Назва</label>
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Наприклад, ТОВ «СВ-Друк»"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Юридична назва</label>
              <Input
                value={form.legalName}
                onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))}
                placeholder="Якщо відрізняється від назви"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Форма власності</label>
              <Select
                value={form.ownershipType || OWNERSHIP_NONE}
                onValueChange={(next) =>
                  setForm((current) => ({ ...current, ownershipType: next === OWNERSHIP_NONE ? "" : next }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Не вказано" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OWNERSHIP_NONE}>Не вказано</SelectItem>
                  {OWNERSHIP_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {form.ownershipType === "ФОП" ? "ІПН (10 цифр)" : "Код ЄДРПОУ (8 цифр)"}
              </label>
              <DigitsInput
                value={form.edrpou}
                onChange={(next) => setForm((current) => ({ ...current, edrpou: next }))}
                maxLength={form.ownershipType === "ФОП" ? 10 : 8}
                validLength={form.ownershipType === "ФОП" ? 10 : 8}
                placeholder={form.ownershipType === "ФОП" ? "10-значний ІПН" : "8-значний код"}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Телефони</label>
              <PhoneListInput
                value={form.phones}
                onValueChange={(next) => setForm((current) => ({ ...current, phones: next }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Пошта</label>
              <TagsInput
                value={form.emails}
                onValueChange={(next) => setForm((current) => ({ ...current, emails: next }))}
                options={[]}
                placeholder="info@example.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Сайт</label>
              <Input
                value={form.website}
                onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Послуги</label>
              {/* Підказує вже заведені послуги — інакше кожен вигадує своє
                  формулювання, і в базі зʼявляються «УФ-друк», «уф друк» і
                  «УФ друк» як три різні речі. Вписати нове можна завжди. */}
              <TagsInput
                value={form.services}
                onValueChange={(next) => setForm((current) => ({ ...current, services: next }))}
                options={serviceOptions}
                placeholder="УФ-друк, висічка, вишивка…"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Контактна особа</label>
              <Input
                value={form.contactName}
                onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
                placeholder="Імʼя, менеджер, представник"
              />
            </div>

            <div className="space-y-2">
              {/* Уже просто адреса: сайт і пошта мають власні поля вище. */}
              <label className="text-sm font-medium text-foreground">Адреса</label>
              <AddressAutocomplete
                as="textarea"
                value={form.address}
                onChange={(address) => setForm((current) => ({ ...current, address }))}
                placeholder="Адреса офісу або складу"
                rows={4}
              />
            </div>

            {/* Точки доставки — той самий компонент і той самий формат, що в
                картці замовника: одні відділення НП, один парсер, одна дорога
                до ТТН. Вільний текст цього не вмів: у ньому лежали місто,
                номер відділення, ЄДРПОУ й ПІБ одним рядком. */}
            <div className="sm:col-span-2">
              <DeliveryPointsSection
                points={form.deliveryPoints}
                onAdd={addDeliveryPoint}
                onRemove={removeDeliveryPoint}
                onUpdate={updateDeliveryPoint}
                onSetDefault={setDefaultDeliveryPoint}
                defaultEdrpou={form.edrpou}
              />
            </div>

            {/* Лишок міграції: показуємо тільки там, де вільний текст досі є
                (5 записів). У новому підряднику цього поля не існує взагалі. */}
            {form.deliveryInfo ? (
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Стара нотатка про доставку</label>
                <Textarea
                  value={form.deliveryInfo}
                  onChange={(event) => setForm((current) => ({ ...current, deliveryInfo: event.target.value }))}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Те, що лишилось у полі «Нова Пошта / доставка» до переїзду на точки. Перенесіть потрібне вгору
                  й очистіть.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Дата нагадування</label>
              <DateInput
                value={form.reminderDate}
                onChange={(event) => setForm((current) => ({ ...current, reminderDate: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Час нагадування</label>
              <TimeInput
                value={form.reminderTime}
                onChange={(event) => setForm((current) => ({ ...current, reminderTime: event.target.value }))}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Повторювати</label>
              {/* Сегменти, а не дропдаун: варіантів три й усі мають бути видні
                  одразу — так само, як тип відсутності в діалозі команди. */}
              <div
                role="radiogroup"
                aria-label="Періодичність нагадування"
                className="flex gap-1 rounded-xl border border-border/50 bg-muted/40 p-1 shadow-inner"
              >
                {(["none", "weekly", "monthly"] as ContractorReminderRepeat[]).map((option) => {
                  const active = form.reminderRepeat === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={!form.reminderDate}
                      onClick={() => setForm((current) => ({ ...current, reminderRepeat: option }))}
                      className={cn(
                        "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-all duration-200",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        active
                          ? "bg-background text-foreground shadow-[var(--shadow-elevated-sm)]"
                          : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                      )}
                    >
                      {option !== "none" ? <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                      {CONTRACTOR_REMINDER_REPEAT_LABEL[option]}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {!form.reminderDate
                  ? "Спершу вкажіть дату нагадування — від неї рахується повтор."
                  : form.reminderRepeat === "none"
                    ? "Нагадаємо один раз і більше не турбуватимемо."
                    : `Після кожного нагадування дата зсунеться на ${
                        form.reminderRepeat === "weekly" ? "тиждень" : "місяць"
                      } уперед — час доби збережеться.`}
              </p>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Коментар до нагадування</label>
              <Textarea
                value={form.reminderComment}
                onChange={(event) => setForm((current) => ({ ...current, reminderComment: event.target.value }))}
                placeholder="Що саме потрібно не забути"
                rows={3}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Нотатки</label>
              <Textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Будь-які додаткові умови співпраці"
                rows={4}
              />
            </div>
          </div>

          {formError ? <div className="text-sm text-destructive">{formError}</div> : null}

          </SheetBody>

          <SheetFooter className="border-t border-border/50 bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Скасувати
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingRow
                ? "Зберегти зміни"
                : (activeTab === "contractors" ? "Створити підрядника" : "Створити постачальника")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Видалити підрядника?"
        description={deleteTarget?.name ? `Запис «${deleteTarget.name}» буде видалено без можливості відновлення.` : undefined}
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        onConfirm={handleDelete}
        loading={deleteLoading}
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      />
    </div>
  );
}
