import * as React from "react";

import { KidsBadge } from "@/components/catalog/SupplierPoolRow";
import { SupplierVariantTiles } from "@/components/catalog/SupplierVariantTiles";
import { ExternalLink, Trash2, AlertTriangle, Briefcase } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { grossFromNet, nearestExactNetPrices } from "@/features/orders/orderExecutor";
import { parseMoneyInput } from "@/features/orders/orderInvoice";
import { orderItemSources } from "@/features/orders/orderItemMetadata";
import { formatOrderMoney, formatOrderMoneyExact } from "@/features/orders/orderRecords";
import { ImprintChips, type PlaceOption } from "@/features/quotes/quote-details/ImprintChips";
import { getImprintSheet } from "@/features/quotes/quote-details/imprintSheets";
import { KindChip, KindImprintDoor, type KindOption } from "@/features/quotes/quote-details/KindChip";
import type { MethodDirectorySource } from "@/features/quotes/quote-details/useKindImprintOptions";
import { ImportItemPhoto } from "@/features/quotes/quote-import/ImportDraftRow";
import type { QuoteImportDraftImprint, QuoteImportLinkPreview } from "@/features/quotes/quote-import/types";
import { catalogPlace } from "@/features/quotes/quote-wizard/catalogPlace";
import { CatalogPlaceChip } from "@/features/quotes/quote-wizard/CatalogPlaceChip";
import type { SupplierPoolVariant } from "@/lib/supplierPool";
import { cn } from "@/lib/utils";

import { needsColorChoice, type ManualOrderDraftItem, type ManualOrderDraftService } from "./manualOrderDraft";

export const UNIT_OPTIONS = ["шт.", "компл.", "уп.", "пара", "м", "м²", "кг", "год"];

/** Те саме число, що рахують суми: «322,50» і «1 200» з поля. */
export const amountOf = (raw: string) => parseMoneyInput(raw) ?? 0;

/** Поле, до якого привів натиск «Створити». Знімається саме, щойно пропуск заповнено. */
export const issueRing = (active: boolean) => (active ? "rounded-lg ring-2 ring-destructive/50" : undefined);

const formatHintAmount = (value: number) =>
  value.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hintCurrency = (code: string) => (code === "UAH" ? "грн" : code);

/**
 * Під полем ціни без ПДВ: скільки це з ПДВ, а якщо ціна з ПДВ не виходить рівно
 * до копійки (бухгалтерія не округлює) — дві найближчі точні.
 */
export function NetPriceHint({ entered, active, currency }: { entered: string; active: boolean; currency: string }) {
  const net = amountOf(entered);
  if (!active || net <= 0) return null;
  const nearest = nearestExactNetPrices(net);
  if (nearest) {
    return (
      <div className="text-2xs leading-tight text-warning-foreground">
        З ПДВ не ділиться до копійки: візьміть {formatOrderMoneyExact(nearest.down, currency)} або{" "}
        {formatOrderMoneyExact(nearest.up, currency)}
      </div>
    );
  }
  return (
    <div className="text-2xs leading-tight text-muted-foreground">
      з ПДВ {formatOrderMoneyExact(grossFromNet(net, true), currency)}
    </div>
  );
}

type ImprintOptions = {
  methods: Array<{ id: string; name: string }>;
  places: PlaceOption[];
  directory?: MethodDirectorySource;
};

