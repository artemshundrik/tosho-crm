import * as React from "react";
import { Pencil, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PrintSpecFields, getPrintSpecSections } from "@/components/quotes/PrintSpecFields";
import { PrintSpecSectionRail } from "@/features/quotes/quote-details/PrintSpecSectionRail";
import { PrintModelArt } from "@/features/quotes/quote-wizard/printModelArt";
import {
  createEmptyPrintSpecValues,
  formatPrintSpecEntries,
  getPrintSpecPreset,
  isPrintSpecFilled,
  parsePrintSpecValues,
  splitPrintSpecEntries,
  type PrintSpecEntry,
  type PrintSpecMetadata,
  type PrintSpecValues,
} from "@/lib/printSpec";

/**
 * Параметри виробу для описових видів поліграфії на картці прорахунку.
 *
 * ЧОМУ САМЕ ТУТ, А НЕ У ВІКНІ СТВОРЕННЯ: заповнює це не той, хто заводить
 * прорахунок, а той, хто його рахує — «спосіб друку не обовʼязково для
 * менеджерів, ми самі з Оленою вибираємо від формату і тиражу». Менеджер при
 * створенні вибирає лише вид виробу й тираж.
 *
 * ЧОМУ ПОРОЖНІЙ СТАН — НЕ ПОМИЛКА: між створенням прорахунку й прорахунком
 * параметрів іще немає, і це нормальний робочий стан. Тому тут заклик заповнити,
 * а не попередження.
 *
 * Компонент сам вирішує, чи йому бути: вид без опису полів — і він не малює
 * нічого. Саме тому його можна безпечно поставити одним рядком на спільну
 * сторінку, яку бачать усі.
 */

export type PrintSpecPanelProps = {
  quoteItemId: string;
  /** `catalog_models.metadata.specPreset` вибраної моделі. */
  presetKey?: string | null;
  /** Що вже збережено в `quote_items.metadata.printSpec`. */
  saved?: PrintSpecMetadata | null;
  canEdit: boolean;
  onSaved: () => void;
  /** Відступи задає той, хто ставить панель: вона тепер поверх картки, а не вставка. */
  className?: string;
};

