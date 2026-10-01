import * as React from "react";
import { Check, Plus, Search, Tag } from "@/components/icons/appIcons";

import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { QuoteImportDraftCatalog } from "@/features/quotes/quote-import/types";
import { cn } from "@/lib/utils";

/**
 * Вибір виду товару — ОДИН на вікно створення й картку позиції (REQ-324#p1).
 *
 * Народився в рядку вікна створення (REQ-182#p18), а потім знадобився в
 * картці: позиція за посиланням, чий вид не вгадався, лягала без виду, і
 * смуга нанесення в картці просто не малювалась — методи належать виду, тож
 * показувати було нічого. Два однакові вибори в двох місцях розійшлися б на
 * першій же поправці, тому він тут, поруч зі смугою нанесення.
 */

/** Вид товару для вибору: те саме, що `CatalogKindOption` у візарді. */
export type KindOption = Pick<QuoteImportDraftCatalog, "kindId" | "kindName" | "typeId" | "typeName">;

/** Що стоїть на чипі: вид і чи це здогад CRM, а не вибір людини. */
export type KindChipValue = Pick<KindOption, "kindId" | "kindName"> & { guessed?: boolean };

/**
 * Чип виду для позиції без моделі (REQ-182#p18). Вгаданий вид стоїть
 * пунктиром: це не факт, а здогад з назви, і від нього залежать методи
 * нанесення — тому виправити його має бути так само легко, як клацнути чип.
 */
export function KindChip({
  value,
  options,
  disabled,
  onChange,
  allowClear = true,
}: {
  value: KindChipValue | null;
  options: KindOption[];
  disabled?: boolean;
  onChange: (kind: KindOption | null) => void;
  /**
   * «Без виду — в каталог не записувати». Має сенс лише у вікні створення, де
   * вид ще нічого не записав. У картці позиції без виду прибирати нічого.
   */
  allowClear?: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip
          size="sm"
          disabled={disabled}
          icon={<Tag />}
          aria-label={value ? `Вид товару: ${value.kindName}${value.guessed ? ", припущення" : ""}` : "Вид товару"}
          className={cn(!value || value.guessed ? "border-dashed" : undefined, value && !value.guessed && "bg-muted")}
        >
          {value ? (
            /*
              БЕЗ СЛОВА «ПРИПУЩЕННЯ» (Артем, 08.09.2026). Те саме вже сказано
              двічі: пунктирна рамка чипа й підпис «додасться в базу» під
              назвою. Третій раз забирав ширину в смуги нанесення. Здогад
              лишається здогадом — про це каже пунктир, і виправити його
              однаково один клік.
            */
            value.kindName
          ) : (
            "Вид товару?"
          )}
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <KindList
          open={open}
          value={value}
          options={options}
          onPick={(kind) => {
            onChange(kind);
            setOpen(false);
          }}
          onClear={
            value && allowClear
              ? () => {
                  onChange(null);
                  setOpen(false);
                }
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * «+ нанесення» в позиції, у якої ще немає виду (REQ-324#p2).
 *
 * ЗАЛЕЖНІСТЬ МАЄ БУТИ ВИДНО. Методи належать виду, тож без виду смузі нема
 * чого запропонувати — і раніше вона просто мовчала: поруч стояв чип «Вид
 * товару?», але ніщо не казало, що саме він відмикає нанесення. Менеджер
 * шукав, де вказати нанесення, не знаходив і писав його в коментар.
 *
 * Тепер двері до нанесення є завжди і ведуть туди, куди треба: спершу вид,
 * а щойно його обрано — смуга сама відкриває методи (`autoOpen` в
 * `ImprintChips`). Окремого «поясніть, що спершу вид» не треба: це питання
 * стоїть заголовком у самому списку.
 */
export function KindImprintDoor({
  options,
  disabled,
  onPick,
}: {
  options: KindOption[];
  disabled?: boolean;
  onPick: (kind: KindOption) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip
          size="sm"
          disabled={disabled}
          icon={<Plus />}
          aria-label="Додати нанесення"
          className="shrink-0 border-dashed px-2.5 text-muted-foreground"
        >
          нанесення
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">
          Спершу вид товару — від нього залежать методи нанесення.
        </p>
        <KindList
          open={open}
          value={null}
          options={options}
          onPick={(kind) => {
            onPick(kind);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Пошук і список видів, згрупованих за типом.
 *
 * Пошук — бо видів 92, і гортати стільки, щоб знайти «Поло», людина не буде
 * (скарга Артема 05.09). Фільтр чисто на клієнті: список уже в пам'яті, тож
 * ні запиту, ні витрат.
 *
 * Шукаємо і по виду, і по ТИПУ: серед 92 є однойменні види в різних типах
 * («Антистрес» двічі), і без типу вибір із двох однакових рядків — лотерея.
 */
function KindList({
  open,
  value,
  options,
  onPick,
  onClear,
}: {
  open: boolean;
  value: KindChipValue | null;
  options: KindOption[];
  onPick: (kind: KindOption) => void;
  onClear?: () => void;
}) {
  const [search, setSearch] = React.useState("");
  const needle = search.trim().toLowerCase();

  React.useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const groups = React.useMemo(() => {
    const byType = new Map<string, { typeName: string; kinds: KindOption[] }>();
    for (const option of options) {
      if (needle && !`${option.kindName} ${option.typeName}`.toLowerCase().includes(needle)) continue;
      const group = byType.get(option.typeId) ?? { typeName: option.typeName, kinds: [] };
      group.kinds.push(option);
      byType.set(option.typeId, group);
    }
    return [...byType.values()];
  }, [options, needle]);

  return (
    <>
      <div className="relative mb-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          controlSize="sm"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Пошук виду"
          className="rounded-full pl-8 text-sm"
          autoFocus
        />
      </div>
      <div className="max-h-72 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">Такого виду немає</p>
        ) : null}
        {groups.map((group) => (
          <div key={group.typeName} className="mb-1 last:mb-0">
            <div className="px-2 pb-1 pt-1.5 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.typeName}
            </div>
            {group.kinds.map((kind) => (
              <button
                key={kind.kindId}
                type="button"
                role="option"
                aria-selected={value?.kindId === kind.kindId}
                onClick={() => onPick(kind)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 truncate">{kind.kindName}</span>
                {value?.kindId === kind.kindId ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            ))}
          </div>
        ))}
      </div>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-1 flex w-full items-center rounded-md border-t border-border/60 px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
        >
          Без виду — в каталог не записувати
        </button>
      ) : null}
    </>
  );
}
