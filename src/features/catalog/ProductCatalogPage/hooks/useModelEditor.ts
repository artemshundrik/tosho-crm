/**
 * useModelEditor Hook
 * 
 * Manages model creation, editing, deletion, and all related operations
 * including price tiers, methods, and image handling
 */

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  getAttachmentVariantPath,
  removeAttachmentWithVariants,
  uploadAttachmentWithVariants,
} from "@/lib/attachmentPreview";
import type {
  CatalogModel,
  CatalogModelMetadata,
  CatalogPriceTier,
  CatalogType,
  PriceMode,
  ImageUploadMode,
  ModelWithContext,
} from "@/types/catalog";
import { createLocalId, createNextTier, readImageFile } from "@/utils/catalogUtils";
import { DEFAULT_PRICE } from "@/constants/catalog";

const CATALOG_IMAGE_BUCKET = "public-assets";

const syncKindModelCounts = (catalog: CatalogType[]) =>
  catalog.map((type) => ({
    ...type,
    kinds: type.kinds.map((kind) => ({
      ...kind,
      modelCount: kind.models.length,
    })),
  }));

interface UseModelEditorProps {
  teamId: string | null;
  catalog: CatalogType[];
  setCatalog: React.Dispatch<React.SetStateAction<CatalogType[]>>;
  selectedTypeId: string;
  selectedKindId: string;
  allModelsWithContext: ModelWithContext[];
}

