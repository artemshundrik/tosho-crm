import { ImageOff, Link2, Plus, Trash2, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { cn } from "@/lib/utils";

import type { QuoteImportDraftItem, QuoteImportFlag, QuoteImportLinkPreview } from "./types";

/**
 * Один рядок прев'ю імпорту — той самий у вікні «Імпорт з файлу» й у візарді
 * (REQ-237#p2). Що людина бачить і править: назва, тиражі, коментар; що лише
 * бачить: фото, рядок файлу, зв'язок варіантів, ознаки, посилання.
 */

/** Гола іконка-дія в рядку позиції: та сама вага, що в кошика. */
const ICON_ACTION =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";

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
  const base = "h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-border/60";

  if (!preview) {
    return (
      <div className={cn(base, "flex items-center justify-center bg-muted/40")} aria-hidden>
        <ImageOff className="h-4 w-4 text-muted-foreground/40" />
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
      <ImageOff className="h-4 w-4 text-muted-foreground/50" />
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
}) {
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
                    className={cn(
                      "w-[5.5rem] text-center",
                      onRemoveRun && draft.runs.length > 1 && "pr-6"
                    )}
                    placeholder="скільки"
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

          {draft.comment || draft.notes ? (
            <Input
              value={draft.comment}
              disabled={disabled}
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
