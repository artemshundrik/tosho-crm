import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StorageObjectImage } from "@/components/app/StorageObjectImage";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Palette,
} from "@/components/icons/appIcons";
import { formatOrderDate, type DerivedOrderRecord, type OrderDesignAsset } from "@/features/orders/orderRecords";
import {
  getFileExtensionFromStoragePath,
  getSignedAttachmentDownloadUrl,
  getSignedAttachmentUrl,
  isRasterPreviewableFile,
  isServerPreviewableStoragePath,
} from "@/lib/attachmentPreview";
import { downloadFileToDevice } from "@/lib/downloadFileToDevice";
import { cn } from "@/lib/utils";

/**
 * Вкладка «Матеріали»: стан дизайну й затверджені візуал і макет. Ручне
 * замовлення без прорахунку не має дизайн-задачі — тоді вкладка каже це прямо.
 *
 * Файли показуються мініатюрами, а клік відкриває перегляд тут же, у вікні, з
 * гортанням між усіма матеріалами замовлення. Раніше був лише рядок з назвою й
 * «Відкрити» в новій вкладці — щоб звірити макет з візуалом, доводилось
 * відкривати файли по одному.
 */

type StoredAsset = OrderDesignAsset & { storageBucket: string; storagePath: string };

const isStoredFile = (asset: OrderDesignAsset): asset is StoredAsset =>
  asset.kind === "file" && Boolean(asset.storageBucket && asset.storagePath);

/** Чи є в сховищі картинка-прев'ю: растр або PDF/TIFF, для яких її робить сервер. */
const isRaster = (asset: StoredAsset) =>
  isRasterPreviewableFile({ type: asset.mimeType ?? "", name: asset.storagePath });

const hasImagePreview = (asset: StoredAsset) => isRaster(asset) || isServerPreviewableStoragePath(asset.storagePath);

