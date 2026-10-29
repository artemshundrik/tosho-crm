import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useNavigate, useNavigationType } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { AvatarBase } from "@/components/app/avatar-kit";
import { usePageHeaderActions } from "@/components/app/usePageHeaderActions";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { ToolbarFilterSelect, ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { CustomerFilterSelect } from "@/components/customers/CustomerFilterSelect";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { ChevronLeft, ChevronRight, Files } from "@/components/icons/appIcons";
import { MobileStatusChips } from "@/components/kanban";
import { Button } from "@/components/ui/button";
import { SEGMENTED_GROUP, SEGMENTED_TRIGGER, TOOLBAR_CONTROL_ACTIVE, TOOLBAR_FILTER } from "@/components/ui/controlStyles";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { Sheet, SheetBody, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentPreview } from "@/features/documents/DocumentPreview";
import {
  DocumentDayRow,
  DocumentMobileCard,
  DocumentTableRow,
  type DocumentPerson,
} from "@/features/documents/DocumentRows";
import {
  buildDocumentRegistry,
  countFlags,
  DOCUMENT_KIND_LABELS,
  DOCUMENT_KIND_SECTION,
  filterDocuments,
  kyivIsoDay,
  type DocumentFlag,
  type DocumentKind,
  type DocumentSection,
  type RegistryDocument,
} from "@/features/documents/documentRegistry";
import type { CustomerContract } from "@/features/orders/customerContracts";
import { listCustomerContracts, openCustomerContractFile } from "@/features/orders/customerContractsQueries";
import { kyivDay } from "@/features/orders/kyivDate";
import { useOrderRecords } from "@/features/orders/order-list/useOrderRecords";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { MOBILE_CARD_LIST, MOBILE_CHIPS_ROW, MOBILE_PAGE_BODY } from "@/layout/mobileRhythm";
import type { CustomerFilterValue } from "@/lib/customerFilter";
import { shouldRestorePageUiState } from "@/lib/pageUiState";
import { canManageOrderDocuments } from "@/lib/permissions";
import { toneDotClass, toneTextClass, type Tone } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";

/**
 * Розділ «Документи» (картка 15, пункт d16; макет E на канві). Реєстр усіх
 * договорів, СП, рахунків, ВН і актів: свіжі першими за часом появи в CRM,
 * вкладки «Юридичні / Бухгалтерські», місяць за датою документа, плитки того,
 * що потребує уваги, і бічний перегляд. Менеджер бачить документи лише своїх
 * замовлень; власник, СЕО й бухгалтерія — усі.
 */
type SectionFilter = DocumentSection | "all";

type FiltersState = {
  section?: SectionFilter;
  month?: string | null;
  kind?: string;
  manager?: string;
  customer?: CustomerFilterValue | null;
  flag?: DocumentFlag | null;
  search?: string;
  cachedAt?: number;
};

const ALL = "__all__";
const TABLE_COLUMNS = 7;
const filtersKey = (teamId: string) => `documents-page-filters:${teamId}`;

function readFilters(teamId: string | null | undefined): FiltersState | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(filtersKey(teamId)) ?? "null") as FiltersState | null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const SECTIONS: { id: SectionFilter; label: string }[] = [
  { id: "all", label: "Усі" },
  { id: "legal", label: "Юридичні" },
  { id: "accounting", label: "Бухгалтерські" },
];

// short — для телефона: третина ширини не вміщає «Договори закінчуються».
const TILES: { flag: DocumentFlag; label: string; short: string; tone: Tone; hint: string }[] = [
  { flag: "unsigned", label: "Не підписано", short: "Не підписано", tone: "warning", hint: "договори й СП активних замовлень, створені до сьогодні" },
  { flag: "noClosing", label: "Без закривального", short: "Без ВН/акта", tone: "danger", hint: "відвантажено, а ВН або акта немає" },
  { flag: "expiring", label: "Договори закінчуються", short: "Закінчуються", tone: "accent", hint: "у найближчі 90 днів, без пролонгації" },
];

const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const MONTHS_GENITIVE = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];

const monthLabel = (month: string) => {
  const [year, index] = month.split("-");
  return `${MONTHS[Number(index) - 1] ?? ""} ${year}`;
};

