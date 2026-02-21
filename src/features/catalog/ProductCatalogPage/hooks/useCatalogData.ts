/**
 * useCatalogData Hook
 * 
 * Manages catalog data loading from Supabase including types, kinds,
 * models, methods, price tiers, and print positions
 */

import { useEffect, useMemo, useState } from "react";
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

export function useCatalogData(teamId: string | null) {
  const cacheKey = useMemo(() => (teamId ? `catalog:${teamId}` : "catalog:none"), [teamId]);
  const { cached, setCache, isStale } = usePageCache<CatalogType[]>(cacheKey);
  const [catalog, setCatalog] = useState<CatalogType[]>(cached ?? INITIAL_CATALOG);
  const [catalogLoading, setCatalogLoading] = useState(!cached);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    if (cached) {
      setCatalog(cached);
      return;
    }
    setCatalog(INITIAL_CATALOG);
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
            .select("id,kind_id,name,price,image_url")
            .eq("team_id", teamId)
            .order("name", { ascending: true }),
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

        const modelIds = (modelRows ?? []).map((row) => row.id);

        // Load related data for models
        const [
          { data: modelMethodRows, error: modelMethodError },
          { data: tierRows, error: tierError },
        ] = modelIds.length
          ? await Promise.all([
              supabase
                .schema("tosho")
                .from("catalog_model_methods")
                .select("model_id,method_id")
                .in("model_id", modelIds),
              supabase
                .schema("tosho")
                .from("catalog_price_tiers")
                .select("id,model_id,min_qty,max_qty,price")
                .in("model_id", modelIds)
                .order("min_qty", { ascending: true }),
            ])
          : [{ data: [], error: null }, { data: [], error: null }];

        if (modelMethodError) throw modelMethodError;
        if (tierError) throw tierError;

        // Build lookup maps
        const methodIdsByModel = new Map<string, string[]>();
        (modelMethodRows ?? []).forEach((row) => {
          const list = methodIdsByModel.get(row.model_id) ?? [];
          list.push(row.method_id);
          methodIdsByModel.set(row.model_id, list);
        });

        const tiersByModel = new Map<string, CatalogPriceTier[]>();
        (tierRows ?? []).forEach((row) => {
          const list = tiersByModel.get(row.model_id) ?? [];
          list.push({
            id: row.id,
            min: row.min_qty,
            max: row.max_qty,
            price: row.price,
          });
          tiersByModel.set(row.model_id, list);
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

        const modelsByKind = new Map<string, CatalogModel[]>();
        (modelRows ?? []).forEach((row) => {
          const list = modelsByKind.get(row.kind_id) ?? [];
          list.push({
            id: row.id,
            name: row.name,
            price: row.price ?? undefined,
            imageUrl: row.image_url ?? undefined,
            methodIds: methodIdsByModel.get(row.id) ?? [],
            priceTiers: tiersByModel.get(row.id),
          });
          modelsByKind.set(row.kind_id, list);
        });

        const kindsByType = new Map<string, CatalogKind[]>();
        (kindRows ?? []).forEach((row) => {
          const list = kindsByType.get(row.type_id) ?? [];
          list.push({
            id: row.id,
            name: row.name,
            models: modelsByKind.get(row.id) ?? [],
            methods: methodsByKind.get(row.id) ?? [],
            printPositions: printPositionsByKind.get(row.id) ?? [],
          });
          kindsByType.set(row.type_id, list);
        });

        const nextCatalog = (typeRows ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          quote_type: row.quote_type ?? null,
          kinds: kindsByType.get(row.id) ?? [],
        }));

        if (!cancelled) {
          setCatalog(nextCatalog);
          setCache(nextCatalog);
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

  return { catalog, setCatalog, catalogLoading, catalogError };
}
