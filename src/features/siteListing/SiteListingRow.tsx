import * as React from "react";
import { ChevronDown, ExternalLink, Link as LinkIcon, Loader2, Package, RotateCcw } from "@/components/icons/appIcons";
import { toast } from "sonner";

import { PoolPhoto } from "@/components/catalog/SupplierPoolRow";
import { KanbanImageZoomPreview } from "@/components/kanban";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pluralUk } from "@/lib/lastSeen";
import { TEXTILE_NOTE } from "@/lib/siteListing/description";
import type { DraftVariant, SiteListingDraft } from "@/lib/siteListing/types";
import { cn } from "@/lib/utils";

import { signedUrlForBatch } from "./importBatch";
import { useSiteCategories } from "./queries";
import {
  canTake,
  candidateTab,
  draftErrorText,
  draftView,
  fileCategory,
  priceCellText,
  priceLabel,
  takeBlockedReason,
  type SiteListingCandidate,
} from "./siteListingState";

/**
 * Рядок моделі в черзі «На сайт» (REQ-311#p4, спека §5): фото, назва
 * постачальника, кольорів N, ціна постачальника → наша, «новинка», розділ
 * постачальника, посилання на товар. Дії залежать від вкладки.
 *
 * ЧЕРНЕТКА ТУТ ЛИШЕ ДЛЯ ЧИТАННЯ (рішення 01.10.2026): вичитка тексту — у
 * Хорошопі. Виняток — розділ сайту, коли ні код, ні модель його не визначили:
 * без нього Хорошоп товар не імпортує.
 */

export type SiteListingRowActions = {
  decide: (candidate: SiteListingCandidate, decision: "take" | "skip" | null) => void;
  retryDraft: (itemId: string) => void;
  setCategory: (itemId: string, category: string) => void;
  returnToTake: (itemId: string) => void;
  busyItem: string | null;
};

const dateLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }) : "";

