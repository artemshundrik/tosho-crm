import { useMemo } from "react";
import type {
  QuoteListRow,
  QuoteSetItemRow,
  QuoteSetListRow,
  QuoteSetMembershipInfo,
} from "@/lib/toshoApi";
import { normalizeStatus } from "@/features/quotes/quotes-page/config";

type SortBy = "date" | "number" | null;
type SortOrder = "asc" | "desc";
type QuickFilter = "all" | "new" | "estimated";
type ContentView = "quotes" | "sets" | "all";
type QuoteSetKindFilter = "all" | "kp" | "set";

type UseQuotesPageViewStateParams = {
  rows: QuoteListRow[];
  search: string;
  quickFilter: QuickFilter;
  status: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
  quoteSets: QuoteSetListRow[];
  quoteSetSearch: string;
  quoteSetKindFilter: QuoteSetKindFilter;
  quickAddKindFilter: QuoteSetKindFilter;
  quickAddTargetQuote: QuoteListRow | null;
  quoteMembershipByQuoteId: Map<string, QuoteSetMembershipInfo>;
  contentView: ContentView;
  selectedIds: Set<string>;
  quoteSetDetailsTarget: QuoteSetListRow | null;
  quoteSetDetailsItems: QuoteSetItemRow[];
};

type SelectedRefSummary = {
  id: string;
  kind: "kp" | "set";
  name: string;
  selectedCount: number;
};

type SelectionContext = {
  plainCount: number;
  withAnySetCount: number;
  withKpCount: number;
  withSetCount: number;
  refs: SelectedRefSummary[];
};

