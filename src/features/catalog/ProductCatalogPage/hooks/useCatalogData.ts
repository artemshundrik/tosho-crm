/**
 * useCatalogData Hook
 * 
 * Manages catalog data loading from Supabase including types, kinds,
 * models, methods, price tiers, and print positions
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type {
  CatalogType,
  CatalogKind,
  CatalogModel,
  CatalogModelMetadata,
  CatalogMethod,
  CatalogPrintPosition,
  CatalogPriceTier,
  MethodDirectoryEntry,
} from "@/types/catalog";
import { INITIAL_CATALOG } from "@/constants/catalog";
import { usePageCache } from "@/hooks/usePageCache";
import { normalizeMethodName } from "@/lib/catalogMethodName";

type MethodRow = {
  id: string;
  kind_id: string;
  name: string;
  price: number | null;
  directory_id?: string | null;
};

/**
 * Довідник методів, зібраний із самих методів видів. Запасний шлях на випадок,
 * коли tosho.method_directory ще не приїхав у це середовище: підказки «такий
 * метод уже є» мають працювати й без нього, просто без спільних id.
 */
const deriveDirectoryFromMethods = (rows: MethodRow[]): MethodDirectoryEntry[] => {
  const byKey = new Map<string, MethodDirectoryEntry>();
  rows.forEach((row) => {
    const key = normalizeMethodName(row.name);
    if (!key) return;
    const existing = byKey.get(key);
    if (existing) {
      existing.kindCount += 1;
      return;
    }
    byKey.set(key, {
      id: row.directory_id ?? `derived:${key}`,
      name: row.name,
      active: true,
      kindCount: 1,
    });
  });
  return Array.from(byKey.values());
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};

const normalizeQuoteType = (value?: string | null): "merch" | "print" | "other" =>
  value === "merch" || value === "print" || value === "other" ? value : "other";

const normalizeCatalogModelCounts = (catalog: CatalogType[]) =>
  catalog.map((type) => ({
    ...type,
    kinds: type.kinds.map((kind) => ({
      ...kind,
      modelCount: typeof kind.modelCount === "number" ? kind.modelCount : kind.models.length,
    })),
  }));

