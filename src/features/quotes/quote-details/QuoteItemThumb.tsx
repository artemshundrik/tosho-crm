import { Package } from "lucide-react";

import { KanbanImageZoomPreview } from "@/components/kanban";
import { PrintModelArt } from "@/features/quotes/quote-wizard/printModelArt";

/**
 * Мініатюра позиції на картці прорахунку.
 *
 * Три випадки, і порядок між ними важливий. Виріб, який ми ВИРОБЛЯЄМО (у
 * моделі стоїть `specPreset`), малюється тією самою річчю, що й у рейці вибору:
 * фото в нього немає й не буде — купувати нічого, — а загальна коробка не
 * казала, що саме рахують. Далі йде фото товару, і вже за ним — коробка як
 * остання відповідь «зображення немає».
 *
 * Живе окремим модулем, а не всередині сторінки: `QuoteDetailsPage` під
 * ратчетом розміру, і кожен новий випадок мініатюри ріс би саме там.
 */

export type QuoteItemThumbProps = {
  /** `metadata.specPreset` моделі каталогу — наш виріб. */
  specPreset: string | null;
  preview: { url: string; zoomUrl: string } | null;
  alt: string;
};

export function QuoteItemThumb({ specPreset, preview, alt }: QuoteItemThumbProps) {
  if (specPreset) {
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-border/50 bg-muted/40 text-foreground/75">
        <PrintModelArt presetKey={specPreset} className="h-12 w-12" />
      </div>
    );
  }

  if (preview) {
    return (
      <KanbanImageZoomPreview
        imageUrl={preview.url}
        zoomImageUrl={preview.zoomUrl}
        alt={alt}
        loadStrategy="eager"
        className="h-20 w-20 rounded-xl border-border/50 bg-muted/20 ring-1 ring-border/50 [&>div]:rounded-xl"
        imageClassName="object-cover"
      />
    );
  }

  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-border/50 bg-muted">
      <Package className="h-6 w-6 text-muted-foreground/50" />
    </div>
  );
}
