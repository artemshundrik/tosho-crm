import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { ChevronDown, ChevronUp, Eye, Maximize2, X } from "@/components/icons/appIcons";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { cn } from "@/lib/utils";

/**
 * Прев'ю справи збоку (хвиля В1, REQ-346#p1): прорахунок, замовлення,
 * дизайн-задача — без переходу на сторінку.
 *
 * ЧОМУ НЕ ДРОВЕР. `SheetContent` модальний: затемнює список, ловить фокус і
 * забирає клавіатуру. Прев'ю існує заради протилежного — гортати справи J/K,
 * не губити прокрутку й не перезавантажувати список, тож на десктопі це
 * звичайна колонка поверх правого краю, без підкладки й без пастки фокуса.
 * На телефоні список під шторкою однаково не видно, і там це нижній аркуш
 * на 90% висоти, що закривається свайпом униз.
 *
 * Адреса не міняється: прев'ю — погляд, а не перехід. Замка редагування
 * прев'ю не бере.
 */
export type EntityPeekProps = {
  /** Розділ у крихтах: «Прорахунки», «Замовлення», «Дизайн». */
  section: string;
  number: string;
  numberCopyMessage: string;
  title: ReactNode;
  /** Чипи `EntityProp` — той самий рядок, що в шапці картки. */
  properties?: ReactNode;
  /** Одна головна дія й, за потреби, другорядна. */
  actions?: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  onOpenFull: () => void;
  onPrev?: () => void;
  onNext?: () => void;
};

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
};

