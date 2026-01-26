import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { 
  Coins, Layers, Plus, Trash2, Edit2, Search, X, AlertCircle, TrendingDown, 
  Copy, Download, Upload, Image as ImageIcon, Link2, AlertTriangle, Settings,
  FolderPlus, Tag, MapPin
} from "lucide-react";

// --- Types ---
type CatalogMethod = { id: string; name: string; price?: number };
type CatalogPriceTier = { id: string; min: number; max: number | null; price: number; };
type CatalogModel = {
  id: string;
  name: string;
  price?: number;
  priceTiers?: CatalogPriceTier[];
  methodIds?: string[];
  imageUrl?: string;
};
type CatalogPrintPosition = { id: string; label: string; sort_order?: number | null };
type CatalogKind = {
  id: string;
  name: string;
  models: CatalogModel[];
  methods: CatalogMethod[];
  printPositions: CatalogPrintPosition[];
};
type CatalogType = { id: string; name: string; quote_type?: string | null; kinds: CatalogKind[]; };

// --- Initial Data ---
const INITIAL_CATALOG: CatalogType[] = [];

// --- Helpers ---
function createLocalId() { return `${Date.now()}-${Math.floor(Math.random() * 10000)}`; }
function normalize(value: string) { return value.trim().toLowerCase(); }

function createNextTier(prevTiers: CatalogPriceTier[], basePrice: number): CatalogPriceTier {
  const last = prevTiers[prevTiers.length - 1];
  const nextMin = last ? (last.max ? last.max + 1 : last.min + 1) : 1;
  return { id: createLocalId(), min: nextMin, max: null, price: basePrice };
}

function getPriceRange(model: CatalogModel) {
  if (model.priceTiers && model.priceTiers.length > 0) {
    const prices = model.priceTiers.map((t) => t.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatPrice(min) : `${formatPrice(min)}—${formatPrice(max)}`;
  }
  return formatPrice(model.price ?? 0);
}

function formatPrice(value: number) { return value.toLocaleString("uk-UA"); }

// Validation
function validateModel(model: CatalogModel): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  if (!model.name.trim()) warnings.push("Відсутня назва моделі");
  if (!model.methodIds || model.methodIds.length === 0) warnings.push("Не вибрано жодного методу");
  
  if (model.priceTiers && model.priceTiers.length > 1) {
    for (let i = 1; i < model.priceTiers.length; i++) {
      if (model.priceTiers[i].price >= model.priceTiers[i-1].price) {
        warnings.push("Ціни тиражів повинні зменшуватись");
        break;
      }
    }
  }
  
  return { isValid: warnings.length === 0, warnings };
}

