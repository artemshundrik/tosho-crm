import * as React from "react";
import { Check, ChevronDown, ImageOff, Link2, Plus, Tag, Trash2, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { cn } from "@/lib/utils";

import type { QuoteImportDraftCatalog, QuoteImportDraftItem, QuoteImportFlag, QuoteImportLinkPreview } from "./types";

/** Вид товару для вибору в рядку: те саме, що `CatalogKindOption` у візарді. */
export type DraftKindOption = Pick<QuoteImportDraftCatalog, "kindId" | "kindName" | "typeId" | "typeName">;

/**
 * Один рядок прев'ю імпорту — той самий у вікні «Імпорт з файлу» й у візарді
 * (REQ-237#p2). Що людина бачить і править: назва, тиражі, коментар; що лише
 * бачить: фото, рядок файлу, зв'язок варіантів, ознаки, посилання.
 */

/** Гола іконка-дія в рядку позиції: та сама вага, що в кошика. */
const ICON_ACTION =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";

const FLAG_LABELS: Record<QuoteImportFlag, string> = {
  quantity_range: "діапазон → два тиражі",
};

/**
 * Фото товару в рядку прев'ю.
 *
 * ТРИ СТАНИ, І ЖОДЕН ІЗ НИХ НЕ МОВЧИТЬ. Поки їде — пульсує, тобто видно, що
 * воно ще буде. Доїхало — фото. Не вийшло — перекреслена картинка з причиною
 * поруч, бо «сайт не пускає роботів» і «на сторінці немає фото» це різні
 * новини: у першому випадку менеджер відкриє посилання сам, у другому й
 * відкривати нема сенсу.
 */
export function ImportItemPhoto({ preview, name }: { preview: QuoteImportLinkPreview | undefined; name: string }) {
  // 44 px, як у затвердженому прототипі (REQ-182#p20): фото тут упізнавання,
  // а не розгляд, і на шести позиціях 64 px з'їдали пів екрана.
  const base = "h-11 w-11 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-border/60";

  if (!preview) {
    return (
      <div className={cn(base, "flex items-center justify-center bg-muted/40")} aria-hidden>
        <ImageOff className="h-3.5 w-3.5 text-muted-foreground/40" />
      </div>
    );
  }

  if (preview.status === "pending") {
    return <div className={cn(base, "animate-pulse bg-muted/60")} aria-label={`Фото «${name}» ще їде`} />;
  }

  if (preview.status === "done") {
    return (
      <img
        src={preview.imageUrl}
        alt={name}
        loading="lazy"
        className={cn(base, "bg-background object-contain")}
        // Сайт міг віддати адресу, за якою вже нічого немає: тоді замість
        // порваної картинки лишається та сама сіра плитка, що й до доїзду.
        onError={(event) => {
          event.currentTarget.style.visibility = "hidden";
        }}
      />
    );
  }

  return (
    <div
      className={cn(base, "flex items-center justify-center bg-muted/40")}
      title={preview.reason}
      aria-label={`Фото «${name}» не доїхало: ${preview.reason}`}
    >
      <ImageOff className="h-3.5 w-3.5 text-muted-foreground/50" />
    </div>
  );
}

export function ImportDraftRow({
  draft,
  preview,
  disabled,
  onPatch,
  onPatchRun,
  onRemove,
  onAddRun,
  onRemoveRun,
  namePlaceholder,
  autoFocusName,
  methodOptions,
  onToggleMethod,
  kindOptions,
  onChangeKind,
}: {
  draft: QuoteImportDraftItem;
  preview: QuoteImportLinkPreview | undefined;
  disabled?: boolean;
  onPatch: (patch: Partial<QuoteImportDraftItem>) => void;
  onPatchRun: (runKey: string, patch: Partial<QuoteImportDraftItem["runs"][number]>) => void;
  /**
   * Прибрати рядок зовсім. Коли задано — замість галочки стоїть кошик: у
   * файлі зайве ЗНІМАЮТЬ (щоб було видно, що воно там було), а введене руками
   * просто прибирають.
   */
  onRemove?: () => void;
  /**
   * Додати ще один тираж. Коли не задано — кнопки немає: в імпорті тиражі
   * приходять із файлу, і дописувати їх руками там нема потреби.
   */
  onAddRun?: () => void;
  onRemoveRun?: (runKey: string) => void;
  namePlaceholder?: string;
  autoFocusName?: boolean;
  /**
   * Методи нанесення виду — чипами під назвою (REQ-182#p16). Не задано —
   * рядка немає: в імпорті з файлу виду ще не знають, а без виду методу
   * нема на що вказувати.
   */
  methodOptions?: Array<{ id: string; name: string }>;
  onToggleMethod?: (methodId: string | null) => void;
  /**
   * Види каталогу для рядка без моделі (REQ-182#p18): припущення з назви
   * стоїть чипом «Кепка · припущення», людина клацає й виправляє. Не задано —
   * чипа немає (імпорт у картці).
   */
  kindOptions?: DraftKindOption[];
  onChangeKind?: (kind: DraftKindOption | null) => void;
}) {
  const kindChip =
    kindOptions && onChangeKind && !draft.catalog?.modelId ? (
      <KindChip value={draft.catalog ?? null} options={kindOptions} disabled={disabled} onChange={onChangeKind} />
    ) : null;
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 p-3 transition-colors",
        !draft.selected && "opacity-50"
      )}
    >
      <div className="flex items-start gap-3">
        {onRemove ? null : (
          <Checkbox
            checked={draft.selected}
            disabled={disabled}
            aria-label={`Імпортувати «${draft.name}»`}
            onCheckedChange={(checked) => onPatch({ selected: checked === true })}
            // Монохром: галочка тут не статус, а «беремо/не беремо» —
            // синій робив із неї акцент сильніший за саму позицію.
            className="mt-1.5 data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
          />
        )}
        <ImportItemPhoto preview={preview} name={draft.name} />
        <div className="min-w-0 flex-1 space-y-2">
          {/* Назва й тираж — в одному рядку: тираж це коротке число, а власний
              рядок під нього коштував би на двадцяти семи позиціях цілого
              екрана прокрутки. */}
          <div className="flex flex-wrap items-start gap-2">
            <Input
              value={draft.name}
              disabled={disabled}
              controlSize="md"
              aria-label="Назва позиції"
              placeholder={namePlaceholder}
              autoFocus={autoFocusName}
              className="min-w-[12rem] flex-1"
              onChange={(event) => onPatch({ name: event.target.value })}
            />
            {/*
              ТИРАЖІ Й ДІЇ — ОДНІЄЇ ВИСОТИ З НАЗВОЮ, БЕЗ ЗАЙВИХ РАМОК.

              Спершу тут була окрема рамка з полями всередині — вона читалась
              як другий блок у рядку й сперечалась із полем назви. Тепер поле
              тиражу таке саме, як поле назви, а «плюс» і кошик — голі іконки,
              як і належить діям. Обидва разом узяті в один блок, щоб при
              переносі вони їхали на новий рядок цілими, а не порізно.

              Хрестик прибирання тиражу живе ВСЕРЕДИНІ поля й показується під
              курсором: на кутах він читався як значок помилки.
            */}
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                {draft.runs.length > 1 ? "Тиражі" : "Тираж"}
              </span>
              {draft.runs.map((run) => (
                <div key={run.key} className="group/run relative">
                  <NumberInput
                    value={run.quantity > 0 ? run.quantity : null}
                    min={0}
                    emptyValue={0}
                    controlSize="md"
                    className={cn(
                      // Підказка гасне, щойно в поле стали: стандартний
                      // placeholder висить, поки не почнеш друкувати, і на
                      // вузькому полі це читається як уже введене значення.
                      "w-20 text-center focus:placeholder:text-transparent",
                      onRemoveRun && draft.runs.length > 1 && "pr-6"
                    )}
                    placeholder="к-ть"
                    disabled={disabled}
                    aria-label="Кількість тиражу"
                    onValueChange={(next) => onPatchRun(run.key, { quantity: Math.max(0, next ?? 0) })}
                  />
                  {onRemoveRun && draft.runs.length > 1 ? (
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label="Прибрати тираж"
                      onClick={() => onRemoveRun(run.key)}
                      className="absolute right-1.5 top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/run:opacity-100"
                    >
                      <X className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                  ) : null}
                </div>
              ))}
              {onAddRun ? (
                <button
                  type="button"
                  disabled={disabled}
                  aria-label="Додати ще тираж"
                  title="Клієнт просить порахувати кілька кількостей"
                  onClick={onAddRun}
                  className={ICON_ACTION}
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}
              {onRemove ? (
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Прибрати «${draft.name || "позицію"}»`}
                  onClick={onRemove}
                  className={cn(ICON_ACTION, "hover:bg-danger-soft hover:text-danger-foreground")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
            {/*
              Мітки рядка й варіанта більше не пігулки: пігулка обіцяє дію або
              стан, а це просто підпис звідки взялась позиція. Пігулка лишилась
              там, де вона щось означає, — на попередженні про діапазон.
            */}
            {draft.sourceRows.length > 0 ? (
              <span className="text-muted-foreground">рядок {draft.sourceRows.join(", ")}</span>
            ) : null}
            {/* Позиція з каталогу каже це категорією, а не плашкою «з бази»:
                «Худі · Одяг» — і зрозуміло, звідки вона, і що це таке. */}
            {draft.catalog?.modelId ? (
              <span className="text-muted-foreground">
                {draft.catalog.kindName} · {draft.catalog.typeName}
              </span>
            ) : draft.catalog ? (
              // Вид є, моделі ще немає: на «Створити» товар стане рядком каталогу.
              <span className="text-muted-foreground">додасться в базу</span>
            ) : null}
            {/* Зв'язок варіантів — словами. Бедж «альтернатива» казав, що щось
                не так, але не казав що саме: під номером 30 у файлі лежать два
                різних дзен-сади, і це вибір із двох, а не два товари. */}
            {draft.variant ? (
              <span className="font-medium text-muted-foreground">
                варіант {draft.variant.index} з {draft.variant.total} того самого товару
              </span>
            ) : null}
            {draft.flags.map((flag) => (
              <span
                key={flag}
                className="rounded-full border border-warning-soft-border bg-warning-soft px-2 py-0.5 font-medium text-warning-copy"
              >
                {FLAG_LABELS[flag] ?? flag}
              </span>
            ))}
            {draft.links.map((link) => (
              <a
                key={link}
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                title={link}
                className="inline-flex max-w-[260px] items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
              >
                <Link2 className="h-3 w-3 shrink-0" />
                <span className="truncate underline underline-offset-2">{link.replace(/^https?:\/\//, "")}</span>
              </a>
            ))}
            {/* Причина відсутнього фото стоїть саме тут, поруч із посиланням:
                «сайт не пускає роботів» — це підказка відкрити його руками, а
                не повідомлення про поломку. */}
            {preview && preview.status !== "pending" && preview.status !== "done" ? (
              <span className="text-muted-foreground/70">{preview.reason}</span>
            ) : null}
          </div>

          {/*
            НАНЕСЕННЯ — ЧИПАМИ, ЯК ТИРАЖІ (REQ-182#p16). «Без нанесення» стоїть
            першим і УВІМКНЕНИЙ, поки нічого не обрано: це відповідь, а не
            порожнє поле, — товар без друку буває, і його не треба доводити
            галочкою «я не забув». Клік по методу вимикає «без», кілька
            методів можна: у 46 позицій із 358 нанесень більше за одне.
            Порядок методів — за історією виду, найчастіший перший.
          */}
          {methodOptions && onToggleMethod ? (
            <MethodChips
              options={methodOptions}
              selected={draft.methodIds}
              disabled={disabled}
              onToggle={onToggleMethod}
              lead={kindChip}
            />
          ) : kindChip ? (
            <div className="flex flex-wrap items-center gap-1.5">{kindChip}</div>
          ) : null}

          {draft.comment || draft.notes ? (
            <Input
              value={draft.comment}
              disabled={disabled}
              controlSize="md"
              aria-label="Коментар замовника"
              placeholder={draft.notes ?? "Коментар замовника"}
              onChange={(event) => onPatch({ comment: event.target.value })}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Скільки методів видно одразу; решта — за «ще N». Худі має 7, кепка 8. */
const VISIBLE_METHODS = 3;

/**
 * Нанесення чипами (REQ-182#p16): «Без нанесення» перший і увімкнений, поки
 * нічого не обрано; далі методи виду в порядку історії. Показуємо три
 * найчастіші й обрані, решта за «ще N» (REQ-182#p20): вісім чипів на позицію
 * робили з рядка стіну, а історія каже, що перші два-три покривають більшість.
 */
function MethodChips({
  options,
  selected,
  disabled,
  onToggle,
  lead,
}: {
  options: Array<{ id: string; name: string }>;
  selected: string[];
  disabled?: boolean;
  onToggle: (methodId: string | null) => void;
  /** Чип виду перед методами — методи залежать від нього, тож стоять поруч. */
  lead?: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded
    ? options
    : options.filter((method, index) => index < VISIBLE_METHODS || selected.includes(method.id));
  const hidden = options.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Нанесення">
      {lead}
      <span className="mr-0.5 text-xs text-muted-foreground">Нанесення</span>
      <Chip
        size="sm"
        disabled={disabled}
        active={selected.length === 0}
        aria-pressed={selected.length === 0}
        onClick={() => onToggle(null)}
      >
        Без нанесення
      </Chip>
      {visible.map((method) => {
        const on = selected.includes(method.id);
        return (
          <Chip key={method.id} size="sm" disabled={disabled} active={on} aria-pressed={on} onClick={() => onToggle(method.id)}>
            {method.name}
          </Chip>
        );
      })}
      {hidden > 0 ? (
        <Chip
          size="sm"
          disabled={disabled}
          icon={<ChevronDown />}
          className="border-transparent bg-muted text-muted-foreground"
          onClick={() => setExpanded(true)}
        >
          ще {hidden}
        </Chip>
      ) : null}
    </div>
  );
}

/**
 * Чип виду для рядка без моделі (REQ-182#p18). Вгаданий вид підписаний
 * «припущення» і стоїть пунктиром: це не факт, а здогад з назви сторінки, і
 * від нього залежать методи нанесення — тому виправити його має бути так само
 * легко, як клацнути чип.
 */
function KindChip({
  value,
  options,
  disabled,
  onChange,
}: {
  value: QuoteImportDraftCatalog | null;
  options: DraftKindOption[];
  disabled?: boolean;
  onChange: (kind: DraftKindOption | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const groups = React.useMemo(() => {
    const byType = new Map<string, { typeName: string; kinds: DraftKindOption[] }>();
    for (const option of options) {
      const group = byType.get(option.typeId) ?? { typeName: option.typeName, kinds: [] };
      group.kinds.push(option);
      byType.set(option.typeId, group);
    }
    return [...byType.values()];
  }, [options]);

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
            <>
              {value.kindName}
              {value.guessed ? <span className="font-normal text-muted-foreground"> · припущення</span> : null}
            </>
          ) : (
            "Вид товару?"
          )}
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-64 overflow-y-auto p-1.5">
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
                onClick={() => {
                  onChange(kind);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 truncate">{kind.kindName}</span>
                {value?.kindId === kind.kindId ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            ))}
          </div>
        ))}
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="mt-1 flex w-full items-center rounded-[var(--radius-md)] border-t border-border/60 px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
          >
            Без виду — в каталог не записувати
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
