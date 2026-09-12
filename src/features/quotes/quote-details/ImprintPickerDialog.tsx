import * as React from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type { QuoteImportDraftImprint } from "@/features/quotes/quote-import/types";
import type { PlaceOption } from "./ImprintChips";
import { zonesOfView, viewOfLabel, type ImprintSheet, type ImprintViewId, type ImprintZone } from "./imprintSheets";

/**
 * Вибір місця нанесення на ескізі товару (REQ-268).
 *
 * ЧОМУ ВІКНО, А НЕ ПОПОВЕР. Питання «де саме» неможливо поставити в 240 px:
 * місце показує КАРТИНКА, і рамка на ній мусить бути такою, щоб у неї
 * влучали пальцем, а не вгадували. Пара «метод + місце» від цього не
 * розпадається — вікно й далі віддає її одним записом, як `ImprintChips`.
 *
 * СПИСОК МІСЦЬ ЛИШАЄТЬСЯ ПОРУЧ З ЕСКІЗОМ, а не замість нього. Ескіз є лише в
 * кількох видів, і навіть там людина може шукати місце словом, а не оком;
 * плюс клавіатурний шлях не можна віддавати картинці.
 *
 * ПІДПИС ЗОНИ ЙДЕ В ДОВІДНИК. Клік по рамці кладе `positionLabel`, а
 * `resolveImprintPlaces` на «Створити» перетворює його на рядок
 * `catalog_print_positions` цього виду. Тому 90 видів, у яких місць немає,
 * набирають їх самі, без окремої адмінки.
 *
 * РОЗМІР — ДОВІДКОВО Й ОДИН НА ВИД, І САМЕ ТОМУ НЕ В РАМЦІ. Спершу він стояв
 * підписом усередині обраної зони — і на рукаві «139 × 144 мм» читалось як
 * розмір рукава, хоч це середнє по ВСІХ нанесеннях футболки. Тепер число
 * живе одним рядком у рейці, де поруч сказано, що точний розмір ставить
 * дизайнер у ТЗ.
 */

export type ImprintProduct = {
  name: string;
  kindName: string | null;
  sku: string | null;
  color: string | null;
  imageUrl: string | null;
};

type Method = { id: string; name: string };

const newPair = (methodId: string): QuoteImportDraftImprint => ({
  key: crypto.randomUUID(),
  methodId,
  positionId: null,
  positionLabel: null,
});