const shiftMonth = (month: string, delta: number) => {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const dayLabel = (day: string, today: string, yesterday: string) => {
  const [year, month, date] = day.split("-");
  const base = `${Number(date)} ${MONTHS_GENITIVE[Number(month) - 1] ?? ""}${year === today.slice(0, 4) ? "" : ` ${year}`}`;
  if (day === today) return `Сьогодні · ${base}`;
  if (day === yesterday) return `Вчора · ${base}`;
  return base;
};

/**
 * Таблиці треба ~650 px поза колонкою замовника, а вбудованому перегляду ще 400:
 * разом вони вміщаються лише від 2xl. Вужче перегляд виїжджає шторкою, а нижче
 * lg (з сайдбаром це ~800 px) таблицю заміняють картки.
 */
const TABLE_MIN_WIDTH = "(min-width: 1024px)";
const INLINE_PREVIEW_MIN_WIDTH = "(min-width: 1536px)";

function useMediaMatch(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { teamId, session, userId, accessRole, jobRole } = useAuth();
  const seesAll = canManageOrderDocuments(accessRole, jobRole);
  const isNarrowViewport = useIsNarrowViewport();
  const fitsTable = useMediaMatch(TABLE_MIN_WIDTH);
  const inlinePreview = useMediaMatch(INLINE_PREVIEW_MIN_WIDTH);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { records, loading, refreshing, error } = useOrderRecords(teamId, userId);
  const today = kyivDay();
  const yesterday = kyivDay(1);

  const restored = useMemo(() => {
    const stored = readFilters(teamId);
    return shouldRestorePageUiState(navigationType, stored?.cachedAt) ? stored : null;
  }, [teamId, navigationType]);
  const [section, setSection] = useState<SectionFilter>(() => restored?.section ?? "all");
  const [month, setMonth] = useState<string | null>(() => (restored ? (restored.month ?? null) : today.slice(0, 7)));
  const [kind, setKind] = useState(() => restored?.kind ?? ALL);
  const [manager, setManager] = useState(() => restored?.manager ?? ALL);
  // Старий формат (рядок-назва) не відновлюємо: фільтр тепер — вибраний замовник.
  const [customer, setCustomer] = useState<CustomerFilterValue | null>(() =>
    restored?.customer && typeof restored.customer === "object" ? restored.customer : null
  );
  const [flag, setFlag] = useState<DocumentFlag | null>(() => restored?.flag ?? null);
  const [search, setSearch] = useState(() => restored?.search ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !teamId) return;
    try {
      sessionStorage.setItem(
        filtersKey(teamId),
        JSON.stringify({ section, month, kind, manager, customer, flag, search, cachedAt: Date.now() } satisfies FiltersState)
      );
    } catch {
      // Сховище недоступне — фільтри просто не переживуть перезавантаження.
    }
  }, [teamId, section, month, kind, manager, customer, flag, search]);

  // Договори поза CRM — для замовників, які вже є в замовленнях.
  const customerIdsKey = useMemo(
    () =>
      Array.from(new Set(records.map((record) => record.customerId).filter((id): id is string => Boolean(id))))
        .sort()
        .join(","),
    [records]
  );
  const [contracts, setContracts] = useState<CustomerContract[]>([]);
  useEffect(() => {
    if (!teamId || !customerIdsKey) return;
    let cancelled = false;
    void listCustomerContracts(teamId, customerIdsKey.split(",")).then((rows) => {
      if (!cancelled) setContracts(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [teamId, customerIdsKey]);

  // Довідник людей — для бухгалтера, який виписав рахунок (на замовленні є лише його id).
  const [people, setPeople] = useState<Map<string, DocumentPerson>>(() => new Map());
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const workspaceId = await resolveWorkspaceId(userId);
      const rows = workspaceId ? await listWorkspaceMembersForDisplay(workspaceId) : [];
      if (cancelled) return;
      setPeople(new Map(rows.map((row) => [row.userId, { label: row.label, avatarUrl: row.avatarDisplayUrl }])));
    })().catch(() => {
      // Без довідника лишаються менеджери з самого замовлення — сторінка працює.
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const resolvePerson = useCallback((id: string | null) => (id ? (people.get(id) ?? null) : null), [people]);
  const managerOf = useCallback(
    (doc: RegistryDocument): DocumentPerson | null =>
      doc.managerLabel ? { label: doc.managerLabel, avatarUrl: doc.managerAvatarUrl } : resolvePerson(doc.managerUserId),
    [resolvePerson]
  );

  const documents = useMemo(() => {
    const all = buildDocumentRegistry(records, contracts, today);
    return seesAll ? all : all.filter((doc) => doc.managerUserId === userId);
  }, [records, contracts, today, seesAll, userId]);

  const baseFilters = useMemo(
    () => ({
      section,
      month,
      kind: kind === ALL ? null : (kind as DocumentKind),
      managerUserId: manager === ALL ? null : manager,
      customer,
      flag,
      search,
    }),
    [section, month, kind, manager, customer, flag, search]
  );
  const visible = useMemo(() => filterDocuments(documents, baseFilters), [documents, baseFilters]);
  const sectionCounts = useMemo(
    () =>
      Object.fromEntries(
        SECTIONS.map((item) => [item.id, filterDocuments(documents, { ...baseFilters, section: item.id, kind: null }).length])
      ) as Record<SectionFilter, number>,
    [documents, baseFilters]
  );
  // Плитки рахують за весь час у межах вкладки: «що потребує уваги» не залежить від місяця.
  const flagCounts = useMemo(
    () => countFlags(section === "all" ? documents : documents.filter((doc) => doc.section === section)),
    [documents, section]
  );

  const managerOptions = useMemo(() => {
    const map = new Map<string, DocumentPerson>();
    for (const doc of documents) {
      if (doc.managerUserId && !map.has(doc.managerUserId)) {
        const person = managerOf(doc);
        if (person) map.set(doc.managerUserId, person);
      }
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => a.label.localeCompare(b.label, "uk"));
  }, [documents, managerOf]);
  const kindOptions = useMemo(
    () =>
      (Object.keys(DOCUMENT_KIND_LABELS) as DocumentKind[]).filter(
        (item) => section === "all" || DOCUMENT_KIND_SECTION[item] === section
      ),
    [section]
  );

  const groups = useMemo(() => {
    const result: { day: string; docs: RegistryDocument[] }[] = [];
    for (const doc of visible) {
      const day = kyivIsoDay(doc.createdAt);
      const last = result[result.length - 1];
      if (last?.day === day) last.docs.push(doc);
      else result.push({ day, docs: [doc] });
    }
    return result;
  }, [visible]);

  const selected = visible.find((doc) => doc.id === selectedId) ?? visible[0] ?? null;

  const openFile = useCallback((path: string) => {
    void openCustomerContractFile(path).catch((fileError: unknown) =>
      toast.error(fileError instanceof Error ? fileError.message : "Не вдалося відкрити файл.")
    );
  }, []);
  const openOrder = useCallback((orderId: string) => navigate(`/orders/production/${orderId}`), [navigate]);
  const openDocument = useCallback(
    (doc: RegistryDocument) => {
      setSelectedId(doc.id);
      if (!inlinePreview) setSheetOpen(true);
    },
    [inlinePreview]
  );

  const changeSection = useCallback((next: SectionFilter) => {
    setSection(next);
    // Тип з іншої вкладки дав би порожній список без видимої причини.
    setKind((current) =>
      current !== ALL && next !== "all" && DOCUMENT_KIND_SECTION[current as DocumentKind] !== next ? ALL : current
    );
  }, []);
  const resetFilters = useCallback(() => {
    setKind(ALL);
    setManager(ALL);
    setCustomer(null);
    setFlag(null);
    setSearch("");
  }, []);

  // Плитка й пошук діють за весь час, тож місяць тоді вимкнено: інакше стрілки
  // непомітно міняли б його, і після очищення пошуку раптом відкривався б інший місяць.
  const monthLocked = Boolean(flag) || Boolean(search.trim());
  const allTime = monthLocked || !month;
  const activeFilterCount =
    (kind !== ALL ? 1 : 0) + (manager !== ALL ? 1 : 0) + (customer ? 1 : 0) + (flag ? 1 : 0);

  const headerActions = useMemo(
    () => (
      <UnifiedPageToolbar
        mobileCompact
        mobileFilterCount={activeFilterCount}
        topLeft={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
              <Files className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-lg font-semibold text-foreground">Документи</div>
            <SegmentedGroup className={cn(SEGMENTED_GROUP, "max-md:hidden")} aria-label="Розділ">
              {SECTIONS.map((item) => (
                <Button
                  key={item.id}
                  variant="segmented"
                  size="xs"
                  aria-pressed={section === item.id}
                  onClick={() => changeSection(item.id)}
                  className={cn(SEGMENTED_TRIGGER, "gap-1.5")}
                >
                  {item.label}
                  <span className="figure text-muted-foreground">{sectionCounts[item.id]}</span>
                </Button>
              ))}
            </SegmentedGroup>
          </div>
        }
        search={
          <ToolbarSearch
            value={search}
            onChange={setSearch}
            placeholder="Замовлення, замовник або номер..."
            loading={(loading || refreshing) && Boolean(search)}
          />
        }
        filters={
          <>
            <div
              className={cn(
                TOOLBAR_FILTER,
                "inline-flex items-center gap-0 px-0",
                month && !allTime && TOOLBAR_CONTROL_ACTIVE,
                monthLocked && "opacity-60"
              )}
              role="group"
              aria-label="Місяць"
              title={monthLocked ? "Плитка чи пошук показують за весь час — місяць зараз не діє" : undefined}
            >
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Попередній місяць"
                className="h-full rounded-r-none"
                disabled={monthLocked}
                onClick={() => setMonth((value) => shiftMonth(value ?? today.slice(0, 7), -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button
                type="button"
                disabled={monthLocked}
                className={cn(
                  "min-w-[124px] px-1 text-center text-sm font-medium disabled:cursor-default",
                  monthLocked && "text-muted-foreground"
                )}
                title={monthLocked ? undefined : month ? "Показати за весь час" : "Показати поточний місяць"}
                onClick={() => setMonth((value) => (value ? null : today.slice(0, 7)))}
              >
                {month ? monthLabel(month) : "За весь час"}
              </button>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Наступний місяць"
                className="h-full rounded-l-none"
                disabled={monthLocked}
                onClick={() => setMonth((value) => shiftMonth(value ?? today.slice(0, 7), 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <ToolbarFilterSelect
              value={kind}
              onValueChange={setKind}
              neutralValue={ALL}
              className="sm:w-[150px]"
              options={[
                { value: ALL, label: "Усі типи" },
                ...kindOptions.map((item) => ({ value: item, label: DOCUMENT_KIND_LABELS[item] })),
              ]}
            />
            {seesAll ? (
              <ToolbarFilterSelect
                value={manager}
                onValueChange={setManager}
                neutralValue={ALL}
                className="sm:w-[170px]"
                options={[
                  { value: ALL, label: "Усі менеджери" },
                  ...managerOptions.map(([id, person]) => ({
                    value: id,
                    label: (
                      <span className="flex min-w-0 items-center gap-2">
                        <AvatarBase
                          src={person.avatarUrl}
                          name={person.label}
                          fallback={person.label.slice(0, 1)}
                          size={18}
                          className="shrink-0 border-border/60"
                          fallbackClassName="text-3xs font-semibold"
                        />
                        <span className="truncate">{person.label}</span>
                      </span>
                    ),
                  })),
                ]}
              />
            ) : null}
            <CustomerFilterSelect teamId={teamId} value={customer} onChange={setCustomer} />
          </>
        }
        meta={
          <ToolbarMeta
            count={visible.length}
            countLabel={allTime ? "за весь час" : "за місяць"}
            onReset={resetFilters}
            showReset={activeFilterCount > 0 || Boolean(search)}
          />
        }
      />
    ),
    [
      activeFilterCount,
      allTime,
      changeSection,
      customer,
      kind,
      kindOptions,
      loading,
      manager,
      managerOptions,
      month,
      monthLocked,
      refreshing,
      resetFilters,
      search,
      section,
      sectionCounts,
      seesAll,
      teamId,
      today,
      visible.length,
    ]
  );

  usePageHeaderActions(headerActions, [headerActions]);

  if (!session) return <div className="p-6 text-sm text-destructive">User not authenticated</div>;
  if (!teamId) {
    return <div className="p-6 text-sm text-muted-foreground">Немає доступної команди. Перевір членство або інвайт.</div>;
  }

  const totalForTiles = Math.max(1, section === "all" ? documents.length : documents.filter((doc) => doc.section === section).length);

  const tiles = (
    <div className="grid grid-cols-3 gap-2 md:gap-3" aria-label="Що потребує уваги">
      {TILES.map((tile) => {
        const count = flagCounts[tile.flag];
        const active = flag === tile.flag;
        return (
          <button
            key={tile.flag}
            type="button"
            aria-pressed={active}
            onClick={() => setFlag(active ? null : tile.flag)}
            className={cn(
              "flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors md:p-4",
              active ? "border-primary ring-2 ring-primary/20" : "border-border/60 hover:bg-muted/30"
            )}
          >
            <span className="truncate text-xs font-medium text-muted-foreground">
              <span className="md:hidden">{tile.short}</span>
              <span className="max-md:hidden">{tile.label}</span>
            </span>
            <span
              className={cn(
                "figure text-2xl font-semibold leading-none",
                count > 0 ? toneTextClass[tile.tone] : "text-muted-foreground"
              )}
            >
              {count}
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className={cn("block h-full rounded-full", toneDotClass[tile.tone])}
                style={{ width: `${count > 0 ? Math.max(4, Math.round((count / totalForTiles) * 100)) : 0}%` }}
              />
            </span>
            <span className="truncate text-xs text-muted-foreground max-md:hidden">{tile.hint}</span>
          </button>
        );
      })}
    </div>
  );

  const empty = (
    <div className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
      {flag ? "Тут порожньо — увага нічому не потрібна." : "Немає документів за цими фільтрами."}
    </div>
  );

  return (
    <PageCanvas>
      <PageCanvasBody className="space-y-4 py-3 pb-24 md:pb-8">
        {isNarrowViewport ? (
          <div className={cn(MOBILE_PAGE_BODY, "space-y-3")}>
            <MobileStatusChips
              chips={SECTIONS.map((item) => ({ key: item.id, label: item.label, count: sectionCounts[item.id] }))}
              activeKey={section}
              onSelect={(key) => changeSection(key as SectionFilter)}
              className={MOBILE_CHIPS_ROW}
            />
            {tiles}
          </div>
        ) : (
          <div className="px-5">{tiles}</div>
        )}

        {loading ? (
          <AppSectionLoader label="Збираємо документи..." variant="table" />
        ) : error ? (
          <div className="px-5">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          </div>
        ) : isNarrowViewport || !fitsTable ? (
          <div className={isNarrowViewport ? cn(MOBILE_PAGE_BODY, MOBILE_CARD_LIST, "pb-3") : "grid grid-cols-2 gap-2 px-5"}>
            {visible.length === 0
              ? empty
              : visible.map((doc) => (
                  <DocumentMobileCard key={doc.id} doc={doc} manager={managerOf(doc)} onOpen={openDocument} />
                ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="px-5">{empty}</div>
        ) : (
          <div className="flex min-w-0 items-start border-t border-border/60">
            {/* overflow-x-auto не ставимо: він гасить липку шапку таблиці. */}
            <div className="@container min-w-0 flex-1">
              <Table variant="list" size="sm" stickyHeader className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[112px] pl-6">Тип</TableHead>
                    <TableHead className="w-[150px]">Документ</TableHead>
                    <TableHead className="w-auto">Замовник · підстава</TableHead>
                    <TableHead className="w-[184px]">Стан</TableHead>
                    <TableHead className="w-[112px] text-right">Сума</TableHead>
                    <TableHead className="w-[64px] @max-4xl:pr-6">Відп.</TableHead>
                    <TableHead className="w-[64px] pr-6 text-right @max-4xl:hidden">Час</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => [
                    <DocumentDayRow key={`day:${group.day}`} label={dayLabel(group.day, today, yesterday)} colSpan={TABLE_COLUMNS} />,
                    ...group.docs.map((doc) => (
                      <DocumentTableRow
                        key={doc.id}
                        doc={doc}
                        manager={managerOf(doc)}
                        accountant={resolvePerson(doc.accountantUserId)}
                        selected={(inlinePreview || sheetOpen) && selected?.id === doc.id}
                        onOpen={openDocument}
                      />
                    )),
                  ])}
                </TableBody>
              </Table>
            </div>
            {inlinePreview && selected ? (
              <aside
                aria-label="Перегляд документа"
                className="sticky top-0 w-[400px] shrink-0 self-start border-l border-border/60 px-5 py-4"
              >
                <DocumentPreview
                  key={selected.id}
                  doc={selected}
                  manager={managerOf(selected)}
                  accountant={resolvePerson(selected.accountantUserId)}
                  resolvePerson={resolvePerson}
                  onOpenOrder={openOrder}
                  onOpenFile={openFile}
                />
              </aside>
            ) : null}
          </div>
        )}
      </PageCanvasBody>

      <Sheet open={sheetOpen && !inlinePreview && Boolean(selected)} onOpenChange={setSheetOpen}>
        <SheetContent dismissible className="w-full sm:max-w-[440px]">
          <SheetTitle className="sr-only">{selected ? `Документ ${selected.number}` : "Документ"}</SheetTitle>
          <SheetBody className="px-5 py-5">
            {selected ? (
              <DocumentPreview
                key={selected.id}
                doc={selected}
                manager={managerOf(selected)}
                accountant={resolvePerson(selected.accountantUserId)}
                resolvePerson={resolvePerson}
                onOpenOrder={openOrder}
                onOpenFile={openFile}
              />
            ) : null}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </PageCanvas>
  );
}
