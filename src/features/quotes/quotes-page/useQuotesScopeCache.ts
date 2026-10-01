import { useCallback, useLayoutEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { QuoteListRow, QuoteSetMembershipInfo } from "@/lib/toshoApi";
import {
  buildScopeCacheKey,
  rememberQuotesScope,
  type QuotesScopeCacheEntry,
} from "@/features/quotes/quotes-page/quotesScopeCache";

type Params = {
  /** Що тягнемо з сервера: «active» для «Активних» і трьох їхніх підвкладок. */
  fetchStatus: string;
  /** Лише десктопна таблиця: на дошці й телефоні рядки лишаються, як були. */
  enabled: boolean;
  teamId: string;
  managerFilter: string;
  search: string;
  rowsRef: MutableRefObject<QuoteListRow[]>;
  rowsSearchTerm: string | null;
  membership: Map<string, QuoteSetMembershipInfo>;
  hasMore: boolean;
  fetchedMembershipIdsRef: MutableRefObject<Set<string>>;
  setRows: Dispatch<SetStateAction<QuoteListRow[]>>;
  setRowsSearchTerm: Dispatch<SetStateAction<string | null>>;
  setMembership: Dispatch<SetStateAction<Map<string, QuoteSetMembershipInfo>>>;
  setHasMore: Dispatch<SetStateAction<boolean>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

/**
 * Останній результат кожної вкладки таблиці в межах сторінки: повторне
 * відкриття показує його одразу, а запит оновлює тихо. Перше відкриття — порожній
 * список із `loading`, тобто скелет, а не «Немає прорахунків» і не чужі рядки.
 * Layout-ефект, щоб підміна відбулась до малювання кадру.
 *
 * Повертає `rememberScope` для `loadQuotes`: кожна успішна відповідь потрапляє в кеш.
 */
export function useQuotesScopeCache(params: Params) {
  const { fetchStatus, enabled, teamId, managerFilter, search, rowsRef, rowsSearchTerm, membership, hasMore } = params;
  const { fetchedMembershipIdsRef, setRows, setRowsSearchTerm, setMembership, setHasMore, setLoading, setError } = params;
  const cacheRef = useRef(new Map<string, QuotesScopeCacheEntry>());
  const loadedKeyRef = useRef<string | null>(null);
  const prevStatusRef = useRef(fetchStatus);
  const prevEnabledRef = useRef(enabled);

  const rememberScope = useCallback(
    (
      team: string,
      manager: string,
      query: string,
      status: string,
      rows: QuoteListRow[],
      nextMembership: Map<string, QuoteSetMembershipInfo>,
      nextHasMore: boolean
    ) => {
      const key = buildScopeCacheKey(team, manager, query, status);
      loadedKeyRef.current = key;
      rememberQuotesScope(cacheRef.current, key, {
        rows,
        membership: nextMembership,
        hasMore: nextHasMore,
        searchTerm: query.trim().toLowerCase(),
      });
    },
    []
  );

  useLayoutEffect(() => {
    const prevStatus = prevStatusRef.current;
    const wasEnabled = prevEnabledRef.current;
    prevStatusRef.current = fetchStatus;
    prevEnabledRef.current = enabled;
    if (prevStatus === fetchStatus || !enabled || !wasEnabled) return;
    const leavingKey = buildScopeCacheKey(teamId, managerFilter, search, prevStatus);
    if (loadedKeyRef.current === leavingKey) {
      rememberQuotesScope(cacheRef.current, leavingKey, {
        rows: rowsRef.current,
        membership,
        hasMore,
        searchTerm: rowsSearchTerm ?? search.trim().toLowerCase(),
      });
    }
    const nextKey = buildScopeCacheKey(teamId, managerFilter, search, fetchStatus);
    const cached = cacheRef.current.get(nextKey);
    setError(null);
    if (cached) {
      rowsRef.current = cached.rows;
      loadedKeyRef.current = nextKey;
      fetchedMembershipIdsRef.current = new Set(cached.rows.map((row) => row.id));
      setRows(cached.rows);
      setRowsSearchTerm(cached.searchTerm);
      setMembership(cached.membership);
      setHasMore(cached.hasMore);
      setLoading(false);
      return;
    }
    rowsRef.current = [];
    loadedKeyRef.current = null;
    setRows([]);
    setRowsSearchTerm(null);
    setHasMore(false);
    setLoading(true);
  }, [
    fetchStatus, enabled, teamId, managerFilter, search, rowsRef, rowsSearchTerm, membership, hasMore,
    fetchedMembershipIdsRef, setRows, setRowsSearchTerm, setMembership, setHasMore, setLoading, setError,
  ]);

  return { rememberScope };
}
