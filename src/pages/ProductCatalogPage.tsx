import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { 
  Coins, Layers, Plus, Trash2, Edit2, Search, X, AlertCircle, TrendingDown, 
  Copy, Download, Upload, Image as ImageIcon, Link2, AlertTriangle, Settings,
  FolderPlus, Tag
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
type CatalogKind = { id: string; name: string; models: CatalogModel[]; methods: CatalogMethod[]; };
type CatalogType = { id: string; name: string; kinds: CatalogKind[]; };

// --- Initial Data ---
const INITIAL_CATALOG: CatalogType[] = [
  {
    id: "apparel",
    name: "Одяг",
    kinds: [
      {
        id: "tshirt",
        name: "Футболка",
        models: [
          {
            id: "malfini-basic-160",
            name: "Malfini BASIC 160",
            imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=400&fit=crop",
            priceTiers: [
              { id: "tier-1", min: 1, max: 9, price: 180 },
              { id: "tier-2", min: 10, max: 49, price: 150 },
              { id: "tier-3", min: 50, max: 199, price: 120 },
              { id: "tier-4", min: 200, max: null, price: 95 },
            ],
            methodIds: ["dtf", "silkscreen"],
          },
          { id: "roly-stafford", name: "Roly Stafford", price: 110, methodIds: ["dtf"] },
          { 
            id: "sols-imperial", 
            name: "SOL'S Imperial", 
            price: 135, 
            methodIds: ["sublimation"],
            imageUrl: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=400&h=400&fit=crop"
          },
        ],
        methods: [
          { id: "dtf", name: "DTF", price: 40 },
          { id: "silkscreen", name: "Шовкодрук", price: 55 },
          { id: "sublimation", name: "Сублімація", price: 60 },
        ],
      },
      {
        id: "hoodie",
        name: "Худі",
        models: [
          { id: "st3000", name: "Stedman ST3000", price: 180, methodIds: ["dtf", "embroidery"] },
          { id: "awdis", name: "AWDis JH001", price: 210, methodIds: ["embroidery"] },
        ],
        methods: [
          { id: "dtf", name: "DTF", price: 45 },
          { id: "embroidery", name: "Вишивка", price: 90 },
        ],
      },
    ],
  },
];

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
  if (!model.imageUrl) warnings.push("Немає фото");
  
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
  const [selectedTypeId, setSelectedTypeId] = useState(catalog[0]?.id ?? "");
  const [selectedKindId, setSelectedKindId] = useState(catalog[0]?.kinds[0]?.id ?? "");
  const [globalSearch, setGlobalSearch] = useState("");
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);

  // Category Management
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryMode, setCategoryMode] = useState<"type" | "kind">("type");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedTypeForKind, setSelectedTypeForKind] = useState("");

  // Draft state
  const [draftTypeId, setDraftTypeId] = useState(selectedTypeId);
  const [draftKindId, setDraftKindId] = useState(selectedKindId);
  const [draftName, setDraftName] = useState("");
  const [draftPriceMode, setDraftPriceMode] = useState<"fixed" | "tiers">("fixed");
  const [draftFixedPrice, setDraftFixedPrice] = useState("0");
  const [draftTiers, setDraftTiers] = useState<CatalogPriceTier[]>([]);
  const [draftMethodIds, setDraftMethodIds] = useState<string[]>([]);
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [imageUploadMode, setImageUploadMode] = useState<"url" | "file">("url");

  // Inline edit
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlinePrice, setInlinePrice] = useState("");

  const currencySymbol = "₴";

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
    setCategoryDialogOpen(true);
  };

  const openAddKind = () => {
    setCategoryMode("kind");
    setNewCategoryName("");
    setSelectedTypeForKind(selectedTypeId || catalog[0]?.id || "");
    setCategoryDialogOpen(true);
  };

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;

    if (categoryMode === "type") {
      const newType: CatalogType = {
        id: createLocalId(),
        name,
        kinds: []
      };
      setCatalog(prev => [...prev, newType]);
      setSelectedTypeId(newType.id);
    } else {
      if (!selectedTypeForKind) return;
      const newKind: CatalogKind = {
        id: createLocalId(),
        name,
        models: [],
        methods: []
      };
      setCatalog(prev => prev.map(type => 
        type.id === selectedTypeForKind 
          ? { ...type, kinds: [...type.kinds, newKind] }
          : type
      ));
      setSelectedTypeId(selectedTypeForKind);
      setSelectedKindId(newKind.id);
    }

    setCategoryDialogOpen(false);
  };

  // --- Handlers: Navigation ---
  const handleSelectType = (typeId: string) => {
    setSelectedTypeId(typeId);
    const nextType = catalog.find((type) => type.id === typeId);
    setSelectedKindId(nextType?.kinds[0]?.id ?? "");
    setGlobalSearch("");
  };

  // --- Handlers: Clone ---
  const handleCloneModel = (modelId: string) => {
    const item = allModelsWithContext.find(i => i.model.id === modelId);
    if (!item) return;
    
    const clonedModel: CatalogModel = {
      ...item.model,
      id: createLocalId(),
      name: `${item.model.name} (копія)`,
    };
    
    setCatalog(prev => prev.map(type => {
      if (type.id !== item.typeId) return type;
      return {
        ...type,
        kinds: type.kinds.map(kind => {
          if (kind.id !== item.kindId) return kind;
          return { ...kind, models: [...kind.models, clonedModel] };
        })
      };
    }));
  };

  // --- Handlers: Inline Edit ---
  const startInlineEdit = (modelId: string, currentPrice: number) => {
    setInlineEditId(modelId);
    setInlinePrice(String(currentPrice));
  };

  const saveInlineEdit = () => {
    if (!inlineEditId) return;
    const newPrice = Math.max(0, Number(inlinePrice) || 0);
    
    setCatalog(prev => prev.map(type => ({
      ...type,
      kinds: type.kinds.map(kind => ({
        ...kind,
        models: kind.models.map(model => 
          model.id === inlineEditId ? { ...model, price: newPrice } : model
        )
      }))
    })));
    
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

  const handleSaveModel = () => {
    const name = draftName.trim();
    if (!name || !draftTypeId || !draftKindId) return;

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

    setCatalog((prevCatalog) => {
      const cleanedCatalog = prevCatalog.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => ({
          ...kind,
          models: kind.models.filter((model) => model.id !== modelId),
        })),
      }));

      return cleanedCatalog.map((type) => {
        if (type.id !== draftTypeId) return type;
        return {
          ...type,
          kinds: type.kinds.map((kind) => {
            if (kind.id !== draftKindId) return kind;
            return { ...kind, models: [...kind.models, nextModel] };
          }),
        };
      });
    });

    setDrawerOpen(false);
  };

  const confirmDeleteModel = (modelId: string) => {
    setModelToDelete(modelId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteModel = () => {
    if (!modelToDelete) return;
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
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "h-5 px-2 text-[10px] font-medium transition-colors",
                        selectedTypeId === type.id ? "bg-primary/20 text-primary" : "text-muted-foreground/70"
                      )}
                    >
                      {type.kinds.length}
                    </Badge>
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
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {selectedKinds.length === 0 ? (
                  <div className="text-sm text-muted-foreground/60 px-2 py-8 text-center">Немає видів</div>
                ) : (
                  selectedKinds.map((kind) => (
                    <button
                      key={kind.id}
                      onClick={() => setSelectedKindId(kind.id)}
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
                      variant={showOnlyIncomplete ? "default" : "outline"}
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
                  <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {categoryMode === "type" ? <FolderPlus className="h-5 w-5" /> : <Tag className="h-5 w-5" />}
              {categoryMode === "type" ? "Додати нову категорію" : "Додати новий вид"}
            </DialogTitle>
            <DialogDescription>
              {categoryMode === "type" 
                ? "Створіть нову категорію товарів (наприклад: Одяг, Аксесуари)"
                : "Додайте новий вид у вибрану категорію"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
            <div className="space-y-2">
              <Label>Назва {categoryMode === "type" ? "категорії" : "виду"}</Label>
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={categoryMode === "type" ? "Наприклад: Сумки" : "Наприклад: Шопери"}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
              Скасувати
            </Button>
            <Button onClick={handleAddCategory} disabled={!newCategoryName.trim() || (categoryMode === "kind" && !selectedTypeForKind)}>
              Додати
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Model Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-[540px] sm:w-[540px] p-0 flex flex-col bg-gradient-to-br from-background via-background to-muted/20 backdrop-blur-xl border-l border-border/40 overflow-hidden">
          <SheetHeader className="px-6 py-5 border-b border-border/40 bg-gradient-to-r from-muted/10 to-transparent shrink-0">
            <SheetTitle className="text-2xl font-bold">
              {editingModelId ? "Редагування моделі" : "Створення моделі"}
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground/80">
              Налаштуйте параметри моделі та її ціноутворення
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
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
                ) : availableMethodsForDraft.length === 0 ? (
                  <div className="text-sm text-muted-foreground/60 py-8 border-2 border-dashed rounded-xl text-center bg-muted/10 flex flex-col items-center gap-3">
                    <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
                    <p>У виді "{draftKind?.name}" ще немає методів</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
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

          <SheetFooter className="px-6 py-4 border-t border-border/40 bg-gradient-to-r from-muted/10 to-transparent shrink-0 sm:justify-between">
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
                disabled={!draftName.trim() || !draftKindId}
                className="shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-50"
              >
                {editingModelId ? "Зберегти зміни" : "Створити модель"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="border-border/40 bg-gradient-to-br from-background to-muted/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-xl">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Підтвердження видалення
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Ви впевнені, що хочете видалити цю модель? Цю дію не можна буде скасувати.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/60">Скасувати</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteModel}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg shadow-destructive/20"
            >
              Видалити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}