export function PrintSpecPanel({ quoteItemId, presetKey, saved, canEdit, onSaved, className }: PrintSpecPanelProps) {
  const preset = React.useMemo(() => getPrintSpecPreset(saved?.presetKey ?? presetKey), [presetKey, saved?.presetKey]);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<PrintSpecValues>({});
  const [saving, setSaving] = React.useState(false);

  const savedValues = React.useMemo(
    () => (preset ? parsePrintSpecValues(preset, saved?.values ?? null) : {}),
    [preset, saved?.values]
  );

  /*
    ГОЛОВНЕ ВЕЛИКЕ, РЕШТА СІТКОЮ (вигляд В, обраний 11.09.2026 з чотирьох).

    Було двадцять пар «підпис — значення» двома колонками: щоденник займав
    півекрана, і формат читався так само дрібно, як колір резинки. Тепер 3–4
    поля, від яких залежить ціна (`preset.summary`), стоять стрічкою великим, а
    решта — дрібною сіткою в три колонки під рискою: удвічі нижче, і кожне
    поле досі знаходиться за підписом. Рядка «Виріб: Щоденник» тут немає — назва
    виду стоїть заголовком позиції; у рядковому зведенні для списку й
    дизайн-задачі він лишається.
  */
  const entries = React.useMemo(
    () => (preset && isPrintSpecFilled(preset, savedValues) ? formatPrintSpecEntries(preset, savedValues) : []),
    [preset, savedValues]
  );
  const { hero, rest } = React.useMemo(
    () => (preset ? splitPrintSpecEntries(preset, entries) : { hero: [], rest: [] }),
    [preset, entries]
  );

  /*
    Лічильник «17 з 19» у заголовку — лише поки є порожні поля. Це підказка тому,
    хто рахує, що є куди дозаповнити, а не оцінка: заповнили до кінця — і він
    зникає, бо «19 з 19» нічого не каже. Той самий рахунок, що в рейці вікна.
  */
  const progress = React.useMemo(() => {
    if (!preset) return null;
    const sections = getPrintSpecSections(preset, savedValues);
    const total = sections.reduce((sum, section) => sum + section.fields.length, 0);
    const done = sections.reduce((sum, section) => sum + section.filled, 0);
    return total > 0 && done < total ? { done, total } : null;
  }, [preset, savedValues]);

  /*
    Розділи рахуються з ЧЕРНЕТКИ, а не зі збереженого: умовні поля з'являються й
    зникають від вибору («Кількість пантонів» — лише при пантонах), тож лічильники
    рейки мусять міняти й знаменник теж, поки людина клікає.
  */
  const sections = React.useMemo(() => (preset ? getPrintSpecSections(preset, draft) : []), [preset, draft]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = React.useState(0);

  const scrollToSection = React.useCallback((index: number) => {
    const container = scrollRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-spec-section="${index}"]`);
    if (!container || !target) return;
    // scrollIntoView тут не годиться: він крутить і зовнішню сторінку теж,
    // а вікно стоїть поверх неї. Рахуємо зсув усередині самого контейнера.
    container.scrollTo({ top: target.offsetTop - container.offsetTop - 8, behavior: "smooth" });
  }, []);

  /*
    Активний розділ — останній, чий заголовок уже проїхав верх колонки. Поріг у
    24 px, щоб розділ ставав активним, коли його заголовок ТІЛЬКИ підійшов, а не
    коли вже зник: інакше рейка відстає на один рядок від того, що видно.
  */
  const handleScroll = React.useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const marks = container.querySelectorAll<HTMLElement>("[data-spec-section]");
    let next = 0;
    marks.forEach((mark, index) => {
      if (mark.offsetTop - container.offsetTop - container.scrollTop <= 24) next = index;
    });
    setActiveSection(next);
  }, []);

  if (!preset) return null;

  const openEditor = () => {
    setDraft(isPrintSpecFilled(preset, savedValues) ? savedValues : createEmptyPrintSpecValues(preset));
    setActiveSection(0);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Метадані читаємо перед записом, а не беремо зі стану сторінки: у тому ж
      // обʼєкті живуть sku й варіант каталогу, і запис усього обʼєкта зі старого
      // знімка затер би чужу правку (так уже одного разу зникла аватарка в профілі).
      const { data, error: readError } = await supabase
        .schema("tosho")
        .from("quote_items")
        .select("metadata")
        .eq("id", quoteItemId)
        .maybeSingle();
      if (readError) throw readError;

      const current = (data?.metadata ?? {}) as Record<string, unknown>;
      const nextMetadata = {
        ...current,
        printSpec: { presetKey: preset.key, values: draft },
      };

      const { error: writeError } = await supabase
        .schema("tosho")
        .from("quote_items")
        .update({ metadata: nextMetadata })
        .eq("id", quoteItemId);
      if (writeError) throw writeError;

      toast.success("Параметри виробу збережено");
      setOpen(false);
      onSaved();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти параметри виробу");
    } finally {
      setSaving(false);
    }
  };

  const filled = entries.length > 0;

  return (
    <div className={cn("rounded-xl border border-border/50 p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          {/* Назви виду тут немає (Артем, 11.09.2026): вона стоїть заголовком
              позиції на три рядки вище, і другий раз читалась як підпис до
              підпису. У вікні редагування вона лишається — там заголовка немає. */}
          <span>Параметри виробу</span>
        </div>
        {filled && progress ? (
          <span className="ml-auto mr-2 flex items-center gap-2.5 text-xs tabular-nums text-muted-foreground">
            {progress.done} з {progress.total}
            <span className="h-1 w-24 overflow-hidden rounded-full bg-border/60">
              <span
                className="block h-full bg-foreground"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </span>
          </span>
        ) : null}
        {canEdit ? (
          <Button variant={filled ? "ghost" : "primary"} size="sm" onClick={openEditor}>
            {filled ? <Pencil className="mr-1.5 h-3.5 w-3.5" /> : null}
            {filled ? "Змінити" : "Заповнити"}
          </Button>
        ) : null}
      </div>

      {filled ? (
        <>
          {hero.length > 0 ? <PrintSpecHero entries={hero} /> : null}
          {rest.length > 0 ? (
            <div
              className={cn(
                "grid gap-x-7 sm:grid-cols-2 xl:grid-cols-3",
                hero.length > 0 ? "mt-4 border-t border-border/50 pt-3" : "mt-3"
              )}
            >
              {rest.map((entry) => (
                <div key={entry.id} className="flex items-baseline justify-between gap-4 py-1 text-sm">
                  <span className="min-w-0 text-muted-foreground">{entry.label}</span>
                  <span className="min-w-0 text-right font-medium tabular-nums text-foreground">{entry.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-2 text-sm text-muted-foreground">
          Параметри ще не заповнені{canEdit ? "" : " — їх заповнює той, хто прораховує"}.
        </div>
      )}

      <Dialog open={open} onOpenChange={(next) => (saving ? null : setOpen(next))}>
        {/*
          ТРИ ЧАСТИНИ СТОЯТЬ, ЇДЕ ЛИШЕ СЕРЕДИНА (варіант А, Артем 11.09.2026).

          Було одне вікно з `overflow-y-auto` на всьому: у щоденника — вісім
          розділів і двадцять полів, і при прокрутці зникали і назва виду, і
          «Зберегти». Людина дописувала останнє поле й мусила гортати назад,
          щоб зберегти.

          Тепер шапка, рейка й футер прибиті, а прокручується тільки колонка
          полів. Ширина 960, а не 768: рейка з'їдає 240, і без цього поля в
          двох колонках стали б вужчі за нинішні.
        */}
        <DialogContent className="flex h-[min(88vh,46rem)] max-h-[88vh] flex-col overflow-hidden !gap-0 !p-0 sm:max-w-[960px]">
          <DialogHeader className="flex-row items-center gap-4 border-b border-border/50 px-6 py-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted/70 text-foreground/75">
              <PrintModelArt presetKey={preset.key} className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle>Параметри виробу · {preset.label}</DialogTitle>
              <DialogDescription>
                Обмежень немає — якщо потрібного варіанта немає в списку, вибирайте «Інше» і пишіть текстом.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1">
            {/* Рейка — від трьох розділів: на двох вона нічого не додає до форми. */}
            {sections.length >= 3 ? (
              <PrintSpecSectionRail sections={sections} activeIndex={activeSection} onPick={scrollToSection} />
            ) : null}

            <div ref={scrollRef} onScroll={handleScroll} className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
              <PrintSpecFields preset={preset} values={draft} onChange={setDraft} disabled={saving} />
            </div>
          </div>

          <DialogFooter className="border-t border-border/50 bg-muted/25 px-6 py-3.5 sm:items-center sm:justify-between">
            <span className="hidden text-xs text-muted-foreground sm:block">
              Збережене видно в картці прорахунку, у списку та в дизайн-задачі.
            </span>
            <span className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Скасувати
              </Button>
              <Button onClick={() => void save()} loading={saving}>
                Зберегти
              </Button>
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Скільки клітинок у ряд стрічки: сітка Tailwind не читає число з пропса. */
const HERO_COLUMNS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

/**
 * Стрічка «головне»: значення великим, підпис під ним, між клітинками риска.
 *
 * На телефоні — по дві в ряд без рисок: чотири клітинки в один ряд на 360 px
 * дали б по 80 px на «Шкірзамінник». Значення не переноситься, а обрізається:
 * стрічка — це те, що читають з відстані, і два рядки в одній клітинці
 * зруйнували б лінію, на якій стоять решта.
 */
function PrintSpecHero({ entries }: { entries: PrintSpecEntry[] }) {
  return (
    <div className={cn("mt-3.5 grid grid-cols-2 gap-y-3", HERO_COLUMNS[Math.min(entries.length, 4)])}>
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          className={cn(
            "min-w-0 sm:px-5",
            index === 0 && "sm:pl-0",
            index > 0 && "sm:border-l sm:border-border/60"
          )}
        >
          <div className="truncate text-xl font-semibold leading-6 tracking-tight text-foreground" title={entry.value}>
            {entry.value}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{entry.label}</div>
        </div>
      ))}
    </div>
  );
}