function AssetTile({
  asset,
  opening,
  onClick,
}: {
  asset: OrderDesignAsset;
  opening: boolean;
  onClick: () => void;
}) {
  const stored = isStoredFile(asset) ? asset : null;
  const extension = stored ? getFileExtensionFromStoragePath(stored.storagePath).toUpperCase() : "";
  const meta = [asset.kind === "link" ? "Посилання" : extension || "Файл", asset.createdAt ? formatOrderDate(asset.createdAt) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={opening || (!asset.url && !stored)}
      title={asset.label}
      className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background text-left transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="relative aspect-[4/3] w-full border-b border-border/50 bg-muted/20">
        {stored && hasImagePreview(stored) ? (
          <StorageObjectImage
            bucket={stored.storageBucket}
            path={stored.storagePath}
            alt={asset.label}
            variant="thumb"
            className="h-full w-full"
            imageClassName="p-2"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground">
            <div className="flex flex-col items-center gap-1.5">
              {asset.kind === "link" ? <Link2 className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
              {extension ? <span className="figure text-xs font-semibold">{extension}</span> : null}
            </div>
          </div>
        )}
        {opening ? (
          <div className="absolute inset-0 grid place-items-center bg-background/60">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>
      <div className="min-w-0 px-2.5 py-2">
        <div className="truncate text-xs font-medium text-foreground">{asset.label}</div>
        <div className="mt-0.5 truncate text-3xs text-muted-foreground">{meta}</div>
      </div>
    </button>
  );
}

function DesignAssetGrid({
  title,
  assets,
  openingAssetId,
  onSelect,
}: {
  title: string;
  assets: OrderDesignAsset[];
  openingAssetId: string | null;
  onSelect: (asset: OrderDesignAsset) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <Badge variant="outline" className="rounded-full px-2 py-0 text-3xs">
          {assets.length}
        </Badge>
      </div>
      {assets.length === 0 ? (
        <div className="mt-2 text-sm text-muted-foreground">Немає погоджених матеріалів</div>
      ) : (
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2">
          {assets.map((asset) => (
            <AssetTile
              key={`${title}:${asset.id}`}
              asset={asset}
              opening={openingAssetId === asset.id}
              onClick={() => onSelect(asset)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type ViewerItem = { asset: StoredAsset; group: string };

function MaterialViewer({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: ViewerItem[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<"open" | "download" | null>(null);
  const current = index === null ? null : items[index] ?? null;
  const canStep = items.length > 1;
  const step = (delta: number) => {
    if (index === null || !canStep) return;
    onIndexChange((index + delta + items.length) % items.length);
  };

  const openOriginal = async () => {
    if (!current) return;
    setBusy("open");
    try {
      const url = await getSignedAttachmentUrl(current.asset.storageBucket, current.asset.storagePath, "original", 60 * 60);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    if (!current) return;
    setBusy("download");
    try {
      const url = await getSignedAttachmentDownloadUrl(
        current.asset.storageBucket,
        current.asset.storagePath,
        current.asset.label
      );
      if (url) await downloadFileToDevice(url, current.asset.label);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={Boolean(current)} onOpenChange={(open) => !open && onClose()}>
      {/* Перегляд, не форма: зберігати нема чого, тож закривається без питань. */}
      <DialogContent
        dismissible
        className="max-h-[94vh] w-[min(96vw,1100px)] max-w-none gap-0 overflow-hidden p-0"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") step(-1);
          if (event.key === "ArrowRight") step(1);
        }}
      >
        {current ? (
          <>
            <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3 pr-12">
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-sm">{current.asset.label}</DialogTitle>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {current.group}
                  {canStep ? <span className="figure"> · {(index ?? 0) + 1} з {items.length}</span> : null}
                </div>
              </div>
            </div>
            <div className="relative bg-muted/15">
              <StorageObjectImage
                key={current.asset.id}
                bucket={current.asset.storageBucket}
                path={current.asset.storagePath}
                alt={current.asset.label}
                // Растр — оригіналом: прев'ю зменшене, і дрібний текст на
                // візуалі (розміри, тираж) у ньому не читається. PDF і TIFF
                // браузер не малює — для них лишається серверне прев'ю.
                variant={isRaster(current.asset) ? "original" : "preview"}
                className="h-[min(62vh,700px)] w-full bg-transparent"
                imageClassName="p-3"
              />
              {canStep ? (
                <>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Попередній файл"
                    onClick={() => step(-1)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/90"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Наступний файл"
                    onClick={() => step(1)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/90"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
            </div>
            {canStep ? (
              <div className="flex flex-none gap-2 overflow-x-auto border-t border-border/60 px-4 py-2.5">
                {items.map((item, itemIndex) => (
                  <button
                    key={item.asset.id}
                    type="button"
                    aria-label={item.asset.label}
                    aria-current={itemIndex === index}
                    onClick={() => onIndexChange(itemIndex)}
                    className={cn(
                      "h-14 w-14 flex-none overflow-hidden rounded-md border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      itemIndex === index ? "border-foreground" : "border-border/60 opacity-70 hover:opacity-100"
                    )}
                  >
                    <StorageObjectImage
                      bucket={item.asset.storageBucket}
                      path={item.asset.storagePath}
                      alt=""
                      variant="thumb"
                      className="h-full w-full"
                      imageClassName="p-1"
                    />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 px-4 py-3">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy !== null} onClick={() => void openOriginal()}>
                {busy === "open" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                Відкрити оригінал
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy !== null} onClick={() => void download()}>
                {busy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Завантажити
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export const countOrderMaterials = (record: DerivedOrderRecord) =>
  record.approvedVisualizationAssets.length + record.approvedLayoutAssets.length;

export function OrderMaterialsTab({
  record,
  openingAssetId,
  onOpenAsset,
  onOpenDesignTask,
}: {
  record: DerivedOrderRecord;
  openingAssetId: string | null;
  onOpenAsset: (asset: OrderDesignAsset) => void;
  onOpenDesignTask: (designTaskId: string) => void;
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const designHeadline = !record.requiresDesignApproval
    ? "Дизайн не потрібен"
    : record.hasApprovedVisualization && record.hasApprovedLayout
      ? "Візуал і макет затверджені"
      : "Потрібна дія по дизайну";
  const designNote =
    record.designStatuses.join(", ") ||
    (record.requiresDesignApproval ? "Задачі дизайну не знайдені" : "Товар без нанесення");

  // Гортаються лише файли з картинкою-прев'ю; .ai, .cdr і посилання
  // відкриваються окремо, як раніше.
  const viewerItems: ViewerItem[] = [
    ...record.approvedVisualizationAssets.map((asset) => ({ asset, group: "Візуал" })),
    ...record.approvedLayoutAssets.map((asset) => ({ asset, group: "Макет" })),
  ].flatMap(({ asset, group }) => (isStoredFile(asset) && hasImagePreview(asset) ? [{ asset, group }] : []));

  const handleSelect = (asset: OrderDesignAsset) => {
    const index = viewerItems.findIndex((item) => item.asset.id === asset.id);
    if (index >= 0) setViewerIndex(index);
    else onOpenAsset(asset);
  };

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4" aria-label="Затверджені матеріали">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Palette className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-sm font-semibold text-foreground">{designHeadline}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{designNote}</div>
          </div>
        </div>
        {record.designTaskId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => onOpenDesignTask(record.designTaskId!)}
          >
            {record.designTaskNumber || "Дизайн-задача"}
          </Button>
        ) : null}
      </div>
      <div className="mt-4 space-y-5">
        <DesignAssetGrid
          title="Візуал"
          assets={record.approvedVisualizationAssets}
          openingAssetId={openingAssetId}
          onSelect={handleSelect}
        />
        <DesignAssetGrid
          title="Макет"
          assets={record.approvedLayoutAssets}
          openingAssetId={openingAssetId}
          onSelect={handleSelect}
        />
      </div>
      <MaterialViewer
        items={viewerItems}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </section>
  );
}
