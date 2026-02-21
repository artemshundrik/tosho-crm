/**
 * PricingSection Component
 * 
 * Pricing configuration: fixed price or tiered pricing with multiple levels
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { Layers, Plus, Trash2 } from "lucide-react";
import type { CatalogPriceTier, PriceMode } from "@/types/catalog";

interface PricingSectionProps {
  draftPriceMode: PriceMode;
  draftFixedPrice: string;
  draftTiers: CatalogPriceTier[];
  onPriceModeChange: (mode: PriceMode) => void;
  onFixedPriceChange: (value: string) => void;
  onTierUpdate: (id: string, patch: Partial<CatalogPriceTier>) => void;
  onAddTier: () => void;
  onRemoveTier: (id: string) => void;
}

export function PricingSection({
  draftPriceMode,
  draftFixedPrice,
  draftTiers,
  onPriceModeChange,
  onFixedPriceChange,
  onTierUpdate,
  onAddTier,
  onRemoveTier,
}: PricingSectionProps) {
  void draftFixedPrice;
  void onFixedPriceChange;
  return (
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
          onValueChange={(v) => v && onPriceModeChange(v as PriceMode)}
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
          <p className="text-sm text-muted-foreground">
            Фіксована ціна буде встановлюватись під час створення прорахунку замовлення.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/40 bg-gradient-to-br from-muted/10 to-transparent overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_48px] gap-3 px-5 py-3 bg-muted/30 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <div>Від (шт.)</div>
            <div>До (шт.)</div>
            <div></div>
          </div>
          <div className="p-3 space-y-2.5">
            {draftTiers.map((tier, index) => (
              <div
                key={tier.id}
                className="grid grid-cols-[1fr_1fr_48px] gap-3 items-center relative group"
              >
                {index > 0 && (
                  <div className="absolute left-[48%] top-[-14px] h-5 w-0.5 bg-gradient-to-b from-border/30 to-border/60 -z-10"></div>
                )}

                <Input
                  type="number"
                  className="h-10 text-center font-medium bg-background/80 border-border/50"
                  value={tier.min}
                  onChange={(e) =>
                    onTierUpdate(tier.id, { min: Math.max(1, Number(e.target.value) || 1) })
                  }
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
                    onTierUpdate(tier.id, {
                      max: val === "" || val === "0" ? null : Math.max(tier.min, Number(val)),
                    });
                  }}
                />

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                  onClick={() => onRemoveTier(tier.id)}
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
              onClick={onAddTier}
            >
              <Plus className="h-4 w-4 mr-2" /> Додати рівень
            </Button>
          </div>
          <div className="px-5 pb-4">
            <p className="text-xs text-muted-foreground italic">
              Ціни для кожного тиражу будуть встановлюватись під час створення прорахунку замовлення.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
