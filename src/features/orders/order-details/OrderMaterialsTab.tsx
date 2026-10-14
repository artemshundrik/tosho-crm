import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Palette } from "@/components/icons/appIcons";
import { formatOrderDate, type DerivedOrderRecord, type OrderDesignAsset } from "@/features/orders/orderRecords";

/**
 * Вкладка «Матеріали»: стан дизайну й затверджені візуал і макет. Ручне
 * замовлення без прорахунку не має дизайн-задачі — тоді вкладка каже це прямо.
 */
function DesignAssetList({
  title,
  assets,
  openingAssetId,
  onOpenAsset,
}: {
  title: string;
  assets: OrderDesignAsset[];
  openingAssetId: string | null;
  onOpenAsset: (asset: OrderDesignAsset) => void;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/[0.04] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <Badge variant="outline" className="rounded-full px-2 py-0 text-3xs">
          {assets.length}
        </Badge>
      </div>
      {assets.length === 0 ? (
        <div className="mt-2 text-sm text-muted-foreground">Немає погоджених матеріалів</div>
      ) : (
        <div className="mt-2 space-y-2">
          {assets.map((asset) => (
            <div
              key={`${title}:${asset.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/80 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{asset.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {asset.kind === "file" ? "Файл" : "Посилання"}
                  {asset.createdAt ? ` • ${formatOrderDate(asset.createdAt)}` : ""}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpenAsset(asset)}
                disabled={
                  openingAssetId === asset.id ||
                  (!asset.url && !(asset.kind === "file" && asset.storageBucket && asset.storagePath))
                }
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {openingAssetId === asset.id ? "Відкриваємо..." : "Відкрити"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
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
  const designHeadline = !record.requiresDesignApproval
    ? "Дизайн не потрібен"
    : record.hasApprovedVisualization && record.hasApprovedLayout
      ? "Візуал і макет затверджені"
      : "Потрібна дія по дизайну";
  const designNote =
    record.designStatuses.join(", ") ||
    (record.requiresDesignApproval ? "Задачі дизайну не знайдені" : "Товар без нанесення");

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
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <DesignAssetList
          title="Візуал"
          assets={record.approvedVisualizationAssets}
          openingAssetId={openingAssetId}
          onOpenAsset={onOpenAsset}
        />
        <DesignAssetList
          title="Макет"
          assets={record.approvedLayoutAssets}
          openingAssetId={openingAssetId}
          onOpenAsset={onOpenAsset}
        />
      </div>
    </section>
  );
}
