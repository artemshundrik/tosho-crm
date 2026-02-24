/**
 * MethodsSection Component
 * 
 * Methods selection and management: add new methods and select available ones
 */

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AlertCircle, Coins, Plus } from "lucide-react";
import type { CatalogMethod } from "@/types/catalog";

interface MethodsSectionProps {
  draftKindId: string;
  draftKindName?: string;
  availableMethods: CatalogMethod[];
  selectedMethodIds: string[];
  newMethodName: string;
  newMethodPrice: string;
  methodSaving: boolean;
  methodError: string | null;
  onMethodNameChange: (value: string) => void;
  onMethodPriceChange: (value: string) => void;
  onAddMethod: () => void;
  onToggleMethod: (methodId: string) => void;
}

export function MethodsSection({
  draftKindId,
  draftKindName,
  availableMethods,
  selectedMethodIds,
  newMethodName,
  newMethodPrice,
  methodSaving,
  methodError,
  onMethodNameChange,
  onMethodPriceChange,
  onAddMethod,
  onToggleMethod,
}: MethodsSectionProps) {
  void newMethodPrice;
  void onMethodPriceChange;
  return (
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
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Назва методу</Label>
                <Input
                  value={newMethodName}
                  onChange={(e) => onMethodNameChange(e.target.value)}
                  placeholder="Напр. DTF"
                  className="bg-background/60 border-border/60"
                />
              </div>
              <Button
                onClick={() => onAddMethod()}
                disabled={!newMethodName.trim() || methodSaving}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                {methodSaving ? "Додавання..." : "Додати метод"}
              </Button>
            </div>
            {methodError && <div className="mt-2 text-xs text-destructive">{methodError}</div>}
          </div>

          {availableMethods.length === 0 ? (
            <div className="text-sm text-muted-foreground/60 py-8 border-2 border-dashed rounded-xl text-center bg-muted/10 flex flex-col items-center gap-3">
              <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
              <p>У виді "{draftKindName}" ще немає методів</p>
            </div>
          ) : null}

          {availableMethods.map((method) => {
            const isSelected = selectedMethodIds.includes(method.id);
            return (
              <label
                key={method.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all duration-200",
                  isSelected
                    ? "border-primary/50 bg-gradient-to-r from-primary/10 to-primary/5 shadow-md shadow-primary/10"
                    : "border-border/40 bg-card/50 hover:bg-muted/20 hover:border-border/60"
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleMethod(method.id)}
                />
                <span className={cn("text-sm font-medium", isSelected && "text-primary")}>
                  {method.name}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
