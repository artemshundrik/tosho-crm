/**
 * BasicInfoTab Component
 * 
 * Basic information section: photo, type, kind, and model name
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Image as ImageIcon, Link2, Upload, X } from "lucide-react";
import type { CatalogModelMetadata, CatalogType, ImageUploadMode } from "@/types/catalog";
import * as React from "react";

interface BasicInfoTabProps {
  catalog: CatalogType[];
  draftTypeId: string;
  draftKindId: string;
  draftName: string;
  draftImageUrl: string;
  draftMetadata: CatalogModelMetadata;
  imageUploadMode: ImageUploadMode;
  onTypeChange: (value: string) => void;
  onKindChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onMetadataChange: (value: CatalogModelMetadata) => void;
  onImageUrlChange: (value: string) => void;
  onImageUploadModeChange: (value: ImageUploadMode) => void;
  onImageFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function BasicInfoTab({
  catalog,
  draftTypeId,
  draftKindId,
  draftName,
  draftImageUrl,
  draftMetadata,
  imageUploadMode,
  onTypeChange,
  onKindChange,
  onNameChange,
  onMetadataChange,
  onImageUrlChange,
  onImageUploadModeChange,
  onImageFileUpload,
}: BasicInfoTabProps) {
  const draftKinds = catalog.find((t) => t.id === draftTypeId)?.kinds ?? [];
  const draftType = catalog.find((t) => t.id === draftTypeId);
  const showConfiguratorPreset = draftType?.quote_type === "print";
  const [imageErrored, setImageErrored] = React.useState(false);

  React.useEffect(() => {
    setImageErrored(false);
  }, [draftImageUrl]);

  const showImagePreview = Boolean(draftImageUrl) && !imageErrored;

  return (
    <div className="space-y-8">
      {/* Photo */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2">
          <div className="h-1 w-1 rounded-full bg-purple-500"></div>
          <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> Фото моделі
          </h3>
        </div>

        <div className="flex gap-4">
          <div className="relative group">
            {showImagePreview ? (
              <img
                src={draftImageUrl}
                alt="Preview"
                className="w-32 h-32 rounded-xl object-cover border-2 border-border/60"
                onError={() => setImageErrored(true)}
              />
            ) : (
              <div className="w-32 h-32 rounded-xl border-2 border-dashed border-border/60 bg-muted/20 flex flex-col items-center justify-center text-center px-3">
                <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                  Немає фото
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground/60">
                  Додайте URL або файл
                </div>
              </div>
            )}
            {draftImageUrl ? (
              <button
                onClick={() => onImageUrlChange("")}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          <div className="flex-1 space-y-3">
            <ToggleGroup
              type="single"
              value={imageUploadMode}
              onValueChange={(v) => v && onImageUploadModeChange(v as ImageUploadMode)}
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
                onChange={(e) => onImageUrlChange(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="bg-background/60 border-border/60"
              />
            ) : (
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={onImageFileUpload}
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
            <Select value={draftTypeId} onValueChange={onTypeChange}>
              <SelectTrigger className="bg-background/60 border-border/60">
                <SelectValue placeholder="Оберіть тип" />
              </SelectTrigger>
              <SelectContent>
                {catalog.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Вид товару</Label>
            <Select value={draftKindId} onValueChange={onKindChange} disabled={!draftTypeId}>
              <SelectTrigger className="bg-background/60 border-border/60">
                <SelectValue placeholder={draftTypeId ? "Оберіть вид" : "Спочатку тип"} />
              </SelectTrigger>
              <SelectContent>
                {draftKinds.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.name}
                  </SelectItem>
                ))}
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
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Напр. Malfini Basic 160"
            className="bg-background/60 border-border/60"
          />
        </div>
        {showConfiguratorPreset ? (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Preset конфігуратора</Label>
            <Select
              value={draftMetadata.configuratorPreset ?? "none"}
              onValueChange={(value) =>
                onMetadataChange({
                  ...draftMetadata,
                  configuratorPreset:
                    value === "none"
                      ? null
                      : (value as "print_package" | "print_notebook" | "print_note_blocks"),
                })
              }
            >
              <SelectTrigger className="bg-background/60 border-border/60">
                <SelectValue placeholder="Без додаткового конфігуратора" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без додаткового конфігуратора</SelectItem>
                <SelectItem value="print_package">Паперовий пакет</SelectItem>
                <SelectItem value="print_notebook">Блокнот</SelectItem>
                <SelectItem value="print_note_blocks">Блоки для записів</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
    </div>
  );
}