export function EntityPeek(props: EntityPeekProps) {
  const narrow = useIsNarrowViewport();
  const { onClose, onOpenFull, onPrev, onNext } = props;

  // Клавіші — лише на десктопі: на телефоні їх немає, а Esc закриває аркуш сам.
  useEffect(() => {
    if (narrow) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Спливне меню чи діалог уже обробили клавішу (Radix ставить
      // preventDefault на своєму Esc) — прев'ю не закриваємо разом із ним.
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "j" || event.key === "о") {
        event.preventDefault();
        onNext?.();
      } else if (event.key === "k" || event.key === "л") {
        event.preventDefault();
        onPrev?.();
      } else if (event.key === "Enter") {
        // Enter на кнопці — це її власний клік.
        if (event.target instanceof HTMLElement && event.target.closest("button, a, [role=menuitem]")) return;
        event.preventDefault();
        onOpenFull();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [narrow, onClose, onOpenFull, onPrev, onNext]);

  if (narrow) return <PeekBottomSheet {...props} />;

  // Портал у body: `.page-reveal` має постійний will-change: transform, і
  // `fixed` усередині сторінки рахувався б від неї, а не від вікна — панель
  // їхала б разом із прокруткою. Під шапкою застосунку, щоб дзвоник і пошук
  // лишались під рукою.
  return createPortal(
    <aside
      aria-label={`Прев'ю: ${props.number}`}
      className="fixed bottom-0 right-0 top-[var(--app-header-height)] z-40 flex w-[440px] max-w-[calc(100vw-48px)] flex-col border-l border-t border-border bg-card shadow-elevated-panel duration-slow animate-in slide-in-from-right"
    >
      <PeekBody {...props} />
      <footer className="flex shrink-0 items-center gap-3 border-t border-border px-4 py-2 text-2xs text-muted-foreground">
        <span><Kbd>J</Kbd> <Kbd>K</Kbd> гортати</span>
        <span><Kbd>Enter</Kbd> відкрити</span>
        <span><Kbd>Esc</Kbd> закрити</span>
      </footer>
    </aside>,
    document.body
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border px-1 font-sans text-3xs text-muted-foreground">
      {children}
    </kbd>
  );
}

const PEEK_ICON_BUTTON =
  "inline-grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:pointer-events-none disabled:opacity-40";

function PeekBody({
  section,
  number,
  numberCopyMessage,
  title,
  properties,
  actions,
  children,
  onClose,
  onOpenFull,
  onPrev,
  onNext,
  showNav = true,
}: EntityPeekProps & { showNav?: boolean }) {
  return (
    <>
      <div className="shrink-0 space-y-2 px-4 pb-3 pt-3">
        <div className="flex min-h-7 items-center gap-1">
          <nav aria-label="Крихти" className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
            <span className="shrink-0">{section}</span>
            <span aria-hidden className="text-muted-foreground/60">/</span>
            <HoverCopyText
              value={number}
              textClassName="font-mono text-sm tabular-nums text-foreground"
              successMessage={numberCopyMessage}
              copyLabel="Скопіювати номер"
            >
              {number}
            </HoverCopyText>
          </nav>
          <div className="ml-auto flex items-center gap-0.5">
            {showNav ? (
              <>
                <button type="button" className={PEEK_ICON_BUTTON} onClick={onPrev} disabled={!onPrev} title="Попередня (K)">
                  <ChevronUp className="size-4" />
                </button>
                <button type="button" className={PEEK_ICON_BUTTON} onClick={onNext} disabled={!onNext} title="Наступна (J)">
                  <ChevronDown className="size-4" />
                </button>
              </>
            ) : null}
            <button type="button" className={PEEK_ICON_BUTTON} onClick={onOpenFull} title="Відкрити повністю (Enter)">
              <Maximize2 className="size-4" />
            </button>
            <button type="button" className={PEEK_ICON_BUTTON} onClick={onClose} title="Закрити (Esc)">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="min-w-0 text-lg font-semibold leading-snug tracking-tight text-foreground">{title}</div>
        {properties ? <div className="flex min-w-0 flex-wrap items-center gap-1.5">{properties}</div> : null}
        {actions ? <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border">{children}</div>
    </>
  );
}

/** Розділ тіла прев'ю: сірий підпис і вміст, розділені лінією від сусідів. */
export function PeekSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>{title}</span>
        {aside ? <span className="ml-auto">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Телефон: аркуш на 90% висоти. Свайп униз за шапку тягне аркуш за пальцем;
 * відпустили нижче 120 px — закрили, вище — повернули на місце.
 */
function PeekBottomSheet(props: EntityPeekProps) {
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef<number | null>(null);

  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <SheetContent
        side="bottom"
        dismissible
        hideClose
        overlayClassName="bg-background/60 backdrop-blur-md"
        className="h-[90dvh] gap-0 rounded-b-none rounded-t-2xl p-0"
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
        aria-describedby={undefined}
      >
        <SheetTitle className="sr-only">{props.number}</SheetTitle>
        <div
          className="flex shrink-0 touch-none justify-center pb-1 pt-2.5"
          onPointerDown={(event) => {
            startYRef.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (startYRef.current === null) return;
            setDragY(Math.max(0, event.clientY - startYRef.current));
          }}
          onPointerUp={() => {
            const shouldClose = dragY > 120;
            startYRef.current = null;
            setDragY(0);
            if (shouldClose) props.onClose();
          }}
          onPointerCancel={() => {
            startYRef.current = null;
            setDragY(0);
          }}
        >
          <span aria-hidden className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        <PeekBody {...props} showNav={false} />
      </SheetContent>
    </Sheet>
  );
}

/**
 * Значок «Прев'ю» в рядку списку. Клік по самому рядку й далі відкриває
 * сторінку — звичка дорожча за новинку, — а прев'ю живе на значку й пробілі.
 */
export function PeekRowButton({ onPeek, active, className }: { onPeek: () => void; active?: boolean; className?: string }) {
  return (
    <button
      type="button"
      title="Прев'ю (пробіл)"
      aria-label="Відкрити прев'ю"
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation();
        onPeek();
      }}
      className={cn(
        PEEK_ICON_BUTTON,
        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        active && "bg-muted text-foreground opacity-100",
        className
      )}
    >
      <Eye className="size-4" />
    </button>
  );
}
