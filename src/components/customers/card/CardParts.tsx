import { createContext, useContext, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Дрібні будівельні шматки картки замовника (варіант А, REQ-349#p11):
 * поле, що редагується на місці, підпис розділу й сам розділ.
 *
 * ПОЛЕ НА МІСЦІ. У спокої воно читається як текст — без рамки й фону; рамка
 * зʼявляється на наведенні, а на фокусі стає темнішою, як у звичайного поля.
 * Тоді картка не виглядає формою, але кожне значення можна виправити одним
 * кліком, без «Змінити».
 *
 * Два стани з кольором, і обидва — в самому полі, а не плашкою поруч:
 * «бракує для рахунку» (`need`) і «формат не той» (`bad`, через aria-invalid —
 * так само, як у всіх полях застосунку).
 */

/** Класи для `Input`/`DigitsInput`/`PrefixField`, щоб поле стало «на місці». */
export const INLINE_CONTROL = cn(
  "border-line-strong bg-card hover:border-foreground/30",
  "focus-visible:border-foreground/50 focus-within:border-foreground/50",
);
/** Бракує для рахунку: лише обводка, без жовтого фону — бейдж «для рахунку» поруч і так каже. */
export const INLINE_NEED = "border-warning-soft-border hover:border-warning-soft-border";

export type PartyFieldTone = "default" | "need" | "bad";

export function PartyField(props: {
  label: ReactNode;
  /** id поля всередині — підпис стає його `label`. */
  htmlFor?: string;
  tone?: PartyFieldTone;
  /** Сірий хвостик біля підпису: «за IBAN». */
  hint?: ReactNode;
  error?: string | null;
  /** Розтягнути на обидві колонки сітки. */
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 content-start gap-0.5", props.wide && "sm:col-span-2", props.className)}>
      <div className="flex min-h-[18px] flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <label htmlFor={props.htmlFor}>{props.label}</label>
        {props.tone === "need" ? (
          <span className="rounded-full bg-warning-soft px-1.5 text-3xs font-medium text-warning-foreground">для рахунку</span>
        ) : null}
        {props.hint ? <span>· {props.hint}</span> : null}
      </div>
      {props.children}
      {props.error ? <p className="text-xs text-danger-foreground">{props.error}</p> : null}
    </div>
  );
}

/** Підпис розділу: дрібні великі літери, як у всіх розділах картки. */
export function PartySectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>;
}

/**
 * Розділ картки. Один компонент на два місця: у панелі розділи йдуть
 * стрічкою через лінію, на сторінці — окремими картками. Хто що малює,
 * каже `PartySectionLayout` згори, тож розділи з PanelSections не знають,
 * де вони стоять.
 */
const LayoutContext = createContext<"drawer" | "card">("drawer");
export const PartySectionLayout = LayoutContext.Provider;

export function PartySection(props: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  const layout = useContext(LayoutContext);
  return (
    <section
      data-testid={props["data-testid"]}
      className={cn(
        "flex min-w-0 flex-col gap-2.5",
        layout === "card" ? "rounded-xl border border-line bg-card px-5 py-4" : "border-t border-line-subtle px-5 py-4 first:border-t-0",
        props.className,
      )}
    >
      <div className="flex min-h-5 items-center gap-2">
        <PartySectionTitle>{props.title}</PartySectionTitle>
        {props.aside ? <span className="ml-auto flex items-center gap-2 text-xs">{props.aside}</span> : null}
      </div>
      {props.children}
    </section>
  );
}
