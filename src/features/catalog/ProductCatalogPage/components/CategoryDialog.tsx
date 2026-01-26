/**
 * CategoryDialog Component
 * 
 * Dialog for creating new catalog types and kinds (categories and subcategories)
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderPlus, Tag } from "lucide-react";
import type { CatalogType, CategoryMode, QuoteType } from "@/types/catalog";

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CategoryMode;
  catalog: CatalogType[];
  categoryName: string;
  onCategoryNameChange: (value: string) => void;
  quoteType: QuoteType;
  onQuoteTypeChange: (value: QuoteType) => void;
  selectedTypeForKind: string;
  onSelectedTypeForKindChange: (value: string) => void;
  categorySaving: boolean;
  categoryError: string | null;
  onSave: () => void;
}

export function CategoryDialog({
  open,
  onOpenChange,
  mode,
  catalog,
  categoryName,
  onCategoryNameChange,
  quoteType,
  onQuoteTypeChange,
  selectedTypeForKind,
  onSelectedTypeForKindChange,
  categorySaving,
  categoryError,
  onSave,
}: CategoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden border border-border/60 bg-card text-foreground top-1/2 translate-y-[-50%]">
        <div className="px-6 pt-6 pb-4 border-b border-border/40 bg-muted/5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              {mode === "type" ? <FolderPlus className="h-5 w-5" /> : <Tag className="h-5 w-5" />}
              {mode === "type" ? "Додати нову категорію" : "Додати новий вид"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground/90">
              {mode === "type"
                ? "Створіть нову категорію товарів (наприклад: Одяг, Аксесуари)"
                : "Додайте новий вид у вибрану категорію"}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="px-6 py-4 space-y-4">
          {mode === "kind" && (
            <div className="space-y-2">
              <Label>Категорія</Label>
              <Select value={selectedTypeForKind} onValueChange={onSelectedTypeForKindChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Оберіть категорію" />
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
          )}
          {mode === "type" && (
            <div className="space-y-2">
              <Label>Тип прорахунку</Label>
              <Select
                value={quoteType}
                onValueChange={(v) => onQuoteTypeChange(v as QuoteType)}
              >
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
            <Label>Назва {mode === "type" ? "категорії" : "виду"}</Label>
            <Input
              value={categoryName}
              onChange={(e) => onCategoryNameChange(e.target.value)}
              placeholder={mode === "type" ? "Наприклад: Сумки" : "Наприклад: Шопери"}
              onKeyDown={(e) => e.key === "Enter" && onSave()}
              autoFocus
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border/40 bg-muted/5">
          <DialogFooter className="gap-3 sm:gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button
              onClick={onSave}
              disabled={
                !categoryName.trim() || (mode === "kind" && !selectedTypeForKind) || categorySaving
              }
            >
              {categorySaving ? "Додавання..." : "Додати"}
            </Button>
          </DialogFooter>
          {categoryError && <div className="mt-2 text-xs text-destructive">{categoryError}</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