export function useCatalogData(teamId: string | null) {
  const cacheKey = useMemo(() => (teamId ? `catalog:v2:${teamId}` : "catalog:v2:none"), [teamId]);
  const { cached, setCache, isStale } = usePageCache<CatalogType[]>(cacheKey);
  const [catalog, setCatalog] = useState<CatalogType[]>(() =>
    cached ? normalizeCatalogModelCounts(cached) : INITIAL_CATALOG
  );
  const [catalogLoading, setCatalogLoading] = useState(!cached);
  const [catalogModelsLoading, setCatalogModelsLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [methodDirectory, setMethodDirectory] = useState<MethodDirectoryEntry[]>([]);
  const loadedKindIdsRef = useRef<Set<string>>(new Set());
  const allModelsLoadedRef = useRef(false);

  const mergeModelsIntoCatalog = useCallback(
    (
      baseCatalog: CatalogType[],
      payload: {
        models: Array<{
          id: string;
          kind_id: string;
          name: string;
          price: number | null;
          image_url: string | null;
          metadata?: unknown;
        }>;
        modelMethods: Array<{ model_id: string; method_id: string }>;
        tiers: Array<{ id: string; model_id: string; min_qty: number; max_qty: number | null; price: number }>;
        targetKindIds?: Set<string> | null;
      }
    ) => {
      const methodIdsByModel = new Map<string, string[]>();
      payload.modelMethods.forEach((row) => {
        const list = methodIdsByModel.get(row.model_id) ?? [];
        list.push(row.method_id);
        methodIdsByModel.set(row.model_id, list);
      });

      const tiersByModel = new Map<string, CatalogPriceTier[]>();
      payload.tiers.forEach((row) => {
        const list = tiersByModel.get(row.model_id) ?? [];
        list.push({
          id: row.id,
          min: row.min_qty,
          max: row.max_qty,
          price: row.price,
        });
        tiersByModel.set(row.model_id, list);
      });

      const modelsByKind = new Map<string, CatalogModel[]>();
      payload.models.forEach((row) => {
        const list = modelsByKind.get(row.kind_id) ?? [];
        const metadata =
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as CatalogModelMetadata)
            : undefined;
        list.push({
          id: row.id,
          name: row.name,
          price: row.price ?? undefined,
          imageUrl: row.image_url ?? undefined,
          metadata,
          methodIds: methodIdsByModel.get(row.id) ?? [],
          priceTiers: tiersByModel.get(row.id),
        });
        modelsByKind.set(row.kind_id, list);
      });

      return baseCatalog.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => {
          if (payload.targetKindIds && !payload.targetKindIds.has(kind.id)) return kind;
          const nextModels = modelsByKind.get(kind.id) ?? [];
          return { ...kind, models: nextModels, modelCount: nextModels.length };
        }),
      }));
    },
    []
  );

  const loadModelPayload = useCallback(
    async (kindIds?: string[]) => {
      if (!teamId) return { models: [], modelMethods: [], tiers: [] };

      let modelsQuery = supabase
        .schema("tosho")
        .from("catalog_models")
        .select("id,kind_id,name,price,image_url,metadata")
        .eq("team_id", teamId)
        .order("name", { ascending: true });

      if (kindIds && kindIds.length > 0) {
        modelsQuery = modelsQuery.in("kind_id", kindIds);
      }

      const { data: modelRows, error: modelError } = await modelsQuery;
      if (modelError) throw modelError;

      const modelIds = (modelRows ?? []).map((row) => row.id);
      if (modelIds.length === 0) {
        return { models: [], modelMethods: [], tiers: [] };
      }

      // Methods + price tiers fetched in parallel, each a single batched query
      // (model_id IN [...]) — fixed query count regardless of catalog size.
      const [
        { data: modelMethodRows, error: modelMethodError },
        { data: tierRows, error: tierError },
      ] = await Promise.all([
        supabase.schema("tosho").from("catalog_model_methods").select("model_id,method_id").in("model_id", modelIds),
        supabase
          .schema("tosho")
          .from("catalog_price_tiers")
          .select("id,model_id,min_qty,max_qty,price")
          .in("model_id", modelIds),
      ]);

      if (modelMethodError) throw modelMethodError;
      if (tierError) throw tierError;

      return {
        models: (modelRows ?? []) as Array<{
          id: string;
          kind_id: string;
          name: string;
          price: number | null;
          image_url: string | null;
          metadata?: unknown;
        }>,
        modelMethods: (modelMethodRows ?? []) as Array<{ model_id: string; method_id: string }>,
        tiers: (tierRows ?? []) as Array<{
          id: string;
          model_id: string;
          min_qty: number;
          max_qty: number | null;
          price: number;
        }>,
      };
    },
    [teamId]
  );

  const ensureKindModelsLoaded = useCallback(
    async (kindId?: string | null) => {
      const normalizedKindId = (kindId ?? "").trim();
      if (!normalizedKindId || !teamId || allModelsLoadedRef.current || loadedKindIdsRef.current.has(normalizedKindId)) return;
      setCatalogModelsLoading(true);
      setCatalogError(null);
      try {
        const payload = await loadModelPayload([normalizedKindId]);
        const targetKindIds = new Set([normalizedKindId]);
        setCatalog((prev) => {
          const next = mergeModelsIntoCatalog(prev, { ...payload, targetKindIds });
          setCache(next);
          return next;
        });
        loadedKindIdsRef.current.add(normalizedKindId);
      } catch (e: unknown) {
        setCatalogError(getErrorMessage(e, "Не вдалося завантажити моделі каталогу"));
      } finally {
        setCatalogModelsLoading(false);
      }
    },
    [loadModelPayload, mergeModelsIntoCatalog, setCache, teamId]
  );

  const ensureAllModelsLoaded = useCallback(async () => {
    if (!teamId || allModelsLoadedRef.current) return;
    setCatalogModelsLoading(true);
    setCatalogError(null);
    try {
      const payload = await loadModelPayload();
      setCatalog((prev) => {
        const next = mergeModelsIntoCatalog(prev, { ...payload, targetKindIds: null });
        setCache(next);
        return next;
      });
      allModelsLoadedRef.current = true;
      const nextLoadedKindIds = new Set<string>();
      payload.models.forEach((row) => nextLoadedKindIds.add(row.kind_id));
      loadedKindIdsRef.current = nextLoadedKindIds;
    } catch (e: unknown) {
      setCatalogError(getErrorMessage(e, "Не вдалося завантажити моделі каталогу"));
    } finally {
      setCatalogModelsLoading(false);
    }
  }, [loadModelPayload, mergeModelsIntoCatalog, setCache, teamId]);

  useEffect(() => {
    if (!teamId) return;
    if (cached) {
      const normalizedCached = normalizeCatalogModelCounts(cached);
      setCatalog(normalizedCached);
      const nextLoadedKindIds = new Set<string>();
      normalizedCached.forEach((type) => {
        type.kinds.forEach((kind) => {
          if ((kind.models?.length ?? 0) > 0) {
            nextLoadedKindIds.add(kind.id);
          }
        });
      });
      loadedKindIdsRef.current = nextLoadedKindIds;
      allModelsLoadedRef.current = false;
      return;
    }
    setCatalog(INITIAL_CATALOG);
    loadedKindIdsRef.current = new Set();
    allModelsLoadedRef.current = false;
  }, [teamId, cached]);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    const stale = isStale(5 * 60 * 1000);
    const shouldLoad = !cached || stale;
    if (!shouldLoad) return;
    const isBackground = Boolean(cached);

    const loadCatalog = async () => {
      if (!isBackground) {
        setCatalogLoading(true);
      }
      setCatalogError(null);
      
      // Методи тягнемо окремою функцією: у середовищі, куди ще не приїхала
      // міграція довідника, колонки directory_id немає — тоді читаємо без неї,
      // замість того щоб завалити завантаження всього каталогу.
      const loadMethods = async () => {
        const withDirectory = await supabase
          .schema("tosho")
          .from("catalog_methods")
          .select("id,kind_id,name,price,directory_id")
          .eq("team_id", teamId)
          .order("name", { ascending: true });
        if (!withDirectory.error) {
          return { data: (withDirectory.data ?? []) as MethodRow[], error: null };
        }
        if (!/directory_id/i.test(withDirectory.error.message ?? "")) {
          return { data: [] as MethodRow[], error: withDirectory.error };
        }
        const legacy = await supabase
          .schema("tosho")
          .from("catalog_methods")
          .select("id,kind_id,name,price")
          .eq("team_id", teamId)
          .order("name", { ascending: true });
        return { data: (legacy.data ?? []) as MethodRow[], error: legacy.error };
      };

      // Довідник — не критичний для показу каталогу: якщо його немає, зберемо
      // список із самих методів.
      const loadDirectory = async () => {
        const { data, error } = await supabase
          .schema("tosho")
          .from("method_directory")
          .select("id,name,active")
          .eq("team_id", teamId)
          .order("name", { ascending: true });
        if (error) return null;
        return (data ?? []) as Array<{ id: string; name: string; active: boolean }>;
      };

      try {
        // Load all data in parallel
        const [
          { data: typeRows, error: typeError },
          { data: kindRows, error: kindError },
          { data: modelRows, error: modelError },
          { data: methodRows, error: methodError },
          { data: printRows, error: printError },
          directoryRows,
        ] = await Promise.all([
          supabase
            .schema("tosho")
            .from("catalog_types")
            .select("id,name,sort_order,quote_type")
            .eq("team_id", teamId)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          supabase
            .schema("tosho")
            .from("catalog_kinds")
            .select("id,type_id,name,sort_order")
            .eq("team_id", teamId)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          supabase
            .schema("tosho")
            .from("catalog_models")
            .select("id,kind_id")
            .eq("team_id", teamId),
          loadMethods(),
          supabase
            .schema("tosho")
            .from("catalog_print_positions")
            .select("id,kind_id,label,sort_order")
            .order("sort_order", { ascending: true })
            .order("label", { ascending: true }),
          loadDirectory(),
        ]);

        if (typeError) throw typeError;
        if (kindError) throw kindError;
        if (modelError) throw modelError;
        if (methodError) throw methodError;
        if (printError) throw printError;

        const modelCountByKind = new Map<string, number>();
        (modelRows ?? []).forEach((row) => {
          modelCountByKind.set(row.kind_id, (modelCountByKind.get(row.kind_id) ?? 0) + 1);
        });

        const methodsByKind = new Map<string, CatalogMethod[]>();
        (methodRows ?? []).forEach((row) => {
          const list = methodsByKind.get(row.kind_id) ?? [];
          list.push({
            id: row.id,
            name: row.name,
            price: row.price ?? undefined,
            directoryId: row.directory_id ?? null,
          });
          methodsByKind.set(row.kind_id, list);
        });

        const kindCountByDirectoryId = new Map<string, number>();
        (methodRows ?? []).forEach((row) => {
          if (!row.directory_id) return;
          kindCountByDirectoryId.set(
            row.directory_id,
            (kindCountByDirectoryId.get(row.directory_id) ?? 0) + 1
          );
        });

        const nextDirectory: MethodDirectoryEntry[] = directoryRows
          ? directoryRows.map((row) => ({
              id: row.id,
              name: row.name,
              active: row.active !== false,
              kindCount: kindCountByDirectoryId.get(row.id) ?? 0,
            }))
          : deriveDirectoryFromMethods(methodRows ?? []);

        const printPositionsByKind = new Map<string, CatalogPrintPosition[]>();
        (printRows ?? []).forEach((row) => {
          const list = printPositionsByKind.get(row.kind_id) ?? [];
          list.push({ id: row.id, label: row.label, sort_order: row.sort_order ?? undefined });
          printPositionsByKind.set(row.kind_id, list);
        });

        const kindsByType = new Map<string, CatalogKind[]>();
        (kindRows ?? []).forEach((row) => {
          const list = kindsByType.get(row.type_id) ?? [];
          list.push({
            id: row.id,
            name: row.name,
            modelCount: modelCountByKind.get(row.id) ?? 0,
            models: [],
            methods: methodsByKind.get(row.id) ?? [],
            printPositions: printPositionsByKind.get(row.id) ?? [],
          });
          kindsByType.set(row.type_id, list);
        });

        const nextCatalog = (typeRows ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          quote_type: normalizeQuoteType(row.quote_type),
          kinds: kindsByType.get(row.id) ?? [],
        }));

        if (!cancelled) {
          setCatalog(nextCatalog);
          setCache(nextCatalog);
          setMethodDirectory(nextDirectory);
          loadedKindIdsRef.current = new Set();
          allModelsLoadedRef.current = false;
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setCatalogError(getErrorMessage(e, "Не вдалося завантажити каталог"));
          if (!isBackground) {
            setCatalog([]);
          }
        }
      } finally {
        if (!cancelled && !isBackground) {
          setCatalogLoading(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [teamId, cached, isStale, setCache]);

  return {
    catalog,
    setCatalog,
    catalogLoading,
    catalogModelsLoading,
    catalogError,
    methodDirectory,
    setMethodDirectory,
    ensureKindModelsLoaded,
    ensureAllModelsLoaded,
  };
}