export function useModelEditor({
  teamId,
  catalog,
  setCatalog,
  selectedTypeId,
  selectedKindId,
  allModelsWithContext,
}: UseModelEditorProps) {
  const isInlineImageDataUrl = (value?: string | null) =>
    typeof value === "string" && value.trim().toLowerCase().startsWith("data:");

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "object" && error !== null) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message) return message;
    }
    return fallback;
  };

  // Dialog state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);

  // Draft model state
  const [draftTypeId, setDraftTypeId] = useState("");
  const [draftKindId, setDraftKindId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftPriceMode, setDraftPriceMode] = useState<PriceMode>("fixed");
  const [draftFixedPrice, setDraftFixedPrice] = useState(String(DEFAULT_PRICE));
  const [draftTiers, setDraftTiers] = useState<CatalogPriceTier[]>([]);
  const [draftMethodIds, setDraftMethodIds] = useState<string[]>([]);
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [draftImageFile, setDraftImageFile] = useState<File | null>(null);
  const [draftMetadata, setDraftMetadata] = useState<CatalogModelMetadata>({});
  const [imageUploadMode, setImageUploadMode] = useState<ImageUploadMode>("url");

  // Methods management
  const [newMethodName, setNewMethodName] = useState("");
  const [newMethodPrice, setNewMethodPrice] = useState("");
  const [methodSaving, setMethodSaving] = useState(false);
  const [methodError, setMethodError] = useState<string | null>(null);

  // Print positions management
  const [newPrintPositionName, setNewPrintPositionName] = useState("");
  const [printPositionSaving, setPrintPositionSaving] = useState(false);
  const [printPositionError, setPrintPositionError] = useState<string | null>(null);

  // Inline editing
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlinePrice, setInlinePrice] = useState("");

  const loadPriceTiersForModel = useCallback(
    async (modelId: string): Promise<CatalogPriceTier[]> => {
      if (!teamId || !modelId) return [];

      const { data, error } = await supabase
        .schema("tosho")
        .from("catalog_price_tiers")
        .select("id,min_qty,max_qty,price")
        .eq("model_id", modelId)
        .order("min_qty", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((tier) => ({
        id: tier.id,
        min: tier.min_qty,
        max: tier.max_qty,
        price: tier.price,
      }));
    },
    [teamId]
  );

  const getPublicStorageUrl = (bucket: string, path: string) =>
    supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

  const sanitizeFileName = (value: string) => value.replace(/[^\w.-]+/g, "_");

  const getCatalogImportErrorMessage = (error: unknown) => {
    const message = getErrorMessage(error, "Не вдалося підготувати фото моделі.");
    if (/(404|responded with 404|source responded with 404)/i.test(message)) {
      return "За цим посиланням фото не знайдено. Перевірте URL або завантажте файл.";
    }
    if (/\((403|429)\)/.test(message)) {
      return "Сайт із цим фото не дав завантажити картинку. Вставте пряме посилання на зображення або використайте файл.";
    }
    if (/did not return an image/i.test(message)) {
      return "Потрібне пряме посилання саме на картинку, а не на сторінку чи файл іншого типу.";
    }
    if (/вести напряму на зображення/i.test(message)) {
      return "Потрібне пряме посилання саме на картинку, а не на сторінку сайту.";
    }
    if (/cors/i.test(message.toLowerCase())) {
      return "Сайт із цим фото блокує завантаження картинки. Спробуйте інше посилання або завантажте файл.";
    }
    return message;
  };

  const isManagedCatalogImageUrl = (value?: string | null, asset?: CatalogModelMetadata["imageAsset"] | null) => {
    const normalized = value?.trim() ?? "";
    if (!normalized) return false;
    if (asset) {
      if ([asset.originalUrl, asset.previewUrl, asset.thumbUrl].includes(normalized)) return true;
    }
    return (
      normalized.includes("/storage/v1/object/public/public-assets/") &&
      normalized.includes("/catalog-models/")
    );
  };

  const importCatalogImageFromUrl = useCallback(
    async (params: { sourceUrl: string; persistedModelId: string }) => {
      const sourceUrl = params.sourceUrl.trim();
      const fileNameFromUrl = (() => {
        try {
          return new URL(sourceUrl).pathname.split("/").pop() ?? "catalog-image";
        } catch {
          return "catalog-image";
        }
      })();
      const safeName = sanitizeFileName(fileNameFromUrl.replace(/\?.*$/, "") || "catalog-image");
      const storagePath = `teams/${teamId}/catalog-models/${params.persistedModelId}/${Date.now()}-${safeName.includes(".") ? safeName : `${safeName}.jpg`}`;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error("Не вдалося підтвердити сесію для імпорту фото моделі.");
      }

      const response = await fetch("/.netlify/functions/catalog-image-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bucket: CATALOG_IMAGE_BUCKET,
          storagePath,
          sourceUrl,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; storagePath?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || `Не вдалося завантажити фото моделі за URL (${response.status}).`);
      }

      const resolvedStoragePath = payload?.storagePath?.trim() || storagePath;

      return {
        storagePath: resolvedStoragePath,
        assetPayload: getCatalogAssetPayload(resolvedStoragePath),
      };
    },
    [teamId]
  );

  const getCatalogAssetPayload = (storagePath: string) => {
    const originalUrl = getPublicStorageUrl(CATALOG_IMAGE_BUCKET, storagePath);
    const previewUrl = getPublicStorageUrl(
      CATALOG_IMAGE_BUCKET,
      getAttachmentVariantPath(storagePath, "preview")
    );
    const thumbUrl = getPublicStorageUrl(
      CATALOG_IMAGE_BUCKET,
      getAttachmentVariantPath(storagePath, "thumb")
    );

    return {
      imageUrl: previewUrl,
      imageAsset: {
        bucket: CATALOG_IMAGE_BUCKET,
        path: storagePath,
        originalUrl,
        previewUrl,
        thumbUrl,
      },
    };
  };

  const loadFullModelMedia = useCallback(
    async (modelId: string) => {
      if (!teamId || !modelId) return null;

      const { data, error } = await supabase
        .schema("tosho")
        .from("catalog_models")
        .select("id,image_url,metadata")
        .eq("id", modelId)
        .eq("team_id", teamId)
        .limit(1);

      if (error) throw error;
      return data?.[0] ?? null;
    },
    [teamId]
  );

  const handleDraftImageUrlChange = (value: string) => {
    setDraftImageFile(null);
    setDraftImageUrl(value);
  };

  const handleImageUploadModeChange = (mode: ImageUploadMode) => {
    setImageUploadMode(mode);
    if (mode === "url" && draftImageFile) {
      setDraftImageFile(null);
      setDraftImageUrl("");
    }
  };

  /**
   * Opens drawer for creating a new model
   */
  const openCreateDrawer = () => {
    setEditingModelId(null);
    setDraftTypeId(selectedTypeId || catalog[0]?.id || "");
    setDraftKindId(selectedKindId || catalog[0]?.kinds[0]?.id || "");
    setDraftName("");
    setDraftFixedPrice(String(DEFAULT_PRICE));
    setDraftPriceMode("fixed");
    setDraftTiers([]);
    setDraftMethodIds([]);
    setDraftImageUrl("");
    setDraftImageFile(null);
    setDraftMetadata({});
    setImageUploadMode("url");
    setDrawerOpen(true);
  };

  /**
   * Opens drawer for editing an existing model
   */
  const openEditDrawer = async (modelId: string) => {
    const item = allModelsWithContext.find((i) => i.model.id === modelId);
    if (!item) return;

    let { model } = item;

    if (model.priceTiers === undefined) {
      try {
        const fetchedTiers = await loadPriceTiersForModel(model.id);
        model = {
          ...model,
          priceTiers: fetchedTiers.length > 0 ? fetchedTiers : undefined,
        };

        setCatalog((prev) =>
          prev.map((type) => ({
            ...type,
            kinds: type.kinds.map((kind) => ({
              ...kind,
              models: kind.models.map((existingModel) =>
                existingModel.id === model.id ? model : existingModel
              ),
            })),
          }))
        );
      } catch (error) {
        console.error("load price tiers failed", error);
      }
    }

    let fullImageUrl = model.imageUrl || "";
    let fullMetadata = model.metadata ?? {};

    try {
      const fullModel = await loadFullModelMedia(model.id);
      if (fullModel) {
        fullImageUrl = fullModel.image_url ?? fullImageUrl;
        fullMetadata = (fullModel.metadata as CatalogModelMetadata | null) ?? fullMetadata;
      }
    } catch (error) {
      console.error("load full model media failed", error);
    }

    setEditingModelId(model.id);
    setDraftTypeId(item.typeId);
    setDraftKindId(item.kindId);
    setDraftName(model.name);
    setDraftMethodIds(model.methodIds ?? []);
    setDraftImageUrl(fullImageUrl);
    setDraftImageFile(null);
    setDraftMetadata(fullMetadata);
    setImageUploadMode("url");

    if (model.priceTiers && model.priceTiers.length > 0) {
      setDraftPriceMode("tiers");
      setDraftTiers(model.priceTiers);
      setDraftFixedPrice(String(model.priceTiers[0].price));
    } else {
      setDraftPriceMode("fixed");
      setDraftFixedPrice(String(model.price ?? DEFAULT_PRICE));
      setDraftTiers([]);
    }
    
    setDrawerOpen(true);
  };

  /**
   * Handles type change in model editor
   */
  const handleDraftTypeChange = (value: string) => {
    setDraftTypeId(value);
    const nextType = catalog.find((t) => t.id === value);
    const nextKindId = nextType?.kinds[0]?.id ?? "";
    setDraftKindId(nextKindId);
    setDraftMethodIds([]);
  };

  /**
   * Handles kind change in model editor
   */
  const handleDraftKindChange = (value: string) => {
    setDraftKindId(value);
    setDraftMethodIds([]);
    setNewMethodName("");
    setNewMethodPrice("");
    setMethodError(null);
  };

  /**
   * Handles price mode change (fixed/tiers)
   */
  const handlePriceModeChange = (mode: PriceMode) => {
    setDraftPriceMode(mode);
    if (mode === "tiers" && draftTiers.length === 0) {
      setDraftTiers([createNextTier([], Number(draftFixedPrice) || DEFAULT_PRICE)]);
    }
  };

  /**
   * Updates a specific price tier
   */
  const updateDraftTier = (id: string, patch: Partial<CatalogPriceTier>) => {
    setDraftTiers((prev) => prev.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)));
  };

  /**
   * Adds a new price tier
   */
  const addDraftTier = () => {
    const basePrice =
      draftTiers.length > 0
        ? draftTiers[draftTiers.length - 1].price
        : Number(draftFixedPrice) || DEFAULT_PRICE;
    setDraftTiers((prev) => [...prev, createNextTier(prev, basePrice)]);
  };

  /**
   * Removes a price tier
   */
  const removeDraftTier = (id: string) => {
    setDraftTiers((prev) => prev.filter((tier) => tier.id !== id));
  };

  /**
   * Toggles method selection
   */
  const toggleDraftMethod = (methodId: string) => {
    setDraftMethodIds((prev) =>
      prev.includes(methodId) ? prev.filter((id) => id !== methodId) : [...prev, methodId]
    );
  };

  /**
   * Adds a new method to the current kind
   */
  const handleAddMethod = async (kindIdOverride?: string, nameOverride?: string) => {
    const rawKindId = kindIdOverride ?? draftKindId;
    const targetKindId = typeof rawKindId === "string" ? rawKindId.trim() : "";
    if (!teamId || !targetKindId || methodSaving) return;

    const rawName = nameOverride ?? newMethodName;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name) return;
    
    setMethodSaving(true);
    setMethodError(null);
    try {
      const { data, error } = await supabase
        .schema("tosho")
        .from("catalog_methods")
        .insert({
          team_id: teamId,
          kind_id: targetKindId,
          name,
          price: null,
        })
        .select("id,name,price,kind_id")
        .single();

      if (error || !data) {
        setMethodError(error?.message ?? "Не вдалося додати метод");
        return;
      }

      setCatalog((prev) =>
        prev.map((type) => ({
          ...type,
          kinds: type.kinds.map((kind) => {
            if (kind.id !== targetKindId) return kind;
            const nextMethods = [
              ...(kind.methods ?? []),
              { id: data.id, name: data.name, price: data.price ?? undefined },
            ];
            return { ...kind, methods: nextMethods };
          }),
        }))
      );

      setNewMethodName("");
      setNewMethodPrice("");
    } catch (error: unknown) {
      setMethodError(error instanceof Error ? error.message : "Не вдалося додати метод");
    } finally {
      setMethodSaving(false);
    }
  };

  /**
   * Updates an existing method
   */
  const handleUpdateMethod = async (
    kindId: string,
    methodId: string,
    nextName: string
  ): Promise<boolean> => {
    if (!teamId || !kindId || !methodId || methodSaving) return false;

    const name = nextName.trim();
    if (!name) {
      setMethodError("Вкажіть назву методу");
      return false;
    }

    setMethodSaving(true);
    setMethodError(null);

    const { error } = await supabase
      .schema("tosho")
      .from("catalog_methods")
      .update({ name })
      .eq("id", methodId)
      .eq("kind_id", kindId);

    if (error) {
      setMethodError(error.message);
      setMethodSaving(false);
      return false;
    }

    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => {
          if (kind.id !== kindId) return kind;
          return {
            ...kind,
            methods: kind.methods.map((method) =>
              method.id === methodId ? { ...method, name } : method
            ),
          };
        }),
      }))
    );

    setMethodSaving(false);
    return true;
  };

  /**
   * Deletes a method from a kind
   */
  const handleDeleteMethod = async (kindId: string, methodId: string) => {
    if (!teamId || !kindId || !methodId || methodSaving) return;

    setMethodSaving(true);
    setMethodError(null);

    const { error: mapError } = await supabase
      .schema("tosho")
      .from("catalog_model_methods")
      .delete()
      .eq("method_id", methodId);

    if (mapError) {
      setMethodError(mapError.message);
      setMethodSaving(false);
      return;
    }

    const { error } = await supabase
      .schema("tosho")
      .from("catalog_methods")
      .delete()
      .eq("id", methodId)
      .eq("kind_id", kindId);

    if (error) {
      setMethodError(error.message);
      setMethodSaving(false);
      return;
    }

    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => {
          if (kind.id !== kindId) return kind;
          return {
            ...kind,
            methods: kind.methods.filter((method) => method.id !== methodId),
            models: kind.models.map((model) => ({
              ...model,
              methodIds: model.methodIds?.filter((id) => id !== methodId),
            })),
          };
        }),
      }))
    );

    setDraftMethodIds((prev) => prev.filter((id) => id !== methodId));
    setMethodSaving(false);
  };

  /**
   * Adds a print position to a kind
   */
  const handleAddPrintPosition = async (kindId: string, labelOverride?: string) => {
    if (!teamId || !kindId || printPositionSaving) return;
    
    const label = (labelOverride ?? newPrintPositionName).trim();
    if (!label) return;
    
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

  /**
   * Deletes a print position
   */
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

  /**
   * Updates a print position label
   */
  const handleUpdatePrintPosition = async (
    kindId: string,
    positionId: string,
    nextLabel: string
  ): Promise<boolean> => {
    if (!teamId || !kindId || !positionId || printPositionSaving) return false;

    const label = nextLabel.trim();
    if (!label) {
      setPrintPositionError("Вкажіть назву місця");
      return false;
    }

    setPrintPositionSaving(true);
    setPrintPositionError(null);

    const { error } = await supabase
      .schema("tosho")
      .from("catalog_print_positions")
      .update({ label })
      .eq("id", positionId)
      .eq("kind_id", kindId);

    if (error) {
      setPrintPositionError(error.message);
      setPrintPositionSaving(false);
      return false;
    }

    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => {
          if (kind.id !== kindId) return kind;
          return {
            ...kind,
            printPositions: kind.printPositions.map((pos) =>
              pos.id === positionId ? { ...pos, label } : pos
            ),
          };
        }),
      }))
    );

    setPrintPositionSaving(false);
    return true;
  };

  /**
   * Handles image file upload
   */
  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const dataUrl = await readImageFile(file);
      setDraftImageFile(file);
      setDraftImageUrl(dataUrl);
    }
  };

  /**
   * Saves the model (create or update)
   */
  const handleSaveModel = async () => {
    if (!teamId || savingModel) return;
    
    const name = draftName.trim();
    if (!name) {
      toast.error("Вкажіть назву моделі.");
      return;
    }
    if (!draftTypeId) {
      toast.error("Оберіть тип товару.");
      return;
    }
    if (!draftKindId) {
      toast.error("Оберіть вид товару.");
      return;
    }
    
    setSavingModel(true);

    const modelId = editingModelId ?? createLocalId();
    const fixedPrice = Math.max(0, Number(draftFixedPrice) || 0);
    const normalizedImageUrl = draftImageUrl.trim();
    const existingImageAsset = draftMetadata.imageAsset ?? null;
    const nextMetadata: CatalogModelMetadata = { ...(draftMetadata ?? {}) };
    delete nextMetadata.imageAsset;

    const nextModel: CatalogModel = {
      id: modelId,
      name,
      price: draftPriceMode === "tiers" ? (draftTiers[0]?.price ?? fixedPrice) : fixedPrice,
      priceTiers: draftPriceMode === "tiers" ? draftTiers : undefined,
      methodIds: draftMethodIds,
      imageUrl: normalizedImageUrl || undefined,
      metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined,
    };

    try {
      let persistedModelId = modelId;
      let currentImageUrl =
        !draftImageFile &&
        !isInlineImageDataUrl(normalizedImageUrl) &&
        isManagedCatalogImageUrl(normalizedImageUrl, existingImageAsset)
          ? normalizedImageUrl || null
          : null;
      let currentMetadata: CatalogModelMetadata = { ...nextMetadata };
      
      if (editingModelId) {
        const { error } = await supabase
          .schema("tosho")
          .from("catalog_models")
          .update({
            name: nextModel.name,
            price: nextModel.price ?? null,
            image_url: currentImageUrl,
            metadata: Object.keys(currentMetadata).length > 0 ? currentMetadata : null,
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
            image_url: currentImageUrl,
            metadata: Object.keys(currentMetadata).length > 0 ? currentMetadata : null,
          })
          .select("id")
          .single();
          
        if (error || !data) throw error;
        persistedModelId = data.id as string;
      }

      let uploadedAssetPath: string | null = null;
      const shouldImportImageFromUrl =
        !draftImageFile &&
        Boolean(normalizedImageUrl) &&
        !isInlineImageDataUrl(normalizedImageUrl) &&
        !isManagedCatalogImageUrl(normalizedImageUrl, existingImageAsset);

      if (draftImageFile || shouldImportImageFromUrl) {
        try {
          if (draftImageFile) {
            const safeName = sanitizeFileName(draftImageFile.name);
            const storagePath = `teams/${teamId}/catalog-models/${persistedModelId}/${Date.now()}-${safeName}`;
            const uploadResult = await uploadAttachmentWithVariants({
              bucket: CATALOG_IMAGE_BUCKET,
              storagePath,
              file: draftImageFile,
              cacheControl: "31536000, immutable",
            });
            uploadedAssetPath = uploadResult.storagePath;
            const assetPayload = getCatalogAssetPayload(uploadResult.storagePath);
            currentImageUrl = assetPayload.imageUrl;
            currentMetadata = {
              ...nextMetadata,
              imageAsset: assetPayload.imageAsset,
            };
          } else if (shouldImportImageFromUrl) {
            const imported = await importCatalogImageFromUrl({
              sourceUrl: normalizedImageUrl,
              persistedModelId,
            });
            uploadedAssetPath = imported.storagePath;
            currentImageUrl = imported.assetPayload.imageUrl;
            currentMetadata = {
              ...nextMetadata,
              imageAsset: imported.assetPayload.imageAsset,
            };
          }
        } catch (uploadError) {
          if (!editingModelId) {
            await supabase
              .schema("tosho")
              .from("catalog_models")
              .delete()
              .eq("id", persistedModelId)
              .eq("team_id", teamId);
          }
          throw uploadError;
        }

        const { error } = await supabase
          .schema("tosho")
          .from("catalog_models")
          .update({
            image_url: currentImageUrl,
            metadata: currentMetadata,
          })
          .eq("id", persistedModelId)
          .eq("team_id", teamId);

        if (error) {
          if (uploadedAssetPath) {
            await removeAttachmentWithVariants(CATALOG_IMAGE_BUCKET, uploadedAssetPath);
          }
          if (!editingModelId) {
            await supabase
              .schema("tosho")
              .from("catalog_models")
              .delete()
              .eq("id", persistedModelId)
              .eq("team_id", teamId);
          }
          throw error;
        }
      } else if (!currentImageUrl && existingImageAsset?.bucket && existingImageAsset.path) {
        currentMetadata = {
          ...nextMetadata,
          imageAsset: null,
        };

        const { error } = await supabase
          .schema("tosho")
          .from("catalog_models")
          .update({
            image_url: null,
            metadata: currentMetadata,
          })
          .eq("id", persistedModelId)
          .eq("team_id", teamId);

        if (error) throw error;
      }

      // Update price tiers
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

      // Update methods
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

      // Update local state
      setCatalog((prevCatalog) => {
        const cleanedCatalog = prevCatalog.map((type) => ({
          ...type,
          kinds: type.kinds.map((kind) => ({
            ...kind,
            models: kind.models.filter((model) => model.id !== persistedModelId),
          })),
        }));

        return syncKindModelCounts(cleanedCatalog.map((type) => {
          if (type.id !== draftTypeId) return type;
          return {
            ...type,
            kinds: type.kinds.map((kind) => {
              if (kind.id !== draftKindId) return kind;
              return {
                ...kind,
                models: [
                  ...kind.models,
                  {
                    ...nextModel,
                    id: persistedModelId,
                    imageUrl: currentImageUrl ?? undefined,
                    metadata: Object.keys(currentMetadata).length > 0 ? currentMetadata : undefined,
                  },
                ],
              };
            }),
          };
        }));
      });

      if (
        existingImageAsset?.bucket &&
        existingImageAsset.path &&
        existingImageAsset.path !== uploadedAssetPath &&
        (draftImageFile || shouldImportImageFromUrl || !currentImageUrl)
      ) {
        void removeAttachmentWithVariants(existingImageAsset.bucket, existingImageAsset.path);
      }

      setDrawerOpen(false);
      setDraftImageFile(null);
      toast.success(editingModelId ? "Номенклатуру оновлено." : "Номенклатуру створено.");
    } catch (error) {
      console.error("save model failed", error);
      const message = getErrorMessage(error, "Не вдалося зберегти номенклатуру.");
      const normalized = message.toLowerCase();
      if (normalized.includes("catalog_models_kind_id_name_key") || normalized.includes("duplicate key")) {
        toast.error("У цьому виді вже є номенклатура з такою назвою.");
        return;
      }
      if (normalized.includes("foreign key") || normalized.includes("catalog_models_kind_id_fkey")) {
        toast.error("Обраний вид товару більше не існує. Оновіть сторінку та спробуйте ще раз.");
        return;
      }
      toast.error(getCatalogImportErrorMessage(error));
    } finally {
      setSavingModel(false);
    }
  };

  /**
   * Opens delete confirmation dialog
   */
  const confirmDeleteModel = (modelId: string) => {
    setModelToDelete(modelId);
    setDeleteDialogOpen(true);
  };

  /**
   * Deletes a model
   */
  const handleDeleteModel = async () => {
    if (!teamId || !modelToDelete) return;

    let imageAssetToRemove: CatalogModelMetadata["imageAsset"] | null = null;
    try {
      const model = await loadFullModelMedia(modelToDelete);
      imageAssetToRemove = ((model?.metadata as CatalogModelMetadata | null)?.imageAsset ?? null);
    } catch (error) {
      console.error("load model media before delete failed", error);
    }
    
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
      syncKindModelCounts(prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => ({
          ...kind,
          models: kind.models.filter((model) => model.id !== modelToDelete),
        })),
      })))
    );
    
    setDeleteDialogOpen(false);
    setDrawerOpen(false);
    setModelToDelete(null);

    if (imageAssetToRemove?.bucket && imageAssetToRemove.path) {
      void removeAttachmentWithVariants(imageAssetToRemove.bucket, imageAssetToRemove.path);
    }
  };

  /**
   * Clones an existing model
   */
  const handleCloneModel = async (modelId: string) => {
    if (!teamId) return;
    
    const item = allModelsWithContext.find((i) => i.model.id === modelId);
    if (!item) return;

    let sourcePriceTiers = item.model.priceTiers;
    if (sourcePriceTiers === undefined) {
      try {
        sourcePriceTiers = await loadPriceTiersForModel(item.model.id);
      } catch (error) {
        console.error("clone model load price tiers failed", error);
        sourcePriceTiers = [];
      }
    }

    const clonedModel: CatalogModel = {
      ...item.model,
      name: `${item.model.name} (копія)`,
      priceTiers: sourcePriceTiers && sourcePriceTiers.length > 0 ? sourcePriceTiers : undefined,
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
      
      await supabase
        .schema("tosho")
        .from("catalog_price_tiers")
        .insert(tierPayload);
    }

    if (clonedModel.methodIds && clonedModel.methodIds.length > 0) {
      const methodPayload = clonedModel.methodIds.map((methodId) => ({
        model_id: newModelId,
        method_id: methodId,
      }));
      
      await supabase
        .schema("tosho")
        .from("catalog_model_methods")
        .insert(methodPayload);
    }

    const nextModel = { ...clonedModel, id: newModelId };
    setCatalog((prev) =>
      syncKindModelCounts(prev.map((type) => {
        if (type.id !== item.typeId) return type;
        return {
          ...type,
          kinds: type.kinds.map((kind) => {
            if (kind.id !== item.kindId) return kind;
            return { ...kind, models: [...kind.models, nextModel] };
          }),
        };
      }))
    );
  };

  /**
   * Starts inline price editing
   */
  const startInlineEdit = (modelId: string, currentPrice: number) => {
    setInlineEditId(modelId);
    setInlinePrice(String(currentPrice));
  };

  /**
   * Saves inline price edit
   */
  const saveInlineEdit = async () => {
    if (!teamId || !inlineEditId) return;
    
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

  return {
    drawerOpen,
    setDrawerOpen,
    editingModelId,
    savingModel,
    deleteDialogOpen,
    setDeleteDialogOpen,
    modelToDelete,
    draftTypeId,
    setDraftTypeId,
    draftKindId,
    setDraftKindId,
    draftName,
    setDraftName,
    draftPriceMode,
    setDraftPriceMode,
    draftFixedPrice,
    setDraftFixedPrice,
    draftTiers,
    setDraftTiers,
    draftMethodIds,
    setDraftMethodIds,
    draftImageUrl,
    setDraftImageUrl: handleDraftImageUrlChange,
    draftMetadata,
    setDraftMetadata,
    imageUploadMode,
    setImageUploadMode: handleImageUploadModeChange,
    newMethodName,
    setNewMethodName,
    newMethodPrice,
    setNewMethodPrice,
    methodSaving,
    methodError,
    setMethodError,
    newPrintPositionName,
    setNewPrintPositionName,
    printPositionSaving,
    printPositionError,
    setPrintPositionError,
    inlineEditId,
    inlinePrice,
    setInlinePrice,
    openCreateDrawer,
    openEditDrawer,
    handleDraftTypeChange,
    handleDraftKindChange,
    handlePriceModeChange,
    updateDraftTier,
    addDraftTier,
    removeDraftTier,
    toggleDraftMethod,
    handleAddMethod,
    handleUpdateMethod,
    handleDeleteMethod,
    handleAddPrintPosition,
    handleDeletePrintPosition,
    handleUpdatePrintPosition,
    handleImageFileUpload,
    handleSaveModel,
    confirmDeleteModel,
    handleDeleteModel,
    handleCloneModel,
    startInlineEdit,
    saveInlineEdit,
  };
}