// CSV Export
function exportToCSV(catalog: CatalogType[]) {
  const rows: string[][] = [
    ['Тип', 'Вид', 'Модель', 'Ціна від', 'Ціна до', 'Методи', 'Фото URL']
  ];
  
  catalog.forEach(type => {
    type.kinds.forEach(kind => {
      kind.models.forEach(model => {
        const priceRange = getPriceRange(model);
        const methods = model.methodIds?.map(id => 
          kind.methods.find(m => m.id === id)?.name || id
        ).join(', ') || '';
        
        rows.push([
          type.name,
          kind.name,
          model.name,
          priceRange.split('—')[0] || priceRange,
          priceRange.split('—')[1] || priceRange,
          methods,
          model.imageUrl || ''
        ]);
      });
    });
  });
  
  const csv = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `catalog_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

export default function ProductCatalogPageBestVariant() {
  const [catalog, setCatalog] = useState<CatalogType[]>(INITIAL_CATALOG);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [selectedKindId, setSelectedKindId] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(false);

  const [teamId, setTeamId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("tosho.teamId");
    } catch {
      return null;
    }
  });
  const [teamLoading, setTeamLoading] = useState(!teamId);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);

  // Category Management
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryMode, setCategoryMode] = useState<"type" | "kind">("type");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newTypeQuoteType, setNewTypeQuoteType] = useState<"merch" | "print" | "other">("merch");
  const [selectedTypeForKind, setSelectedTypeForKind] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [typeQuoteTypeSaving, setTypeQuoteTypeSaving] = useState(false);
  const [typeQuoteTypeError, setTypeQuoteTypeError] = useState<string | null>(null);

  // Draft state
  const [draftTypeId, setDraftTypeId] = useState("");
  const [draftKindId, setDraftKindId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftPriceMode, setDraftPriceMode] = useState<"fixed" | "tiers">("fixed");
  const [draftFixedPrice, setDraftFixedPrice] = useState("0");
  const [draftTiers, setDraftTiers] = useState<CatalogPriceTier[]>([]);
  const [draftMethodIds, setDraftMethodIds] = useState<string[]>([]);
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [imageUploadMode, setImageUploadMode] = useState<"url" | "file">("url");
  const [newMethodName, setNewMethodName] = useState("");
  const [newMethodPrice, setNewMethodPrice] = useState("");
  const [methodSaving, setMethodSaving] = useState(false);
  const [methodError, setMethodError] = useState<string | null>(null);
  const [newPrintPositionName, setNewPrintPositionName] = useState("");
  const [printPositionSaving, setPrintPositionSaving] = useState(false);
  const [printPositionError, setPrintPositionError] = useState<string | null>(null);

  // Inline edit
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlinePrice, setInlinePrice] = useState("");

  const currencySymbol = "₴";

  useEffect(() => {
    let cancelled = false;

    const loadTeamId = async () => {
      setTeamLoading(true);
      setTeamError(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        if (!cancelled) {
          setTeamError(userError?.message ?? "User not authenticated");
          setTeamId(null);
          setTeamLoading(false);
        }
        return;
      }

      const { data, error: teamError } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!cancelled) {
        if (teamError) {
          setTeamError(teamError.message);
          setTeamId(null);
        } else {
          const nextTeamId = (data as { team_id?: string } | null)?.team_id ?? null;
          setTeamId(nextTeamId);
          try {
            if (nextTeamId) localStorage.setItem("tosho.teamId", nextTeamId);
          } catch {
            // ignore storage errors
          }
        }
        setTeamLoading(false);
      }
    };

    void loadTeamId();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;

    const loadCatalog = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const { data: typeRows, error: typeError } = await supabase
          .schema("tosho")
          .from("catalog_types")
          .select("id,name,sort_order,quote_type")
          .eq("team_id", teamId)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });
        if (typeError) throw typeError;

        const { data: kindRows, error: kindError } = await supabase
          .schema("tosho")
          .from("catalog_kinds")
          .select("id,type_id,name,sort_order")
          .eq("team_id", teamId)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });
        if (kindError) throw kindError;

        const { data: modelRows, error: modelError } = await supabase
          .schema("tosho")
          .from("catalog_models")
          .select("id,kind_id,name,price,image_url")
          .eq("team_id", teamId)
          .order("name", { ascending: true });
        if (modelError) throw modelError;

        const { data: methodRows, error: methodError } = await supabase
          .schema("tosho")
          .from("catalog_methods")
          .select("id,kind_id,name,price")
          .eq("team_id", teamId)
          .order("name", { ascending: true });
        if (methodError) throw methodError;

        const { data: printRows, error: printError } = await supabase
          .schema("tosho")
          .from("catalog_print_positions")
          .select("id,kind_id,label,sort_order")
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true });
        if (printError) throw printError;

        const modelIds = (modelRows ?? []).map((row) => row.id);

        const { data: modelMethodRows, error: modelMethodError } = modelIds.length
          ? await supabase
              .schema("tosho")
              .from("catalog_model_methods")
              .select("model_id,method_id")
              .in("model_id", modelIds)
          : { data: [], error: null };
        if (modelMethodError) throw modelMethodError;

        const { data: tierRows, error: tierError } = modelIds.length
          ? await supabase
              .schema("tosho")
              .from("catalog_price_tiers")
              .select("id,model_id,min_qty,max_qty,price")
              .in("model_id", modelIds)
              .order("min_qty", { ascending: true })
          : { data: [], error: null };
        if (tierError) throw tierError;

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
          if (nextCatalog.length > 0) {
            const nextTypeId = nextCatalog[0].id;
            const nextKindId = nextCatalog[0].kinds[0]?.id ?? "";
            setSelectedTypeId((prev) => prev || nextTypeId);
            setSelectedKindId((prev) => prev || nextKindId);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setCatalogError(e?.message ?? "Не вдалося завантажити каталог");
          setCatalog([]);
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  // --- Global Search ---
  const allModelsWithContext = useMemo(() => {
    const models: Array<{
      model: CatalogModel;
      typeId: string;
      typeName: string;
      kindId: string;
      kindName: string;
      validation: ReturnType<typeof validateModel>;
    }> = [];
    
    catalog.forEach(type => {
      type.kinds.forEach(kind => {
        kind.models.forEach(model => {
          models.push({
            model,
            typeId: type.id,
            typeName: type.name,
            kindId: kind.id,
            kindName: kind.name,
            validation: validateModel(model)
          });
        });
      });
    });
    
    return models;
  }, [catalog]);

  const filteredGlobalModels = useMemo(() => {
    let results = allModelsWithContext;
    
    if (globalSearch) {
      const query = normalize(globalSearch);
      results = results.filter(item => 
        normalize(item.model.name).includes(query) ||
        normalize(item.typeName).includes(query) ||
        normalize(item.kindName).includes(query)
      );
    }
    
    if (showOnlyIncomplete) {
      results = results.filter(item => !item.validation.isValid);
    }
    
    if (!globalSearch && selectedTypeId) {
      results = results.filter(item => item.typeId === selectedTypeId);
      if (selectedKindId) {
        results = results.filter(item => item.kindId === selectedKindId);
      }
    }
    
    return results;
  }, [allModelsWithContext, globalSearch, showOnlyIncomplete, selectedTypeId, selectedKindId]);

  const selectedType = useMemo(() => catalog.find((t) => t.id === selectedTypeId), [catalog, selectedTypeId]);
  const selectedKinds = selectedType?.kinds ?? [];
  const selectedKind = useMemo(() => selectedKinds.find((k) => k.id === selectedKindId), [selectedKinds, selectedKindId]);

  const draftType = useMemo(() => catalog.find((t) => t.id === draftTypeId), [catalog, draftTypeId]);
  const draftKinds = draftType?.kinds ?? [];
  const draftKind = useMemo(() => draftKinds.find((k) => k.id === draftKindId), [draftKinds, draftKindId]);
  const availableMethodsForDraft = draftKind?.methods ?? [];

  const totalModels = allModelsWithContext.length;
  const incompleteModels = allModelsWithContext.filter(item => !item.validation.isValid).length;

  // --- Handlers: Categories ---
  const openAddType = () => {
    setCategoryMode("type");
    setNewCategoryName("");
    setNewTypeQuoteType("merch");
    setCategoryError(null);
    setCategoryDialogOpen(true);
  };

  const openAddKind = () => {
    setCategoryMode("kind");
    setNewCategoryName("");
    setCategoryError(null);
    setSelectedTypeForKind(selectedTypeId || catalog[0]?.id || "");
    setCategoryDialogOpen(true);
  };

  const handleAddCategory = async () => {
    if (!teamId) {
      setCategoryError("Немає доступної команди. Перевір членство або інвайт.");
      return;
    }
    const name = newCategoryName.trim();
    if (!name) return;
    if (categorySaving) return;
    setCategorySaving(true);
    setCategoryError(null);

    if (categoryMode === "type") {
      const { data, error } = await supabase
        .schema("tosho")
        .from("catalog_types")
        .insert({ team_id: teamId, name, quote_type: newTypeQuoteType })
        .select("id,name,quote_type")
        .single();
      if (error || !data) {
        console.error("create type failed", error);
        setCategoryError(error?.message ?? "Не вдалося створити категорію");
        setCategorySaving(false);
        return;
      }
      const newType: CatalogType = { id: data.id, name: data.name, quote_type: data.quote_type ?? null, kinds: [] };
      setCatalog((prev) => [...prev, newType]);
      setSelectedTypeId(data.id);
    } else {
      if (!selectedTypeForKind) return;
      const { data, error } = await supabase
        .schema("tosho")
        .from("catalog_kinds")
        .insert({ team_id: teamId, type_id: selectedTypeForKind, name })
        .select("id,name,type_id")
        .single();
      if (error || !data) {
        console.error("create kind failed", error);
        setCategoryError(error?.message ?? "Не вдалося створити вид");
        setCategorySaving(false);
        return;
      }
      const newKind: CatalogKind = { id: data.id, name: data.name, models: [], methods: [], printPositions: [] };
      setCatalog((prev) =>
        prev.map((type) =>
          type.id === selectedTypeForKind ? { ...type, kinds: [...type.kinds, newKind] } : type
        )
      );
      setSelectedTypeId(selectedTypeForKind);
      setSelectedKindId(data.id);
    }

    setCategoryDialogOpen(false);
    setCategorySaving(false);
  };

  const handleQuoteTypeUpdate = async (value: "merch" | "print" | "other") => {
    if (!teamId || !selectedTypeId) return;
    if (typeQuoteTypeSaving) return;
    setTypeQuoteTypeSaving(true);
    setTypeQuoteTypeError(null);
    const { error } = await supabase
      .schema("tosho")
      .from("catalog_types")
      .update({ quote_type: value })
      .eq("id", selectedTypeId)
      .eq("team_id", teamId);
    if (error) {
      setTypeQuoteTypeError(error.message);
      setTypeQuoteTypeSaving(false);
      return;
    }
    setCatalog((prev) =>
      prev.map((type) =>
        type.id === selectedTypeId ? { ...type, quote_type: value } : type
      )
    );
    setTypeQuoteTypeSaving(false);
  };

  // --- Handlers: Navigation ---
  const handleSelectType = (typeId: string) => {
    setSelectedTypeId(typeId);
    const nextType = catalog.find((type) => type.id === typeId);
    setSelectedKindId(nextType?.kinds[0]?.id ?? "");
    setGlobalSearch("");
    setNewPrintPositionName("");
    setPrintPositionError(null);
  };

  // --- Handlers: Clone ---
  const handleCloneModel = async (modelId: string) => {
    if (!teamId) return;
    const item = allModelsWithContext.find(i => i.model.id === modelId);
    if (!item) return;
    
    const clonedModel: CatalogModel = {
      ...item.model,
      name: `${item.model.name} (копія)`,
    };

    const { data: insertModel, error: insertError } = await supabase
      .schema("tosho")
      .from("catalog_models")
      .insert({
        team_id: teamId,
        kind_id: item.kindId,
        name: clonedModel.name,
        price: clonedModel.price ?? null,
        image_url: clonedModel.imageUrl ?? null,
      })
      .select("id")
      .single();
    if (insertError || !insertModel) {
      console.error("clone model insert failed", insertError);
      return;
    }

    const newModelId = insertModel.id as string;

    if (clonedModel.priceTiers && clonedModel.priceTiers.length > 0) {
      const tierPayload = clonedModel.priceTiers.map((tier) => ({
        model_id: newModelId,
        min_qty: tier.min,
        max_qty: tier.max,
        price: tier.price,
      }));
      const { error: tierError } = await supabase
        .schema("tosho")
        .from("catalog_price_tiers")
        .insert(tierPayload);
      if (tierError) {
        console.error("clone model tiers failed", tierError);
      }
    }

    if (clonedModel.methodIds && clonedModel.methodIds.length > 0) {
      const methodPayload = clonedModel.methodIds.map((methodId) => ({
        model_id: newModelId,
        method_id: methodId,
      }));
      const { error: methodError } = await supabase
        .schema("tosho")
        .from("catalog_model_methods")
        .insert(methodPayload);
      if (methodError) {
        console.error("clone model methods failed", methodError);
      }
    }

    const nextModel = { ...clonedModel, id: newModelId };
    setCatalog((prev) =>
      prev.map((type) => {
        if (type.id !== item.typeId) return type;
        return {
          ...type,
          kinds: type.kinds.map((kind) => {
            if (kind.id !== item.kindId) return kind;
            return { ...kind, models: [...kind.models, nextModel] };
          }),
        };
      })
    );
  };

  // --- Handlers: Inline Edit ---
  const startInlineEdit = (modelId: string, currentPrice: number) => {
    setInlineEditId(modelId);
    setInlinePrice(String(currentPrice));
  };

  const saveInlineEdit = async () => {
    if (!teamId) return;
    if (!inlineEditId) return;
    const newPrice = Math.max(0, Number(inlinePrice) || 0);

    const { error } = await supabase
      .schema("tosho")
      .from("catalog_models")
      .update({ price: newPrice })
      .eq("id", inlineEditId)
      .eq("team_id", teamId);
    if (error) {
      console.error("inline price update failed", error);
      return;
    }

    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => ({
          ...kind,
          models: kind.models.map((model) =>
            model.id === inlineEditId ? { ...model, price: newPrice } : model
          ),
        })),
      }))
    );

    setInlineEditId(null);
  };

  // --- Handlers: Drawer ---
  const openCreateDrawer = () => {
    setEditingModelId(null);
    setDraftTypeId(selectedTypeId || catalog[0]?.id || "");
    setDraftKindId(selectedKindId || selectedType?.kinds[0]?.id || "");
    setDraftName("");
    setDraftFixedPrice("0");
    setDraftPriceMode("fixed");
    setDraftTiers([]);
    setDraftMethodIds([]);
    setDraftImageUrl("");
    setDrawerOpen(true);
  };

  const openEditDrawer = (modelId: string) => {
    const item = allModelsWithContext.find(i => i.model.id === modelId);
    if (!item) return;
    
    const { model } = item;

    setEditingModelId(model.id);
    setDraftTypeId(item.typeId);
    setDraftKindId(item.kindId);
    setDraftName(model.name);
    setDraftMethodIds(model.methodIds ?? []);
    setDraftImageUrl(model.imageUrl || "");

    if (model.priceTiers && model.priceTiers.length > 0) {
      setDraftPriceMode("tiers");
      setDraftTiers(model.priceTiers);
      setDraftFixedPrice(String(model.priceTiers[0].price));
    } else {
      setDraftPriceMode("fixed");
      setDraftFixedPrice(String(model.price ?? 0));
      setDraftTiers([]);
    }
    setDrawerOpen(true);
  };

  const handleDraftTypeChange = (value: string) => {
    setDraftTypeId(value);
    const nextType = catalog.find((t) => t.id === value);
    const nextKindId = nextType?.kinds[0]?.id ?? "";
    setDraftKindId(nextKindId);
    setDraftMethodIds([]);
  };

  const handleDraftKindChange = (value: string) => {
    setDraftKindId(value);
    setDraftMethodIds([]);
    setNewMethodName("");
    setNewMethodPrice("");
    setMethodError(null);
  };

  const handlePriceModeChange = (mode: "fixed" | "tiers") => {
    setDraftPriceMode(mode);
    if (mode === "tiers" && draftTiers.length === 0) {
      setDraftTiers([createNextTier([], Number(draftFixedPrice) || 0)]);
    }
  };

  const updateDraftTier = (id: string, patch: Partial<CatalogPriceTier>) => {
    setDraftTiers((prev) => prev.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)));
  };

  const addDraftTier = () => {
    const basePrice = draftTiers.length > 0 ? draftTiers[draftTiers.length-1].price : Number(draftFixedPrice) || 0;
    setDraftTiers((prev) => [...prev, createNextTier(prev, basePrice)]);
  };

  const removeDraftTier = (id: string) => {
    setDraftTiers((prev) => prev.filter((tier) => tier.id !== id));
  };

  const toggleDraftMethod = (methodId: string) => {
    setDraftMethodIds((prev) =>
      prev.includes(methodId) ? prev.filter((id) => id !== methodId) : [...prev, methodId]
    );
  };

  const handleAddMethod = async () => {
    if (!teamId || !draftKindId) return;
    const name = newMethodName.trim();
    if (!name) return;
    if (methodSaving) return;
    setMethodSaving(true);
    setMethodError(null);
    const priceValue = newMethodPrice.trim();
    const price = priceValue === "" ? null : Math.max(0, Number(priceValue) || 0);

    const { data, error } = await supabase
      .schema("tosho")
      .from("catalog_methods")
      .insert({
        team_id: teamId,
        kind_id: draftKindId,
        name,
        price,
      })
      .select("id,name,price,kind_id")
      .single();

    if (error || !data) {
      setMethodError(error?.message ?? "Не вдалося додати метод");
      setMethodSaving(false);
      return;
    }

    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => {
          if (kind.id !== draftKindId) return kind;
          const nextMethods = [
            ...kind.methods,
            { id: data.id, name: data.name, price: data.price ?? undefined },
          ];
          return { ...kind, methods: nextMethods };
        }),
      }))
    );

    setNewMethodName("");
    setNewMethodPrice("");
    setMethodSaving(false);
  };

  const handleAddPrintPosition = async (kindId: string) => {
    if (!teamId || !kindId) return;
    const label = newPrintPositionName.trim();
    if (!label) return;
    if (printPositionSaving) return;
    setPrintPositionSaving(true);
    setPrintPositionError(null);

    const { data, error } = await supabase
      .schema("tosho")
      .from("catalog_print_positions")
      .insert({
        kind_id: kindId,
        label,
        sort_order: 0,
      })
      .select("id,label,kind_id,sort_order")
      .single();

    if (error || !data) {
      setPrintPositionError(error?.message ?? "Не вдалося додати місце нанесення");
      setPrintPositionSaving(false);
      return;
    }

    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => {
          if (kind.id !== kindId) return kind;
          return {
            ...kind,
            printPositions: [
              ...kind.printPositions,
              { id: data.id, label: data.label, sort_order: data.sort_order ?? undefined },
            ],
          };
        }),
      }))
    );

    setNewPrintPositionName("");
    setPrintPositionSaving(false);
  };

  const handleDeletePrintPosition = async (kindId: string, positionId: string) => {
    if (!teamId || !kindId) return;
    const { error } = await supabase
      .schema("tosho")
      .from("catalog_print_positions")
      .delete()
      .eq("id", positionId);
    if (error) {
      setPrintPositionError(error.message);
      return;
    }
    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => {
          if (kind.id !== kindId) return kind;
          return {
            ...kind,
            printPositions: kind.printPositions.filter((pos) => pos.id !== positionId),
          };
        }),
      }))
    );
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setDraftImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveModel = async () => {
    if (!teamId) return;
    const name = draftName.trim();
    if (!name || !draftTypeId || !draftKindId) return;
    if (savingModel) return;
    setSavingModel(true);

    const modelId = editingModelId ?? createLocalId();
    const fixedPrice = Math.max(0, Number(draftFixedPrice) || 0);

    const nextModel: CatalogModel = {
      id: modelId,
      name,
      price: draftPriceMode === "tiers" ? (draftTiers[0]?.price ?? fixedPrice) : fixedPrice,
      priceTiers: draftPriceMode === "tiers" ? draftTiers : undefined,
      methodIds: draftMethodIds,
      imageUrl: draftImageUrl || undefined,
    };

    try {
      let persistedModelId = modelId;
      if (editingModelId) {
        const { error } = await supabase
          .schema("tosho")
          .from("catalog_models")
          .update({
            name: nextModel.name,
            price: nextModel.price ?? null,
            image_url: nextModel.imageUrl ?? null,
            kind_id: draftKindId,
          })
          .eq("id", editingModelId)
          .eq("team_id", teamId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .schema("tosho")
          .from("catalog_models")
          .insert({
            team_id: teamId,
            kind_id: draftKindId,
            name: nextModel.name,
            price: nextModel.price ?? null,
            image_url: nextModel.imageUrl ?? null,
          })
          .select("id")
          .single();
        if (error || !data) throw error;
        persistedModelId = data.id as string;
      }

      await supabase
        .schema("tosho")
        .from("catalog_price_tiers")
        .delete()
        .eq("model_id", persistedModelId);

      if (nextModel.priceTiers && nextModel.priceTiers.length > 0) {
        const tierPayload = nextModel.priceTiers.map((tier) => ({
          model_id: persistedModelId,
          min_qty: tier.min,
          max_qty: tier.max,
          price: tier.price,
        }));
        const { error } = await supabase
          .schema("tosho")
          .from("catalog_price_tiers")
          .insert(tierPayload);
        if (error) throw error;
      }

      await supabase
        .schema("tosho")
        .from("catalog_model_methods")
        .delete()
        .eq("model_id", persistedModelId);

      if (nextModel.methodIds && nextModel.methodIds.length > 0) {
        const methodPayload = nextModel.methodIds.map((methodId) => ({
          model_id: persistedModelId,
          method_id: methodId,
        }));
        const { error } = await supabase
          .schema("tosho")
          .from("catalog_model_methods")
          .insert(methodPayload);
        if (error) throw error;
      }

      setCatalog((prevCatalog) => {
        const cleanedCatalog = prevCatalog.map((type) => ({
          ...type,
          kinds: type.kinds.map((kind) => ({
            ...kind,
            models: kind.models.filter((model) => model.id !== persistedModelId),
          })),
        }));

        return cleanedCatalog.map((type) => {
          if (type.id !== draftTypeId) return type;
          return {
            ...type,
            kinds: type.kinds.map((kind) => {
              if (kind.id !== draftKindId) return kind;
              return { ...kind, models: [...kind.models, { ...nextModel, id: persistedModelId }] };
            }),
          };
        });
      });

      setDrawerOpen(false);
    } catch (error) {
      console.error("save model failed", error);
    } finally {
      setSavingModel(false);
    }
  };

  const confirmDeleteModel = (modelId: string) => {
    setModelToDelete(modelId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteModel = async () => {
    if (!teamId) return;
    if (!modelToDelete) return;
    const { error } = await supabase
      .schema("tosho")
      .from("catalog_models")
      .delete()
      .eq("id", modelToDelete)
      .eq("team_id", teamId);
    if (error) {
      console.error("delete model failed", error);
      return;
    }
    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => ({
          ...kind,
          models: kind.models.filter((model) => model.id !== modelToDelete),
        })),
      }))
    );
    setDeleteDialogOpen(false);
    setDrawerOpen(false);
    setModelToDelete(null);
  };

  if (teamLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Завантаження...</div>;
  }

  if (teamError) {
    return <div className="p-6 text-sm text-destructive">{teamError}</div>;
  }

  if (!teamId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Немає доступної команди. Перевір членство або інвайт.
      </div>
    );
  }

  if (catalogLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Завантаження каталогу...</div>;
  }

  if (catalogError) {
    return <div className="p-6 text-sm text-destructive">{catalogError}</div>;
  }

  return (
    <div className="w-full h-screen flex flex-col bg-background">
      {/* Fixed Top Bar */}
      <div className="shrink-0 px-6 py-4 border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Каталог продукції</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-primary/5 border-primary/20 text-primary">
                {totalModels} моделей
              </Badge>
              {incompleteModels > 0 && (
                <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {incompleteModels} незавершених
                </Badge>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => exportToCSV(catalog)} className="gap-2">
              <Download className="h-4 w-4" />
              Експорт CSV
            </Button>
            <Button onClick={openCreateDrawer} className="shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all gap-2">
              <Plus className="h-4 w-4" />
              Нова модель
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content with Scroll */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-[1400px] mx-auto px-6 py-6">
          <div className="h-full rounded-2xl border border-border/40 bg-gradient-to-br from-background via-background to-muted/20 overflow-hidden flex shadow-xl">
            
            {/* Left: Types */}
            <div className="w-[220px] border-r border-border/40 flex flex-col bg-gradient-to-b from-muted/10 to-transparent">
              <div className="p-4 pb-3 shrink-0 border-b border-border/20 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/90 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/60"></div>
                  Категорії
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openAddType}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="px-4 py-3 border-b border-border/30 bg-muted/5 space-y-2">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Тип прорахунку
                </Label>
                <div className="text-[11px] text-muted-foreground">
                  Для категорії:{" "}
                  <span className="text-foreground/90 font-medium">
                    {selectedType?.name ?? "Оберіть категорію"}
                  </span>
                </div>
                <Select
                  value={selectedType?.quote_type ?? ""}
                  onValueChange={(v) => selectedType && handleQuoteTypeUpdate(v as any)}
                  disabled={!selectedType || typeQuoteTypeSaving}
                >
                  <SelectTrigger className="h-9 text-xs bg-background/70 border-border/60">
                    <SelectValue placeholder="Не задано" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merch">Мерч</SelectItem>
                    <SelectItem value="print">Поліграфія</SelectItem>
                    <SelectItem value="other">Інше</SelectItem>
                  </SelectContent>
                </Select>
                {typeQuoteTypeError && (
                  <div className="text-xs text-destructive">{typeQuoteTypeError}</div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {catalog.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => handleSelectType(type.id)}
                    className={cn(
                      "group flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm transition-all duration-200",
                      selectedTypeId === type.id
                        ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-semibold shadow-sm ring-1 ring-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    )}
                  >
                    <span className="truncate">{type.name}</span>
                    <div className="flex items-center gap-1.5">
                      {type.quote_type ? (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "h-5 px-2 text-[10px] font-medium capitalize",
                            selectedTypeId === type.id ? "bg-primary/20 text-primary" : "text-muted-foreground/70"
                          )}
                        >
                          {type.quote_type === "merch"
                            ? "Мерч"
                            : type.quote_type === "print"
                            ? "Поліграфія"
                            : "Інше"}
                        </Badge>
                      ) : null}
                      <Badge 
                        variant="secondary" 
                        className={cn(
                          "h-5 px-2 text-[10px] font-medium transition-colors",
                          selectedTypeId === type.id ? "bg-primary/20 text-primary" : "text-muted-foreground/70"
                        )}
                      >
                        {type.kinds.length}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Middle: Kinds */}
            <div className="w-[240px] border-r border-border/40 flex flex-col bg-gradient-to-b from-muted/5 to-transparent">
              <div className="p-4 pb-3 shrink-0 border-b border-border/20 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/90 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/60"></div>
                  {selectedType?.name || "Види"}
                </div>
                {selectedTypeId && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openAddKind}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="px-4 py-3 border-b border-border/30 bg-muted/5 space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  Місця нанесення
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newPrintPositionName}
                    onChange={(e) => setNewPrintPositionName(e.target.value)}
                    placeholder={selectedKind ? "Напр. З однієї сторони" : "Оберіть вид"}
                    className="h-9 text-xs bg-background/70 border-border/60"
                    disabled={!selectedKind}
                  />
                  <Button
                    size="sm"
                    onClick={() => selectedKind && handleAddPrintPosition(selectedKind.id)}
                    disabled={!selectedKind || !newPrintPositionName.trim() || printPositionSaving}
                  >
                    {printPositionSaving ? "..." : "Додати"}
                  </Button>
                </div>
                {printPositionError && (
                  <div className="text-xs text-destructive">{printPositionError}</div>
                )}
                <div className="flex flex-wrap gap-2">
                  {!selectedKind ? (
                    <span className="text-xs text-muted-foreground">Оберіть вид, щоб додати варіанти</span>
                  ) : selectedKind.printPositions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Немає варіантів</span>
                  ) : (
                    selectedKind.printPositions.map((pos) => (
                      <div
                        key={pos.id}
                        className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-xs"
                      >
                        <span>{pos.label}</span>
                        <button
                          type="button"
                          onClick={() => handleDeletePrintPosition(selectedKind.id, pos.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {selectedKinds.length === 0 ? (
                  <div className="text-sm text-muted-foreground/60 px-2 py-8 text-center">Немає видів</div>
                ) : (
                  selectedKinds.map((kind) => (
                    <button
                      key={kind.id}
                      onClick={() => {
                        setSelectedKindId(kind.id);
                        setNewPrintPositionName("");
                        setPrintPositionError(null);
                      }}
                      className={cn(
                        "group flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm transition-all duration-200",
                        selectedKindId === kind.id
                          ? "bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-400 font-semibold shadow-sm ring-1 ring-emerald-500/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      )}
                    >
                      <span className="truncate">{kind.name}</span>
                      <Badge 
                        variant="secondary" 
                        className={cn(
                          "h-5 px-2 text-[10px] font-medium transition-colors",
                          selectedKindId === kind.id ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground/70"
                        )}
                      >
                        {kind.models.length}
                      </Badge>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right: Models */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="p-5 border-b border-border/40 shrink-0 bg-gradient-to-r from-background/80 to-muted/5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 max-w-2xl">
                    <div className="relative flex-1 group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
                      <Input
                        value={globalSearch}
                        onChange={(e) => setGlobalSearch(e.target.value)}
                        placeholder="Пошук по всьому каталогу..."
                        className="pl-9 pr-9 bg-background/80 border-border/60 focus:border-primary/40 focus:ring-primary/20 transition-all"
                      />
                      {globalSearch && (
                        <button
                          onClick={() => setGlobalSearch("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <Button
                      variant={showOnlyIncomplete ? "primary" : "outline"}
                      size="sm"
                      onClick={() => setShowOnlyIncomplete(!showOnlyIncomplete)}
                      className="gap-2 shrink-0"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      Незавершені
                    </Button>
                  </div>
                  <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 shrink-0">
                    {filteredGlobalModels.length} результатів
                  </Badge>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {filteredGlobalModels.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="rounded-full bg-muted/30 p-6 mb-4">
                      <Search className="h-12 w-12 text-muted-foreground/40" />
                    </div>
                    <p className="text-lg font-medium text-muted-foreground mb-2">Моделей не знайдено</p>
                    <p className="text-sm text-muted-foreground/60 mb-4">Спробуйте змінити критерії пошуку</p>
                    {(globalSearch || showOnlyIncomplete) && (
                      <Button variant="outline" onClick={() => { setGlobalSearch(""); setShowOnlyIncomplete(false); }} size="sm">
                        Скинути фільтри
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-2 gap-4">
                    {filteredGlobalModels.map(({ model, typeName, kindName, validation }) => {
                      const hasTiers = model.priceTiers && model.priceTiers.length > 0;
                      const priceLabel = getPriceRange(model);
                      const discount = hasTiers && model.priceTiers ? 
                        Math.round((1 - model.priceTiers[model.priceTiers.length - 1].price / model.priceTiers[0].price) * 100) : 0;
                      const isInlineEditing = inlineEditId === model.id;

                      return (
                        <div
                          key={model.id}
                          className={cn(
                            "group relative flex gap-4 rounded-2xl border p-4 transition-all duration-300",
                            validation.isValid 
                              ? "border-border/50 bg-gradient-to-br from-card via-card to-muted/10 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                              : "border-amber-200 bg-gradient-to-br from-amber-50/50 via-card to-amber-50/30 dark:border-amber-800 dark:from-amber-950/20 dark:to-amber-950/10"
                          )}
                        >
                          {/* Image */}
                          <div className="shrink-0">
                            {model.imageUrl ? (
                              <img 
                                src={model.imageUrl} 
                                alt={model.name}
                                className="w-20 h-20 rounded-lg object-cover border border-border/40"
                              />
                            ) : (
                              <div className="w-20 h-20 rounded-lg bg-muted/30 border-2 border-dashed border-border/40 flex items-center justify-center">
                                <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 flex flex-col gap-2">
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-base truncate mb-1 group-hover:text-primary transition-colors">
                                  {model.name}
                                </h3>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mb-2">
                                  <span>{typeName}</span>
                                  <span>→</span>
                                  <span>{kindName}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {hasTiers ? (
                                    <>
                                      <Badge variant="secondary" className="font-medium gap-1.5 px-2 py-0.5 text-[11px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
                                        <Layers className="h-3 w-3" /> {model.priceTiers?.length} тиражі
                                      </Badge>
                                      {discount > 0 && (
                                        <Badge variant="secondary" className="font-medium gap-1 px-2 py-0.5 text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                                          <TrendingDown className="h-3 w-3" /> до -{discount}%
                                        </Badge>
                                      )}
                                    </>
                                  ) : (
                                    <Badge variant="outline" className="font-normal text-[11px] text-muted-foreground/80 border-border/60">
                                      Фікс. ціна
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              
                              {/* Price */}
                              <div className="text-right shrink-0">
                                {isInlineEditing && !hasTiers ? (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      value={inlinePrice}
                                      onChange={(e) => setInlinePrice(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveInlineEdit();
                                        if (e.key === 'Escape') setInlineEditId(null);
                                      }}
                                      className="w-24 h-8 text-right pr-2 text-sm font-mono"
                                      autoFocus
                                      onBlur={saveInlineEdit}
                                    />
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => !hasTiers && startInlineEdit(model.id, model.price || 0)}
                                    disabled={hasTiers}
                                    className={cn(
                                      "font-mono text-2xl font-bold tabular-nums tracking-tight",
                                      !hasTiers && "hover:opacity-70 transition-opacity cursor-pointer"
                                    )}
                                  >
                                    {priceLabel} <span className="text-base font-semibold text-muted-foreground/80">{currencySymbol}</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Validation Warnings */}
                            {!validation.isValid && (
                              <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                                <div className="flex-1 text-xs text-amber-700 dark:text-amber-400">
                                  {validation.warnings.join(', ')}
                                </div>
                              </div>
                            )}

                            {/* Footer */}
                            <div className="flex justify-between items-center text-xs pt-2 border-t border-border/40">
                              <div className="flex items-center gap-1.5 text-muted-foreground/80">
                                {model.methodIds && model.methodIds.length > 0 ? (
                                  <>
                                    <Coins className="h-3.5 w-3.5" />
                                    <span className="font-medium">{model.methodIds.length} методів</span>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground/50">Без методів</span>
                                )}
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-600 transition-all"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCloneModel(model.id);
                                  }}
                                  title="Клонувати модель"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-all"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditDrawer(model.id);
                                  }}
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive transition-all"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    confirmDeleteModel(model.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden border border-border/60 bg-card text-foreground top-1/2 translate-y-[-50%]">
          <div className="px-6 pt-6 pb-4 border-b border-border/40 bg-muted/5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                {categoryMode === "type" ? <FolderPlus className="h-5 w-5" /> : <Tag className="h-5 w-5" />}
                {categoryMode === "type" ? "Додати нову категорію" : "Додати новий вид"}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground/90">
                {categoryMode === "type"
                  ? "Створіть нову категорію товарів (наприклад: Одяг, Аксесуари)"
                  : "Додайте новий вид у вибрану категорію"}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 py-4 space-y-4">
            {categoryMode === "kind" && (
              <div className="space-y-2">
                <Label>Категорія</Label>
                <Select value={selectedTypeForKind} onValueChange={setSelectedTypeForKind}>
                  <SelectTrigger>
                    <SelectValue placeholder="Оберіть категорію" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {categoryMode === "type" && (
              <div className="space-y-2">
                <Label>Тип прорахунку</Label>
                <Select value={newTypeQuoteType} onValueChange={(v) => setNewTypeQuoteType(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Оберіть тип" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merch">Мерч</SelectItem>
                    <SelectItem value="print">Поліграфія</SelectItem>
                    <SelectItem value="other">Інше</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Назва {categoryMode === "type" ? "категорії" : "виду"}</Label>
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={categoryMode === "type" ? "Наприклад: Сумки" : "Наприклад: Шопери"}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                autoFocus
              />
            </div>
          </div>
          <div className="px-6 py-4 border-t border-border/40 bg-muted/5">
            <DialogFooter className="gap-3 sm:gap-2">
              <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                Скасувати
              </Button>
              <Button
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim() || (categoryMode === "kind" && !selectedTypeForKind) || categorySaving}
              >
                {categorySaving ? "Додавання..." : "Додати"}
              </Button>
            </DialogFooter>
            {categoryError && (
              <div className="mt-2 text-xs text-destructive">{categoryError}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Model Dialog with Steps */}
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent className="max-w-3xl p-0 gap-0 max-h-[90vh] overflow-hidden border border-border/60 bg-card top-1/2 translate-y-[-50%]">
          <div className="px-6 py-5 border-b border-border/40 bg-muted/5">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">
                {editingModelId ? "Редагування моделі" : "Створення моделі"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground/80">
                Налаштуйте параметри моделі та її ціноутворення
              </DialogDescription>
            </DialogHeader>
            
            {/* Progress Steps */}
            <div className="flex items-center gap-3 mt-5">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all",
                  draftName.trim() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  1
                </div>
                <span className={cn(
                  "text-sm font-medium transition-colors",
                  draftName.trim() ? "text-foreground" : "text-muted-foreground"
                )}>
                  Базова інфо
                </span>
              </div>
              
              <div className={cn(
                "h-0.5 w-12 transition-all",
                draftName.trim() && draftKindId ? "bg-primary" : "bg-border"
              )} />
              
              <div className="flex items-center gap-2">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all",
                  draftName.trim() && draftKindId ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  2
                </div>
                <span className={cn(
                  "text-sm font-medium transition-colors",
                  draftName.trim() && draftKindId ? "text-foreground" : "text-muted-foreground"
                )}>
                  Ціни
                </span>
              </div>
              
              <div className={cn(
                "h-0.5 w-12 transition-all",
                draftMethodIds.length > 0 ? "bg-primary" : "bg-border"
              )} />
              
              <div className="flex items-center gap-2">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all",
                  draftMethodIds.length > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  3
                </div>
                <span className={cn(
                  "text-sm font-medium transition-colors",
                  draftMethodIds.length > 0 ? "text-foreground" : "text-muted-foreground"
                )}>
                  Методи
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[calc(90vh-200px)]">
            <div className="px-6 py-6 space-y-8">

              {/* Photo */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2">
                  <div className="h-1 w-1 rounded-full bg-purple-500"></div>
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" /> Фото моделі
                  </h3>
                </div>

                <div className="flex gap-4">
                  {draftImageUrl && (
                    <div className="relative group">
                      <img 
                        src={draftImageUrl} 
                        alt="Preview"
                        className="w-32 h-32 rounded-xl object-cover border-2 border-border/60"
                      />
                      <button
                        onClick={() => setDraftImageUrl("")}
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  
                  <div className="flex-1 space-y-3">
                    <ToggleGroup 
                      type="single" 
                      value={imageUploadMode} 
                      onValueChange={(v) => v && setImageUploadMode(v as any)}
                      className="justify-start"
                    >
                      <ToggleGroupItem value="url" size="sm" className="text-xs">
                        <Link2 className="h-3 w-3 mr-1" /> URL
                      </ToggleGroupItem>
                      <ToggleGroupItem value="file" size="sm" className="text-xs">
                        <Upload className="h-3 w-3 mr-1" /> Файл
                      </ToggleGroupItem>
                    </ToggleGroup>

                    {imageUploadMode === "url" ? (
                      <Input
                        value={draftImageUrl}
                        onChange={(e) => setDraftImageUrl(e.target.value)}
                        placeholder="https://example.com/image.jpg"
                        className="bg-background/60 border-border/60"
                      />
                    ) : (
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="border-2 border-dashed border-border/60 rounded-lg p-4 text-center hover:border-primary/40 hover:bg-muted/20 transition-colors cursor-pointer">
                          <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground/60" />
                          <p className="text-xs text-muted-foreground">Клікніть або перетягніть фото</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Separator className="bg-border/40" />

              {/* Basic Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2">
                  <div className="h-1 w-1 rounded-full bg-primary"></div>
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                    Основна інформація
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Тип товару</Label>
                    <Select value={draftTypeId} onValueChange={handleDraftTypeChange}>
                      <SelectTrigger className="bg-background/60 border-border/60">
                        <SelectValue placeholder="Оберіть тип" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalog.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Вид товару</Label>
                    <Select value={draftKindId} onValueChange={handleDraftKindChange}>
                      <SelectTrigger disabled={!draftTypeId} className="bg-background/60 border-border/60">
                        <SelectValue placeholder={draftTypeId ? "Оберіть вид" : "Спочатку тип"} />
                      </SelectTrigger>
                      <SelectContent>
                        {draftKinds.map((k) => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Назва моделі <span className="text-destructive">*</span>
                  </Label>
                  <Input 
                    value={draftName} 
                    onChange={(e) => setDraftName(e.target.value)} 
                    placeholder="Напр. Malfini Basic 160"
                    className="bg-background/60 border-border/60"
                  />
                </div>
              </div>

              <Separator className="bg-border/40" />

              {/* Pricing */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-1 rounded-full bg-emerald-500"></div>
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Layers className="h-4 w-4" /> Ціноутворення
                    </h3>
                  </div>
                  <ToggleGroup 
                    type="single" 
                    value={draftPriceMode} 
                    onValueChange={(v) => v && handlePriceModeChange(v as any)} 
                    className="border rounded-lg p-1 bg-muted/20 shadow-sm"
                  >
                    <ToggleGroupItem value="fixed" size="sm" className="text-xs px-4 py-1.5">
                      Фіксована
                    </ToggleGroupItem>
                    <ToggleGroupItem value="tiers" size="sm" className="text-xs px-4 py-1.5">
                      Тиражі
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {draftPriceMode === "fixed" ? (
                  <div className="bg-gradient-to-br from-muted/20 to-muted/5 p-5 rounded-xl border border-border/40">
                    <Label className="text-xs font-medium text-muted-foreground mb-2 block">Базова ціна</Label>
                    <div className="flex items-baseline gap-2">
                      <Input
                        type="number"
                        min="0"
                        className="w-40 h-12 text-right pr-3 font-mono text-2xl font-bold tabular-nums bg-background/80 border-border/60"
                        value={draftFixedPrice}
                        onChange={(e) => setDraftFixedPrice(e.target.value)}
                      />
                      <span className="text-xl font-semibold text-muted-foreground/80">{currencySymbol}</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/40 bg-gradient-to-br from-muted/10 to-transparent overflow-hidden">
                    <div className="grid grid-cols-[1fr_1fr_1.5fr_48px] gap-3 px-5 py-3 bg-muted/30 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <div>Від (шт.)</div>
                      <div>До (шт.)</div>
                      <div className="text-right pr-10">Ціна/од.</div>
                      <div></div>
                    </div>
                    <div className="p-3 space-y-2.5">
                      {draftTiers.map((tier, index) => (
                        <div key={tier.id} className="grid grid-cols-[1fr_1fr_1.5fr_48px] gap-3 items-center relative group">
                          {index > 0 && (
                            <div className="absolute left-[48%] top-[-14px] h-5 w-0.5 bg-gradient-to-b from-border/30 to-border/60 -z-10"></div>
                          )}

                          <Input
                            type="number"
                            className="h-10 text-center font-medium bg-background/80 border-border/50"
                            value={tier.min}
                            onChange={(e) => updateDraftTier(tier.id, { min: Math.max(1, Number(e.target.value) || 1) })}
                          />
                          <Input
                            type="number"
                            className={cn(
                              "h-10 text-center font-medium bg-background/80 border-border/50",
                              !tier.max && "text-muted-foreground/60 italic"
                            )}
                            placeholder="∞"
                            value={tier.max ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateDraftTier(tier.id, { max: val === "" || val === "0" ? null : Math.max(tier.min, Number(val)) });
                            }}
                          />
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              className="h-10 text-right font-mono font-bold tabular-nums bg-background/80 border-border/50 flex-1"
                              value={tier.price}
                              onChange={(e) => updateDraftTier(tier.id, { price: Math.max(0, Number(e.target.value) || 0) })}
                            />
                            <span className="text-sm font-semibold text-muted-foreground/80 w-6">{currencySymbol}</span>
                          </div>

                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                            onClick={() => removeDraftTier(tier.id)}
                            disabled={draftTiers.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full mt-3 border-dashed border-2 text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5" 
                        onClick={addDraftTier}
                      >
                        <Plus className="h-4 w-4 mr-2" /> Додати рівень
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Separator className="bg-border/40" />

              {/* Methods */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2">
                  <div className="h-1 w-1 rounded-full bg-amber-500"></div>
                  <div>
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Coins className="h-4 w-4" /> Доступні методи
                    </h3>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">
                      Оберіть методи, доступні для цієї моделі
                    </p>
                  </div>
                </div>

                {!draftKindId ? (
                  <div className="text-sm text-muted-foreground/60 py-8 border-2 border-dashed rounded-xl text-center bg-muted/10 flex flex-col items-center gap-3">
                    <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
                    <p>Спочатку оберіть Вид товару</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground">Назва методу</Label>
                          <Input
                            value={newMethodName}
                            onChange={(e) => setNewMethodName(e.target.value)}
                            placeholder="Напр. DTF"
                            className="bg-background/60 border-border/60"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-muted-foreground">Ціна (опціонально)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={newMethodPrice}
                            onChange={(e) => setNewMethodPrice(e.target.value)}
                            placeholder="0"
                            className="bg-background/60 border-border/60 text-right font-mono"
                          />
                        </div>
                        <Button
                          onClick={handleAddMethod}
                          disabled={!newMethodName.trim() || methodSaving}
                          className="gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          {methodSaving ? "Додавання..." : "Додати метод"}
                        </Button>
                      </div>
                      {methodError && <div className="mt-2 text-xs text-destructive">{methodError}</div>}
                    </div>

                    {availableMethodsForDraft.length === 0 ? (
                      <div className="text-sm text-muted-foreground/60 py-8 border-2 border-dashed rounded-xl text-center bg-muted/10 flex flex-col items-center gap-3">
                        <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
                        <p>У виді "{draftKind?.name}" ще немає методів</p>
                      </div>
                    ) : null}

                    {availableMethodsForDraft.map((method) => {
                      const isSelected = draftMethodIds.includes(method.id);
                      return (
                        <label
                          key={method.id}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all duration-200",
                            isSelected 
                              ? "border-primary/50 bg-gradient-to-r from-primary/10 to-primary/5 shadow-md shadow-primary/10" 
                              : "border-border/40 bg-card/50 hover:bg-muted/20 hover:border-border/60"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleDraftMethod(method.id)}
                            />
                            <span className={cn("text-sm font-medium", isSelected && "text-primary")}>
                              {method.name}
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="font-mono text-base font-bold tabular-nums">
                              {formatPrice(method.price ?? 0)}
                            </span>
                            <span className="text-sm font-semibold text-muted-foreground/80">{currencySymbol}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/40 bg-muted/5 shrink-0 sm:justify-between">
            {editingModelId ? (
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10" 
                onClick={() => confirmDeleteModel(editingModelId)}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Видалити
              </Button>
            ) : <div></div>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} className="border-border/60">
                Скасувати
              </Button>
              <Button 
                onClick={handleSaveModel} 
                disabled={!draftName.trim() || !draftKindId || savingModel}
                className="shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-50"
              >
                {savingModel ? "Збереження..." : editingModelId ? "Зберегти зміни" : "Створити модель"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Підтвердження видалення"
        description="Ви впевнені, що хочете видалити цю модель? Цю дію не можна буде скасувати."
        icon={<AlertCircle className="h-5 w-5 text-destructive" />}
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        confirmClassName="bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg shadow-destructive/20"
        onConfirm={handleDeleteModel}
      />
    </div>
  );
}
