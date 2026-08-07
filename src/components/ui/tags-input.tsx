import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

/**
 * Кілька значень пілюлями, з підказкою вже наявних.
 *
 * Навіщо: у полі вільним текстом кожен пише по-своєму, і однакова послуга
 * розповзається на варіанти — у підрядниках зараз живуть «гравіювання»,
 * «гравірування» і «Гравіювання, УФ-друк» як три різні речі. Пілюлі роблять
 * повтор видимим: спершу бачиш, що вже є, і лише потім заводиш нове.
 *
 * Значення лишається РЯДКОМ через кому — так само, як лежало в базі досі. Це
 * свідомо: 12 із 38 підрядників уже писали кілька послуг через кому, тобто
 * дані вже такі, просто ними ніхто не вмів користуватись.
 */
export function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function joinTags(tags: string[]): string {
  return tags.join(", ");
}

/** Порівняння без регістру — щоб «Дерево» і «дерево» не жили окремо. */
const sameTag = (left: string, right: string) =>
  left.trim().toLocaleLowerCase("uk") === right.trim().toLocaleLowerCase("uk");

export function TagsInput({
  value,
  onValueChange,
  options,
  placeholder,
  id,
}: {
  /** Рядок через кому — той самий формат, що в базі. */
  value: string;
  onValueChange: (next: string) => void;
  /** Усі відомі варіанти (вже розібрані на окремі теги). */
  options: string[];
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);

  const tags = React.useMemo(() => splitTags(value), [value]);

  const matches = React.useMemo(() => {
    const query = draft.trim().toLocaleLowerCase("uk");
    const pool = Array.from(new Set(options.map((option) => option.trim()).filter(Boolean)));
    return pool
      .filter((option) => !tags.some((tag) => sameTag(tag, option)))
      .filter((option) => (query ? option.toLocaleLowerCase("uk").includes(query) : true))
      .sort((left, right) => left.localeCompare(right, "uk"))
      .slice(0, 8);
  }, [options, draft, tags]);

  React.useEffect(() => {
    setHighlight(0);
  }, [matches.length]);

  const addTag = (raw: string) => {
    const next = raw.trim();
    if (!next) return;
    // Дубль не додаємо мовчки — просто нічого не стається, пілюля вже є.
    if (tags.some((tag) => sameTag(tag, next))) {
      setDraft("");
      return;
    }
    onValueChange(joinTags([...tags, next]));
    setDraft("");
  };

  const removeTag = (target: string) => {
    onValueChange(joinTags(tags.filter((tag) => tag !== target)));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      // Enter бере підсвічену підказку, якщо список відкритий, інакше — набране.
      addTag(open && matches.length > 0 ? matches[highlight] ?? draft : draft);
      return;
    }
    if (event.key === "Backspace" && !draft && tags.length > 0) {
      // Порожнє поле + Backspace знімає останню пілюлю — звичний жест.
      removeTag(tags[tags.length - 1]);
      return;
    }
    if (!open || matches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((prev) => (prev + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((prev) => (prev - 1 + matches.length) % matches.length);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="space-y-2">
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 py-1 pl-2.5 pr-1 text-xs font-medium text-foreground"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Прибрати «${tag}»`}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <Popover open={open && matches.length > 0} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Input
              id={id}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                // Недописане не втрачаємо: те, що набрали й пішли, стає пілюлею.
                if (draft.trim()) addTag(draft);
              }}
              onKeyDown={handleKeyDown}
              placeholder={tags.length > 0 ? "Додати ще…" : placeholder}
              autoComplete="off"
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="w-[var(--radix-popover-trigger-width)] p-1"
          // Фокус лишається в полі — людина продовжує друкувати, список звужується.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className="flex flex-col">
            {matches.map((option, index) => (
              <button
                key={option}
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => {
                  // mousedown, а не click: інакше blur поля спрацює раніше.
                  event.preventDefault();
                  addTag(option);
                }}
                className={cn(
                  "truncate rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                  index === highlight ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