export function useQuotesPageViewState(params: UseQuotesPageViewStateParams) {
  const {
    rows,
    search,
    quickFilter,
    status,
    sortBy,
    sortOrder,
    quoteSets,
    quoteSetSearch,
    quoteSetKindFilter,
    quickAddKindFilter,
    quickAddTargetQuote,
    quoteMembershipByQuoteId,
    contentView,
    selectedIds,
    quoteSetDetailsTarget,
    quoteSetDetailsItems,
  } = params;

  const hasActiveFilters = useMemo(
    () => Boolean(search.trim()) || quickFilter !== "all" || status !== "all",
    [search, quickFilter, status]
  );

  const filteredAndSortedRows = useMemo(() => {
    let filtered = [...rows];
    const q = search.trim().toLowerCase();

    if (q) {
      filtered = filtered.filter((row) => {
        const hay = [row.number, row.comment, row.title, row.customer_name, row.quote_type]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (quickFilter === "new") {
      filtered = filtered.filter((row) => normalizeStatus(row.status) === "new");
    } else if (quickFilter === "estimated") {
      filtered = filtered.filter((row) => normalizeStatus(row.status) === "estimated");
    }

    if (status && status !== "all") {
      filtered = filtered.filter((row) => normalizeStatus(row.status) === status);
    }

    if (sortBy === "date") {
      filtered.sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
      });
    } else if (sortBy === "number") {
      filtered.sort((a, b) => {
        const numA = parseInt(a.number || "0", 10);
        const numB = parseInt(b.number || "0", 10);
        return sortOrder === "asc" ? numA - numB : numB - numA;
      });
    }

    return filtered;
  }, [rows, search, quickFilter, status, sortBy, sortOrder]);

  const filteredQuoteSets = useMemo(() => {
    const q = quoteSetSearch.trim().toLowerCase();
    return quoteSets.filter((set) => {
      if (quoteSetKindFilter !== "all" && (set.kind ?? "set") !== quoteSetKindFilter) return false;
      if (!q) return true;
      const hay = [set.name, set.customer_name, set.kind].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [quoteSets, quoteSetKindFilter, quoteSetSearch]);

  const quoteSetKpCount = useMemo(
    () => filteredQuoteSets.filter((set) => (set.kind ?? "set") === "kp").length,
    [filteredQuoteSets]
  );
  const quoteSetSetCount = useMemo(
    () => filteredQuoteSets.filter((set) => (set.kind ?? "set") === "set").length,
    [filteredQuoteSets]
  );

  const quickAddAvailableSets = useMemo(() => {
    if (!quickAddTargetQuote?.customer_id) return [] as QuoteSetListRow[];
    const membership = quoteMembershipByQuoteId.get(quickAddTargetQuote.id);
    const existingSetIds = new Set((membership?.refs ?? []).map((ref) => ref.id));
    return quoteSets.filter((set) => {
      const matchesCustomer = set.customer_id === quickAddTargetQuote.customer_id;
      const matchesKind = quickAddKindFilter === "all" || (set.kind ?? "set") === quickAddKindFilter;
      const notMemberYet = !existingSetIds.has(set.id);
      return matchesCustomer && matchesKind && notMemberYet;
    });
  }, [quickAddKindFilter, quickAddTargetQuote, quoteMembershipByQuoteId, quoteSets]);

  const foundCount = contentView === "sets" ? filteredQuoteSets.length : filteredAndSortedRows.length;

  const groupedQuotesView = useMemo(() => {
    const groups = new Map<
      string,
      { id: string; name: string; kind: "set" | "kp"; rows: QuoteListRow[] }
    >();
    const ungrouped: QuoteListRow[] = [];

    filteredAndSortedRows.forEach((row) => {
      const refs = quoteMembershipByQuoteId.get(row.id)?.refs ?? [];
      if (refs.length === 0) {
        ungrouped.push(row);
        return;
      }
      refs.forEach((ref) => {
        const current = groups.get(ref.id) ?? { id: ref.id, name: ref.name, kind: ref.kind, rows: [] };
        current.rows.push(row);
        groups.set(ref.id, current);
      });
    });

    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "kp" ? -1 : 1;
      return a.name.localeCompare(b.name, "uk-UA");
    });

    return { groups: sortedGroups, ungrouped };
  }, [filteredAndSortedRows, quoteMembershipByQuoteId]);

  const groupedByStatus = useMemo(() => {
    const buckets: Record<string, QuoteListRow[]> = {
      new: [],
      estimating: [],
      estimated: [],
      awaiting_approval: [],
      approved: [],
      cancelled: [],
    };
    filteredAndSortedRows.forEach((row) => {
      const normalized = normalizeStatus(row.status);
      if (!buckets[normalized]) buckets[normalized] = [];
      buckets[normalized].push(row);
    });
    return buckets;
  }, [filteredAndSortedRows]);

  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const selectedRows = useMemo(
    () =>
      Array.from(selectedIds)
        .map((id) => rowsById.get(id))
        .filter((row): row is QuoteListRow => Boolean(row)),
    [rowsById, selectedIds]
  );
  const selectedCustomers = useMemo(() => {
    const unique = new Set<string>();
    selectedRows.forEach((row) => {
      const key = (row.customer_id ?? row.customer_name ?? "").trim().toLowerCase();
      if (key) unique.add(key);
    });
    return unique;
  }, [selectedRows]);

  const canRunGroupedActions = selectedRows.length >= 2 && selectedCustomers.size === 1;
  const bulkValidationMessage =
    selectedRows.length < 2
      ? "Оберіть щонайменше 2 прорахунки."
      : selectedCustomers.size > 1
      ? "Масові дії доступні тільки для одного замовника."
      : null;

  const addableSelectedCountForOpenSet = useMemo(() => {
    if (!quoteSetDetailsTarget) return 0;
    const existingQuoteIds = new Set(quoteSetDetailsItems.map((item) => item.quote_id));
    return selectedRows.filter(
      (row) => row.customer_id === quoteSetDetailsTarget.customer_id && !existingQuoteIds.has(row.id)
    ).length;
  }, [quoteSetDetailsItems, quoteSetDetailsTarget, selectedRows]);

  const selectionContext = useMemo<SelectionContext>(() => {
    let plainCount = 0;
    let withAnySetCount = 0;
    let withKpCount = 0;
    let withSetCount = 0;
    const refs = new Map<string, SelectedRefSummary>();

    selectedRows.forEach((row) => {
      const rowRefs = quoteMembershipByQuoteId.get(row.id)?.refs ?? [];
      if (rowRefs.length === 0) {
        plainCount += 1;
        return;
      }
      withAnySetCount += 1;
      let hasKp = false;
      let hasSet = false;
      rowRefs.forEach((ref) => {
        if (ref.kind === "kp") hasKp = true;
        if (ref.kind === "set") hasSet = true;
        const current = refs.get(ref.id);
        if (current) {
          current.selectedCount += 1;
        } else {
          refs.set(ref.id, {
            id: ref.id,
            kind: ref.kind,
            name: ref.name,
            selectedCount: 1,
          });
        }
      });
      if (hasKp) withKpCount += 1;
      if (hasSet) withSetCount += 1;
    });

    const sortedRefs = Array.from(refs.values()).sort((a, b) => {
      if (a.selectedCount !== b.selectedCount) return b.selectedCount - a.selectedCount;
      if (a.kind !== b.kind) return a.kind === "kp" ? -1 : 1;
      return a.name.localeCompare(b.name, "uk-UA");
    });

    return {
      plainCount,
      withAnySetCount,
      withKpCount,
      withSetCount,
      refs: sortedRefs,
    };
  }, [quoteMembershipByQuoteId, selectedRows]);

  return {
    addableSelectedCountForOpenSet,
    bulkValidationMessage,
    canRunGroupedActions,
    filteredAndSortedRows,
    filteredQuoteSets,
    foundCount,
    groupedByStatus,
    groupedQuotesView,
    hasActiveFilters,
    quickAddAvailableSets,
    quoteSetKpCount,
    quoteSetSetCount,
    selectionContext,
    selectedCustomers,
    selectedRows,
  };
}