export function SiteListingRow({
  candidate,
  now,
  actions,
}: {
  candidate: SiteListingCandidate;
  now: number;
  actions: SiteListingRowActions;
}) {
  const [open, setOpen] = React.useState(false);
  const tab = candidateTab(candidate);
  const view = draftView(candidate, now);
  const busy = actions.busyItem !== null && actions.busyItem === (candidate.item_id ?? candidate.model_name);
  const price = priceLabel(candidate);
  const takeable = canTake(candidate);
  const blockedReason = takeBlockedReason(candidate);

  const copyBatchLink = async () => {
    if (!candidate.batch_id) return;
    try {
      const url = await signedUrlForBatch(candidate.batch_id);
      await navigator.clipboard.writeText(url);
      toast.success("Посилання на файл скопійовано — діє 7 днів.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Посилання не створилось.");
    }
  };

  return (
    <div className="rounded-lg transition-colors hover:bg-muted/40">
      <div className="flex flex-wrap items-center gap-3 px-2 py-2">
        {candidate.image_url ? (
          <KanbanImageZoomPreview
            imageUrl={candidate.image_url}
            alt={candidate.model_name}
            className="h-10 w-10 rounded-md border-border/50 bg-muted/50"
            imageClassName="object-cover"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/50">
            <PoolPhoto url={null} className="h-4 w-4" />
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-medium" title={candidate.model_name}>
              {candidate.model_name}
            </span>
            {candidate.is_new ? (
              <Badge tone="info" size="sm" className="shrink-0">
                Новинка
              </Badge>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {pluralUk(candidate.colors, "колір", "кольори", "кольорів")}
            {candidate.section ? ` · ${candidate.section}` : null}
            {candidate.category ? ` / ${candidate.category}` : null}
            {candidate.supplier_url ? (
              <>
                {" · "}
                <a
                  href={candidate.supplier_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
                >
                  у постачальника
                  <ExternalLink className="ml-0.5 inline h-3 w-3 align-[-2px]" aria-hidden="true" />
                </a>
              </>
            ) : null}
          </span>
        </span>

        <span
          className="shrink-0 text-xs tabular-nums text-muted-foreground"
          title={price ? "Роздріб постачальника → наша ціна (−1%, вниз до гривні)" : blockedReason ?? undefined}
        >
          {priceCellText(candidate)}
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          {tab === "new" ? (
            <>
              <Button
                size="xs"
                variant="primary"
                disabled={!takeable || busy}
                title={blockedReason ?? undefined}
                onClick={() => actions.decide(candidate, "take")}
              >
                Беремо
              </Button>
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => actions.decide(candidate, "skip")}>
                Не беремо
              </Button>
            </>
          ) : null}

          {tab === "take" ? (
            <>
              {view === "pending" ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Готується…
                </span>
              ) : null}
              {view === "failed" && candidate.item_id ? (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  onClick={() => candidate.item_id && actions.retryDraft(candidate.item_id)}
                >
                  <RotateCcw aria-hidden="true" />
                  Спробувати ще
                </Button>
              ) : null}
              {view === "ready" ? (
                <Button size="xs" variant="ghost" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                  Чернетка
                  <ChevronDown className={cn("transition-transform", open && "rotate-180")} aria-hidden="true" />
                </Button>
              ) : null}
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => actions.decide(candidate, "skip")}>
                Не беремо
              </Button>
            </>
          ) : null}

          {tab === "file" && candidate.item_id ? (
            <>
              <span className="text-xs text-muted-foreground">У файлі з {dateLabel(candidate.batch_created_at)}</span>
              <Button size="xs" variant="ghost" onClick={() => void copyBatchLink()}>
                <LinkIcon aria-hidden="true" />
                Посилання
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                onClick={() => candidate.item_id && actions.returnToTake(candidate.item_id)}
              >
                Повернути в Беремо
              </Button>
            </>
          ) : null}

          {tab === "skip" ? (
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => actions.decide(candidate, null)}>
              Повернути
            </Button>
          ) : null}
        </span>
      </div>

      {tab === "take" && view === "failed" ? (
        <p className="px-2 pb-2 pl-15 text-xs text-destructive">{draftErrorText(candidate)}</p>
      ) : null}

      {tab === "take" && view === "ready" && candidate.item_id && !fileCategory(candidate) ? (
        <CategoryPicker itemId={candidate.item_id} onPick={actions.setCategory} />
      ) : null}

      {open && view === "ready" && candidate.draft ? (
        <DraftView draft={candidate.draft} category={fileCategory(candidate)} />
      ) : null}
    </div>
  );
}

function CategoryPicker({ itemId, onPick }: { itemId: string; onPick: (itemId: string, category: string) => void }) {
  const categories = useSiteCategories(true);
  return (
    <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pl-15">
      <span className="text-xs text-warning-foreground">Розділ сайту не визначено — без нього модель у файл не йде.</span>
      <Select onValueChange={(value) => onPick(itemId, value)}>
        <SelectTrigger controlSize="sm" className="w-72 text-xs" aria-label="Розділ сайту">
          <SelectValue placeholder={categories.isPending ? "Завантажую розділи…" : "Вибрати розділ"} />
        </SelectTrigger>
        <SelectContent>
          {(categories.data ?? []).map((path) => (
            <SelectItem key={path} value={path} className="text-xs">
              {path}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Колір чернетки: перше фото (воно стане «Фото» в Хорошопі), назва кольору
 * сайту й ціна. Наведення збільшує фото — той самий KanbanImageZoomPreview, що
 * в прорахунках і дизайн-задачах. «N фото» — скільки піде в «Галерею» разом із
 * головним.
 */
function DraftVariantTile({ title, variant }: { title: string; variant: DraftVariant }) {
  const photo = variant.images[0] ?? null;
  return (
    <div
      className="flex w-48 items-center gap-2 rounded-md border border-border/50 bg-background/60 p-1.5"
      title={`${variant.color} · ${variant.article}`}
    >
      {photo ? (
        <KanbanImageZoomPreview
          imageUrl={photo}
          alt={`${title}, ${variant.color}`}
          className="h-10 w-10 rounded-md border-border/50 bg-muted/30"
          imageClassName="object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/30">
          <Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{variant.color}</span>
        <span className="block tabular-nums text-muted-foreground">
          {variant.price} грн
          {variant.images.length > 1 ? ` · ${variant.images.length} фото` : null}
        </span>
      </span>
    </div>
  );
}

/** Чернетка тими самими блоками, що й опис на сайті, але розміткою CRM. */
function DraftView({ draft, category }: { draft: SiteListingDraft; category: string | null }) {
  return (
    <div className="mx-2 mb-2 ml-15 space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
      <div>
        <p className="text-sm font-semibold text-foreground">{draft.title}</p>
        <p className="text-muted-foreground">{category ?? "Розділ не визначено"}</p>
      </div>
      <div className="space-y-1 text-foreground">
        {draft.intro.map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
        {draft.colorsSentence ? <p>{draft.colorsSentence}</p> : null}
      </div>
      {draft.bullets.length > 0 ? (
        <ul className="space-y-0.5 text-foreground">
          {draft.bullets.map((bullet) => (
            <li key={bullet}>• {bullet}</li>
          ))}
        </ul>
      ) : null}
      {draft.sizeTable ? (
        <table className="text-2xs">
          <tbody>
            <tr>
              <th className="pr-2 text-left font-medium">Розмір</th>
              {draft.sizeTable.sizes.map((size) => (
                <th key={size} className="px-1.5 font-medium">
                  {size}
                </th>
              ))}
            </tr>
            {draft.sizeTable.rows.map((row) => (
              <tr key={row.label}>
                <td className="pr-2 text-muted-foreground">{row.label}</td>
                {row.values.map((value, index) => (
                  <td key={`${row.label}-${index}`} className="px-1.5 text-center tabular-nums">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {draft.care ? <p className="italic">{draft.care}</p> : null}
      {draft.textile ? <p className="italic">{TEXTILE_NOTE}</p> : null}
      {draft.methods ? (
        <p>
          <span className="font-semibold">Тип нанесення:</span> {draft.methods}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        {draft.variants.map((variant) => (
          <DraftVariantTile key={variant.article} title={draft.title} variant={variant} />
        ))}
      </div>
      {draft.noSupplierDescription || draft.warnings.length > 0 ? (
        <ul className="space-y-0.5 text-warning-foreground">
          {draft.noSupplierDescription ? <li>Опису в постачальника немає — текст складено з характеристик.</li> : null}
          {draft.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
