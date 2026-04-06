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
  CatalogMethod,
  CatalogPrintPosition,
  CatalogPriceTier,
} from "@/types/catalog";
import { INITIAL_CATALOG } from "@/constants/catalog";
import { usePageCache } from "@/hooks/usePageCache";

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
  const cacheKey = useMemo(() => (teamId ? `catalog:${teamId}` : "catalog:none"), [teamId]);
  const { cached, setCache, isStale } = usePageCache<CatalogType[]>(cacheKey);
  const [catalog, setCatalog] = useState<CatalogType[]>(() =>
    cached ? normalizeCatalogModelCounts(cached) : INITIAL_CATALOG
  );
  const [catalogLoading, setCatalogLoading] = useState(!cached);
  const [catalogModelsLoading, setCatalogModelsLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
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
          configuratorPreset?: "print_package" | "print_notebook" | "print_note_blocks" | null;
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
        list.push({
          id: row.id,
          name: row.name,
          price: row.price ?? undefined,
          imageUrl: row.image_url ?? undefined,
          metadata: row.configuratorPreset ? { configuratorPreset: row.configuratorPreset } : undefined,
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
        .select("id,kind_id,name,price,image_url,configuratorPreset:metadata->>configuratorPreset")
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

      const [{ data: modelMethodRows, error: modelMethodError }] =
        await Promise.all([
          supabase.schema("tosho").from("catalog_model_methods").select("model_id,method_id").in("model_id", modelIds),
        ]);

      if (modelMethodError) throw modelMethodError;

      return {
        models: (modelRows ?? []) as Array<{
          id: string;
          kind_id: string;
          name: string;
          price: number | null;
          image_url: string | null;
          configuratorPreset?: "print_package" | "print_notebook" | "print_note_blocks" | null;
        }>,
        modelMethods: (modelMethodRows ?? []) as Array<{ model_id: string; method_id: string }>,
        tiers: [],
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
      
      try {
        // Load all data in parallel
        const [
          { data: typeRows, error: typeError },
          { data: kindRows, error: kindError },
          { data: modelRows, error: modelError },
          { data: methodRows, error: methodError },
          { data: printRows, error: printError },
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
          supabase
            .schema("tosho")
            .from("catalog_methods")
            .select("id,kind_id,name,price")
            .eq("team_id", teamId)
            .order("name", { ascending: true }),
          supabase
            .schema("tosho")
            .from("catalog_print_positions")
            .select("id,kind_id,label,sort_order")
            .order("sort_order", { ascending: true })
            .order("label", { ascending: true }),
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
          list.push({ id: row.id, name: row.name, price: row.price ?? undefined });
          methodsByKind.set(row.kind_id, list);
        });

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
    ensureKindModelsLoaded,
    ensureAllModelsLoaded,
  };
}