export function ManualOrderItemRow({
  draft,
  preview,
  currency,
  pricesExclVat,
  disabled,
  issueId,
  kindOptions,
  imprintOptions,
  onPatch,
  onRemove,
  onPickColor,
  onChangeKind,
  onChangeImprints,
}: {
  draft: ManualOrderDraftItem;
  preview: QuoteImportLinkPreview | undefined;
  currency: string;
  pricesExclVat: boolean;
  disabled?: boolean;
  /** Який пропуск зараз підсвічено у вікні. */
  issueId: string | null;
  kindOptions: KindOption[];
  /** Немає — вид ще не обрано або його методи ще їдуть. */
  imprintOptions?: ImprintOptions;
  onPatch: (patch: Partial<ManualOrderDraftItem>) => void;
  onRemove: () => void;
  onPickColor: (variant: SupplierPoolVariant) => void;
  onChangeKind: (kind: KindOption | null) => void;
  onChangeImprints: (next: QuoteImportDraftImprint[]) => void;
}) {
  const pending = preview?.status === "pending";
  const failedReason = preview && preview.status !== "pending" && preview.status !== "done" ? preview.reason : null;
  // Назва стає підписом, коли її дало джерело. Полем лишається там, де її пишуть.
  const nameIsGiven = Boolean(draft.catalog?.modelId || draft.supplierProductId);
  const sources = orderItemSources({
    avantprintUrl: draft.avantprintUrl ?? undefined,
    supplierUrl: draft.supplierUrl ?? undefined,
    sourceUrl: draft.links[0],
  });

  const [changingColor, setChangingColor] = React.useState(false);
  const [allColors, setAllColors] = React.useState(false);
  const colorTilesOpen = needsColorChoice(draft) || (changingColor && draft.colorOptions.length > 1);

  // Двері «+ нанесення» обирають вид заради нанесення: щойно методи приїхали, вони відкриваються самі.
  const [imprintsAfterKind, setImprintsAfterKind] = React.useState<string | null>(null);

  const issue = (id: string) => issueRing(issueId === id);
  const lineNet = amountOf(draft.qty) * amountOf(draft.unitPrice);
  const priceHint = draft.poolPrice
    ? `${draft.poolPriceKind === "wholesale" ? "закупка" : "на сайті"} ${formatHintAmount(draft.poolPrice.amount)} ${hintCurrency(draft.poolPrice.currency)}`
    : null;

  return (
    <article
      data-issue={`pending:${draft.key}`}
      className={cn("rounded-xl border border-line bg-card", issue(`pending:${draft.key}`))}
    >
      <div className="flex flex-wrap items-start gap-3 px-3 pt-3">
        <ImportItemPhoto preview={preview} name={draft.name} specPreset={draft.catalog?.specPreset} />

        <div className="min-w-48 flex-1 space-y-1">
          {pending ? (
            <div className="space-y-2 py-1" aria-label="Читаємо сторінку товару">
              <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted" />
              <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-1.5">
                {nameIsGiven ? (
                  <div className="min-w-0 truncate text-sm font-medium" title={draft.name}>
                    {draft.name}
                  </div>
                ) : (
                  <Input
                    data-issue={`name:${draft.key}`}
                    value={draft.name}
                    disabled={disabled}
                    controlSize="sm"
                    aria-label="Назва товару"
                    placeholder="Назва товару"
                    className={cn("min-w-0 flex-1", issue(`name:${draft.key}`))}
                    onChange={(event) => onPatch({ name: event.target.value })}
                  />
                )}
                {draft.isKids ? <KidsBadge className="text-3xs" /> : null}
              </div>

              {failedReason && !draft.name.trim() ? (
                <div className="flex items-center gap-1 text-2xs text-warning-foreground">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Сайт не пустив, фото немає. Назву впишіть самі.
                </div>
              ) : failedReason ? (
                <div className="text-2xs text-muted-foreground/70">{failedReason}</div>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                {draft.sku ? <span className="font-medium tabular-nums">арт. {draft.sku}</span> : null}
                {draft.color ? <span className="max-w-52 truncate">{draft.color}</span> : null}
                {draft.color && draft.colorOptions.length > 1 ? (
                  <button
                    type="button"
                    disabled={disabled}
                    className="underline underline-offset-2 transition-colors hover:text-foreground"
                    onClick={() => setChangingColor((value) => !value)}
                  >
                    {changingColor ? "Лишити колір" : "Змінити колір"}
                  </button>
                ) : null}
                {sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={source.url}
                    className="inline-flex items-center gap-1 transition-colors hover:text-primary"
                  >
                    <span className="underline underline-offset-2">{source.name}</span>
                    <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-60" />
                  </a>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-start gap-2">
          <div className="w-16 space-y-1">
            <Label className="text-2xs text-muted-foreground">К-сть</Label>
            <Input
              data-issue={`qty:${draft.key}`}
              value={draft.qty}
              disabled={disabled}
              controlSize="sm"
              inputMode="decimal"
              placeholder="0"
              aria-label="Кількість"
              className={cn("text-right tabular-nums", issue(`qty:${draft.key}`))}
              onChange={(event) => onPatch({ qty: event.target.value })}
            />
          </div>
          <div className="w-16 space-y-1">
            <Label className="text-2xs text-muted-foreground">Од.</Label>
            <Select value={draft.unit} disabled={disabled} onValueChange={(unit) => onPatch({ unit })}>
              <SelectTrigger controlSize="sm" aria-label="Одиниця" className="px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28 space-y-1">
            <Label className="text-2xs text-muted-foreground">{pricesExclVat ? "Ціна без ПДВ" : "Ціна"}</Label>
            <Input
              data-issue={`price:${draft.key}`}
              value={draft.unitPrice}
              disabled={disabled}
              controlSize="sm"
              inputMode="decimal"
              placeholder="0"
              aria-label={pricesExclVat ? "Ціна за одиницю без ПДВ" : "Ціна за одиницю"}
              className={cn("text-right tabular-nums", issue(`price:${draft.key}`))}
              onChange={(event) => onPatch({ unitPrice: event.target.value })}
            />
            {priceHint ? <div className="text-2xs leading-tight text-muted-foreground">{priceHint}</div> : null}
            <NetPriceHint entered={draft.unitPrice} active={pricesExclVat} currency={currency} />
          </div>
          <div className="min-w-20 pt-6 text-right text-sm font-semibold tabular-nums">
            {formatOrderMoney(lineNet, currency)}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            className="mt-5 text-muted-foreground hover:text-destructive"
            disabled={disabled}
            aria-label={`Прибрати «${draft.name || "позицію"}»`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {pending ? (
        <div className="h-3" />
      ) : (
        <div className="mt-2 space-y-2 border-t border-line-subtle bg-tint-subtle px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {draft.catalog?.modelId ? (
              <CatalogPlaceChip label={catalogPlace(draft.catalog.kindName, draft.catalog.typeName)} />
            ) : (
              <KindChip
                value={draft.catalog ?? null}
                options={kindOptions}
                disabled={disabled}
                onChange={(kind) => {
                  setImprintsAfterKind(null);
                  onChangeKind(kind);
                }}
              />
            )}
            {imprintOptions ? (
              <ImprintChips
                // Новий вид — нова смуга: `autoOpen` читається лише на появі.
                key={draft.catalog?.kindId}
                autoOpen={imprintsAfterKind !== null && imprintsAfterKind === draft.catalog?.kindId}
                imprints={draft.imprints}
                methods={imprintOptions.methods}
                places={imprintOptions.places}
                directory={imprintOptions.directory}
                disabled={disabled}
                onChange={onChangeImprints}
                sheet={getImprintSheet(draft.catalog?.kindName)}
                product={{
                  name: draft.name,
                  kindName: draft.catalog?.kindName ?? null,
                  sku: draft.sku,
                  color: draft.color,
                  imageUrl: preview?.status === "done" ? preview.imageUrl : null,
                }}
              />
            ) : !draft.catalog ? (
              <KindImprintDoor
                options={kindOptions}
                disabled={disabled}
                onPick={(kind) => {
                  setImprintsAfterKind(kind.kindId);
                  onChangeKind(kind);
                }}
              />
            ) : null}
          </div>

          {colorTilesOpen ? (
            <div data-issue={`color:${draft.key}`} className={cn("space-y-1 p-1", issue(`color:${draft.key}`))}>
              <span className="block text-2xs text-muted-foreground">Оберіть колір: його артикул поїде в замовлення</span>
              <SupplierVariantTiles
                product={{ variants: draft.colorOptions }}
                allColors={allColors}
                onShowAll={() => setAllColors(true)}
                onPick={(variant) => {
                  setChangingColor(false);
                  onPickColor(variant);
                }}
              />
            </div>
          ) : null}

          {draft.imprints.map((imprint) => {
            const size = draft.sizes[imprint.key] ?? { width: "", height: "" };
            const setSize = (patch: Partial<typeof size>) =>
              onPatch({ sizes: { ...draft.sizes, [imprint.key]: { ...size, ...patch } } });
            const method = imprintOptions?.methods.find((entry) => entry.id === imprint.methodId)?.name ?? "Нанесення";
            return (
              <div key={imprint.key} className="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
                <span className="min-w-0 truncate font-medium text-foreground">
                  {[method, imprint.positionLabel].filter(Boolean).join(" · ")}
                </span>
                <span>Ш</span>
                <Input
                  value={size.width}
                  disabled={disabled}
                  controlSize="sm"
                  inputMode="decimal"
                  aria-label={`Ширина нанесення ${method}, мм`}
                  className="w-14 text-right tabular-nums"
                  onChange={(event) => setSize({ width: event.target.value })}
                />
                <span>В</span>
                <Input
                  value={size.height}
                  disabled={disabled}
                  controlSize="sm"
                  inputMode="decimal"
                  aria-label={`Висота нанесення ${method}, мм`}
                  className="w-14 text-right tabular-nums"
                  onChange={(event) => setSize({ height: event.target.value })}
                />
                <span>мм</span>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

export function ManualOrderServiceRow({
  service,
  currency,
  pricesExclVat,
  disabled,
  issueId,
  onPatch,
  onRemove,
}: {
  service: ManualOrderDraftService;
  currency: string;
  pricesExclVat: boolean;
  disabled?: boolean;
  issueId: string | null;
  onPatch: (patch: Partial<ManualOrderDraftService>) => void;
  onRemove: () => void;
}) {
  const issue = (id: string) => issueRing(issueId === id);
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-xl border border-line bg-card p-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border tone-icon-box-info" title="Послуга">
        <Briefcase className="h-4 w-4" aria-hidden />
      </span>
      <Input
        data-issue={`service:${service.key}`}
        value={service.name}
        disabled={disabled}
        controlSize="sm"
        aria-label="Назва послуги"
        placeholder="Послуга: розробка макету, доставка…"
        className={cn("min-w-48 flex-1", issue(`service:${service.key}`))}
        onChange={(event) => onPatch({ name: event.target.value })}
      />
      <Input
        data-issue={`service-qty:${service.key}`}
        value={service.qty}
        disabled={disabled}
        controlSize="sm"
        inputMode="decimal"
        aria-label="Кількість послуг"
        className={cn("w-16 text-right tabular-nums", issue(`service-qty:${service.key}`))}
        onChange={(event) => onPatch({ qty: event.target.value })}
      />
      <div className="w-28 space-y-1">
        <Input
          data-issue={`service-price:${service.key}`}
          value={service.unitPrice}
          disabled={disabled}
          controlSize="sm"
          inputMode="decimal"
          aria-label={pricesExclVat ? "Ціна послуги без ПДВ" : "Ціна послуги"}
          placeholder={pricesExclVat ? "Ціна без ПДВ" : "Ціна"}
          className={cn("text-right tabular-nums", issue(`service-price:${service.key}`))}
          onChange={(event) => onPatch({ unitPrice: event.target.value })}
        />
        <NetPriceHint entered={service.unitPrice} active={pricesExclVat} currency={currency} />
      </div>
      <div className="min-w-20 pt-1.5 text-right text-sm font-semibold tabular-nums">
        {formatOrderMoney(amountOf(service.qty) * amountOf(service.unitPrice), currency)}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="iconSm"
        className="text-muted-foreground hover:text-destructive"
        disabled={disabled}
        aria-label="Прибрати послугу"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