export function ImprintPickerDialog({
  open,
  onOpenChange,
  sheet,
  product,
  imprints,
  methods,
  places,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheet: ImprintSheet;
  product: ImprintProduct;
  imprints: QuoteImportDraftImprint[];
  methods: Method[];
  places: PlaceOption[];
  onChange: (next: QuoteImportDraftImprint[]) => void;
}) {
  /**
   * Правки живуть ЛОКАЛЬНО до «Готово». У смузі нанесення пишуться одразу, бо
   * там клік і є відповіддю, а тут поруч стоїть «Скасувати» — і воно має щось
   * означати.
   */
  const [draft, setDraft] = React.useState<QuoteImportDraftImprint[]>([]);
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [view, setView] = React.useState<ImprintViewId>(sheet.views[0]?.id ?? "front");

  /**
   * Набір читається РІВНО НА ВІДКРИТТІ, а не на кожній зміні входів.
   * `methods` і `places` приходять із хука видів і міняють тотожність на
   * кожному рендері батька; ефект зі звичайним списком залежностей скидав би
   * набране просто тому, що рядок перемалювався.
   */
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      // Порожній набір відкривається з уже початою парою на найчастішому методі:
      // інакше перший клік по зоні не мав би куди лягти й мовчав би.
      const start = imprints.length > 0 ? imprints : methods[0] ? [newPair(methods[0].id)] : [];
      setDraft(start);
      setActiveKey(start[0]?.key ?? null);
      setView(viewOfLabel(sheet, start[0]?.positionLabel) ?? sheet.views[0]?.id ?? "front");
    }
    wasOpen.current = open;
  }, [open, imprints, methods, sheet]);

  const active = draft.find((pair) => pair.key === activeKey) ?? draft[0] ?? null;
  const patchActive = (next: Partial<QuoteImportDraftImprint>) => {
    if (!active) return;
    setDraft((rows) => rows.map((row) => (row.key === active.key ? { ...row, ...next } : row)));
  };

  const pickZone = (zone: ImprintZone) => {
    const known = places.find((place) => place.id && place.label.toLowerCase() === zone.label.toLowerCase());
    patchActive({ positionId: known?.id ?? null, positionLabel: known?.label ?? zone.label });
  };

  const addPair = () => {
    const pair = newPair(active?.methodId ?? methods[0]?.id ?? "");
    setDraft((rows) => [...rows, pair]);
    setActiveKey(pair.key);
  };

  const removePair = (key: string) => {
    setDraft((rows) => {
      const next = rows.filter((row) => row.key !== key);
      if (key === activeKey) setActiveKey(next[0]?.key ?? null);
      return next;
    });
  };

  const methodName = (id: string) => methods.find((method) => method.id === id)?.name ?? "Метод";
  const activeLabel = active?.positionLabel?.trim() ?? "";
  const currentView = sheet.views.find((one) => one.id === view) ?? sheet.views[0];

  const confirm = () => {
    // Пари без місця лишаємо: «ДТФ · місце?» у смузі — видиме питання, а не сміття.
    onChange(draft.filter((pair) => pair.methodId));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[min(96vw,880px)] max-w-none flex-col gap-0 overflow-hidden p-0">
        {/*
          ШАПКА НАЗИВАЄ ТОВАР, а не дію: «Нанесення» без товару лишає питання
          «до чого саме», коли у вікні прорахунку п'ять позицій (Артем,
          12.09.2026). Фото, назва, вид, колір і артикул — рівно те, за чим
          позицію впізнають у рядку.
        */}
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-border/60 px-4 py-3 pr-12 text-left shrink-0">
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-border/60 bg-muted/40">
            <img
              src={product.imageUrl ?? currentView?.src ?? ""}
              alt=""
              className="h-full w-full object-contain"
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
            />
          </div>
          <div className="min-w-0">
            <DialogTitle className="truncate text-sm font-semibold leading-tight">
              {product.name || "Позиція"}
            </DialogTitle>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
              {product.kindName ? <span>{product.kindName}</span> : null}
              {product.color ? <span>· {product.color}</span> : null}
              {product.sku ? <span className="tabular-nums">· арт. {product.sku}</span> : null}
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_286px]">
          {/* СЦЕНА */}
          <div className="flex min-h-[360px] flex-col border-b border-border/60 p-4 md:border-b-0 md:border-r">
            {/*
              СЦЕНА — ОКРЕМА ЗАОКРУГЛЕНА ПАНЕЛЬ, а не залитий кут вікна
              (Артем, 12.09.2026). Товар тут предмет показу, і поле навколо
              нього мусить бути рамкою, а не рештою розкладки. Світло під
              товаром — не прикраса: футболка майже біла, і на рівному сірому
              вона губила край, а на світлій плямі під собою тримає силует.
            */}
            <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-[var(--radius-inner)] border border-border/50 bg-muted/50">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(58% 46% at 50% 44%, hsl(var(--background)) 0%, transparent 72%)",
                }}
              />
            {sheet.views.length > 1 ? (
              <div className="absolute left-3 top-3 z-base flex gap-1 rounded-full border border-border/60 bg-background/80 p-1 backdrop-blur-sm">
                {sheet.views.map((one) => (
                  <button
                    key={one.id}
                    type="button"
                    aria-pressed={one.id === view}
                    onClick={() => setView(one.id)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors duration-base ease-out motion-reduce:transition-none",
                      one.id === view
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {one.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="relative z-base w-full max-w-[312px]">
              {currentView ? (
                <img src={currentView.src} alt={`${product.kindName ?? "Товар"}, ${currentView.label}`} className="block w-full" />
              ) : null}
              {zonesOfView(sheet, view).map((zone) => {
                const on = activeLabel.toLowerCase() === zone.label.toLowerCase();
                return (
                  <button
                    key={zone.id}
                    type="button"
                    aria-label={zone.label}
                    aria-pressed={on}
                    onClick={() => pickZone(zone)}
                    style={{
                      left: `${zone.x * 100}%`,
                      top: `${zone.y * 100}%`,
                      width: `${zone.w * 100}%`,
                      height: `${zone.h * 100}%`,
                    }}
                    className={cn(
                      "absolute rounded-[3px] border transition-[background-color,border-color] duration-base ease-out motion-reduce:transition-none",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      on
                        ? "border-primary bg-primary/25"
                        : "border-dashed border-primary/55 bg-primary/[0.07] hover:border-primary hover:bg-primary/15"
                    )}
                  />
                );
              })}
            </div>

              <p className="absolute bottom-3 left-4 right-4 z-base text-2xs text-muted-foreground">
                Клацніть область на товарі або оберіть у списку праворуч
              </p>
            </div>
          </div>

          {/* ПРАВИЙ РЕЙЛ */}
          <div className="flex min-h-0 flex-col overflow-y-auto">
            <RailHeading>Метод</RailHeading>
            <div className="px-2">
              {methods.map((method) => (
                <RailRow
                  key={method.id}
                  label={method.name}
                  checked={active?.methodId === method.id}
                  onSelect={() => patchActive({ methodId: method.id })}
                />
              ))}
            </div>

            <div className="mx-4 my-3 h-px bg-border/60" />

            <RailHeading>Місце</RailHeading>
            <div className="px-2">
              {sheet.zones.map((zone) => (
                <RailRow
                  key={zone.id}
                  label={zone.label}
                  checked={activeLabel.toLowerCase() === zone.label.toLowerCase()}
                  onSelect={() => {
                    setView(zone.view);
                    pickZone(zone);
                  }}
                />
              ))}
              {/* Місця довідника, яких на ескізі немає: колишні відповіді не ховаємо. */}
              {places
                .filter(
                  (place) =>
                    place.label &&
                    !sheet.zones.some((zone) => zone.label.toLowerCase() === place.label.toLowerCase())
                )
                .map((place) => (
                  <RailRow
                    key={place.id ?? place.label}
                    label={place.label}
                    muted
                    checked={activeLabel.toLowerCase() === place.label.toLowerCase()}
                    onSelect={() => patchActive({ positionId: place.id, positionLabel: place.label })}
                  />
                ))}
            </div>

            {sheet.typicalMm ? (
              <p className="mx-4 mt-3 rounded-[var(--radius-md)] border border-border/60 bg-muted/30 px-2.5 py-2 text-2xs leading-relaxed text-muted-foreground">
                Типово {sheet.typicalMm[0]} × {sheet.typicalMm[1]} мм за нашими прорахунками. Точний розмір
                ставить дизайнер у ТЗ.
              </p>
            ) : null}

            <div className="mt-auto px-4 py-3">
              <Chip
                size="sm"
                icon={<Plus />}
                onClick={addPair}
                className="w-full justify-center border-dashed text-muted-foreground"
              >
                Ще одне нанесення
              </Chip>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {draft.length === 0 ? (
              <span className="text-xs text-muted-foreground">Нанесення немає</span>
            ) : (
              draft.map((pair) => (
                <span
                  key={pair.key}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border pl-3 pr-1.5 text-xs font-medium transition-colors duration-base ease-out",
                    pair.key === active?.key
                      ? "border-control-active-border bg-control-active text-foreground"
                      : "border-border/40 bg-muted/10 text-muted-foreground"
                  )}
                >
                  <button type="button" onClick={() => setActiveKey(pair.key)} className="min-w-0 truncate">
                    {methodName(pair.methodId)}
                    <span className="text-muted-foreground"> · </span>
                    <span className={cn(!pair.positionLabel && "font-normal text-muted-foreground")}>
                      {pair.positionLabel || "місце?"}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Прибрати ${methodName(pair.methodId)}`}
                    onClick={() => removePair(pair.key)}
                    className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button size="sm" onClick={confirm}>
            Готово
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RailHeading({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pb-1.5 pt-4 text-2xs font-medium uppercase tracking-caps text-muted-foreground">{children}</div>;
}

function RailRow({
  label,
  checked,
  muted,
  onSelect,
}: {
  label: string;
  checked: boolean;
  muted?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm transition-colors duration-base ease-out motion-reduce:transition-none",
        checked ? "bg-control-active" : "hover:bg-muted/60",
        muted && !checked && "text-muted-foreground"
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("h-3.5 w-3.5 shrink-0", checked ? "opacity-100" : "opacity-0")}
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
