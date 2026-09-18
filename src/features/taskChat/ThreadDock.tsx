import React from "react";
import { createPortal } from "react-dom";
import { MessageSquare, X } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { OverlayPresenceMarker } from "@/components/ui/overlayPresence";
import { cn } from "@/lib/utils";

/**
 * «Обговорення» на сторінці-записі (прорахунок, дизайн-задача) — REQ-294.
 *
 * ДВА ВИГЛЯДИ, ОДНА РЕЙКА. Вистачає сторінці ширини на дві колонки — рейка
 * стоїть праворуч, як і стояла. Не вистачає — вона не падає під увесь вміст
 * (саме це й було вадою: на ноутбуці розмову доводилось шукати в самому низу),
 * а живе в шторці справа, яку відкриває кнопка «Обговорення» з лічильником
 * непрочитаних.
 *
 * ХТО ВИРІШУЄ, ЯКИЙ ВИГЛЯД. CSS, не JS: умова контейнера `record-split`
 * (index.css) від ширини самої сторінки. Док лише дивиться, чи видно колонку-
 * гніздо, і кладе рейку туди, де її видно. Поріг у JS не дублюється.
 *
 * ОДИН ПРИМІРНИК. Рейка змонтована рівно в одному місці — у колонці або в
 * шторці. Друга копія, схована класом, означала б другий канал realtime, другу
 * позначку «прочитано» й подвійну роботу React (project_hidden_mobile_branch).
 * У шторці рейка живе й закритою: закрив-відкрив — чернетка, відповідь і
 * прикріплені файли на місці. Перемонтовується лише при зміні вигляду.
 *
 * ЧОМУ НЕ Sheet. Radix розмонтовує вміст закритої шторки — і чернетка зникала б
 * на кожному закритті. А просто `position: fixed` усередині сторінки не працює:
 * обгортка `.page-reveal` має `will-change: transform`, і фіксований елемент
 * рахувався б від неї, а не від вікна. Тому шторка — власний портал у body.
 */

export type ThreadDockMode = "split" | "stack";

export type ThreadDockHandle = {
  /** Відкрити шторку ззовні — напр. з «Написати в розмову» у стрічці прорахунку. */
  open: () => void;
};

type DockState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  mode: ThreadDockMode | null;
  reportMode: (mode: ThreadDockMode) => void;
  unread: number;
  setUnread: (count: number) => void;
};

const DockContext = React.createContext<DockState | null>(null);

function useDock(): DockState {
  const value = React.useContext(DockContext);
  if (!value) throw new Error("ThreadDock і ThreadDockButton мають стояти всередині ThreadDockProvider");
  return value;
}

/**
 * Спільний стан кнопки й рейки. Вони живуть у різних кінцях сторінки (кнопка —
 * у липкій шапці, рейка — у правій колонці), тож стан тримає провайдер.
 * Сторінку він не перемальовує: діти приходять пропом, і на зміну `open` React
 * оновлює лише кнопку й док.
 */
export function ThreadDockProvider({
  children,
  handleRef,
  onModeChange,
}: {
  children: React.ReactNode;
  handleRef?: React.Ref<ThreadDockHandle>;
  /** Вигляд змінився — сторінці буває що прибрати (прорахунок ховає вкладку «Деталі»). */
  onModeChange?: (mode: ThreadDockMode) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<ThreadDockMode | null>(null);
  const [unread, setUnread] = React.useState(0);

  const onModeChangeRef = React.useRef(onModeChange);
  React.useLayoutEffect(() => {
    onModeChangeRef.current = onModeChange;
  });

  React.useImperativeHandle(handleRef, () => ({ open: () => setOpen(true) }), []);

  const reportMode = React.useCallback((next: ThreadDockMode) => {
    setMode(next);
    // Розклались у дві колонки — шторку закриваємо. Інакше при наступному
    // звуженні вона вистрибнула б сама, без жодного натиску.
    if (next === "split") setOpen(false);
    onModeChangeRef.current?.(next);
  }, []);

  const value = React.useMemo(
    () => ({ open, setOpen, mode, reportMode, unread, setUnread }),
    [open, mode, reportMode, unread]
  );

  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}

/**
 * Вигляд вкладки дизайн-задачі (DesignTaskPage, смуга «ТЗ / Результат / …»).
 * Кнопка стоїть у тій самій смузі, і контрол `Button` був би на 4 px нижчим
 * за вкладки на десктопі й на 4 px вищим на телефоні.
 */
const TAB_LOOK =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-border/45 bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 [&_svg]:size-4";

/**
 * Кнопка «Обговорення» — лише у вузькому вигляді: у двох колонках рейка й так
 * стоїть праворуч, і друга дорога в неї була б зайвою.
 *
 * `look="control"` — звичайна кнопка шапки (прорахунок), `look="tab"` — у
 * смузі вкладок дизайн-задачі, врівень із ними.
 */
export function ThreadDockButton({ look = "control", className }: { look?: "control" | "tab"; className?: string }) {
  const { open, setOpen, unread } = useDock();

  const props = {
    type: "button" as const,
    className: cn("shrink-0 record-split:hidden", look === "tab" && TAB_LOOK, className),
    "aria-label": unread > 0 ? `Обговорення, нових: ${unread}` : "Обговорення",
    "aria-haspopup": "dialog" as const,
    "aria-expanded": open,
    onClick: () => setOpen(true),
  };
  const content = (
    <>
      <MessageSquare />
      {/* На телефоні — сама іконка: поруч стоїть статус або вкладки, вони важливіші. */}
      <span className="max-sm:hidden">Обговорення</span>
      {unread > 0 ? (
        // Та сама мітка, що в дзвіночка сповіщень: «є непрочитане» — синім числом.
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-3xs font-semibold leading-none tabular-nums text-primary-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </>
  );

  return look === "tab" ? (
    <button {...props}>{content}</button>
  ) : (
    <Button variant="outline" size="sm" {...props}>
      {content}
    </Button>
  );
}

export type ThreadRailSlot = {
  /** Рейку справді видно: колонка або відкрита шторка. «Прочитано» — лише тоді. */
  active: boolean;
  /** Хрестик у шапці рейки — лише в шторці. */
  headerAction: React.ReactNode;
  onUnreadChange: (count: number) => void;
};

/**
 * Гніздо рейки в правій колонці + шторка для вузького вигляду.
 *
 * Гніздо сховане класом у вузькому вигляді (`hidden record-split:flex`), і за
 * цим док дізнається вигляд: гніздо видно — дві колонки, ні — шторка.
 * ResizeObserver бачить обидва переходи, бо розмір гнізда при цьому стає нулем
 * або перестає ним бути.
 */
export function ThreadDock({
  className,
  renderRail,
}: {
  /** Класи гнізда в колонці (flex-1, поля). Вигляд вирішує док сам. */
  className?: string;
  renderRail: (slot: ThreadRailSlot) => React.ReactNode;
}) {
  const { open, setOpen, mode, reportMode, setUnread } = useDock();
  const slotRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    let last: ThreadDockMode | null = null;
    const read = () => {
      const next: ThreadDockMode = slot.getClientRects().length > 0 ? "split" : "stack";
      if (next === last) return;
      last = next;
      reportMode(next);
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [reportMode]);

  const close = React.useCallback(() => setOpen(false), [setOpen]);

  return (
    <>
      <div ref={slotRef} className={cn("hidden flex-col record-split:flex", className)}>
        {mode === "split" ? renderRail({ active: true, headerAction: null, onUnreadChange: setUnread }) : null}
      </div>
      {mode === "stack" ? (
        <ThreadDrawer open={open} onClose={close}>
          {renderRail({
            active: open,
            onUnreadChange: setUnread,
            headerAction: (
              <Button
                type="button"
                variant="ghost"
                size="iconXs"
                className="-my-1 -mr-1 text-muted-foreground"
                aria-label="Закрити обговорення"
                onClick={close}
              >
                <X />
              </Button>
            ),
          })}
        </ThreadDrawer>
      ) : null}
    </>
  );
}

/**
 * Шторка справа. Змонтована весь час, поки сторінка вузька; закрита — лише
 * з'їжджає за край і стає `inert`, тож рейка всередині не губить стану.
 */
function ThreadDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Esc — лише якщо його не забрав хтось вище: меню, поповер чи прев'ю файлу
  // з рейки. Radix ловить Esc раніше, у фазі захоплення, і скасовує подію, тож
  // перше натискання закриває меню, а друге — вже шторку.
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  /**
   * Модальність без Radix: поки шторка відкрита, решта застосунку `inert`.
   * Tab не тікає під підкладку, клік повз не натискає нічого під нею, читач
   * екрана її не бачить. Шторка й поповери рейки живуть у порталах поза
   * #root — вони лишаються живими. Фокус іде в шторку, після закриття —
   * назад на кнопку, з якої відкрили. Сторінка під шторкою не прокручується.
   */
  React.useEffect(() => {
    if (!open) return;
    const appRoot = document.getElementById("root");
    const html = document.documentElement;
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = html.style.overflow;

    panelRef.current?.focus({ preventScroll: true });
    if (appRoot) appRoot.inert = true;
    html.style.overflow = "hidden";

    return () => {
      if (appRoot) appRoot.inert = false;
      html.style.overflow = previousOverflow;
      if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true });
    };
  }, [open]);

  const state = open ? "open" : "closed";

  return createPortal(
    <>
      <div
        aria-hidden
        data-state={state}
        onClick={onClose}
        className={cn(
          // Та сама підкладка, що в Sheet, і ті самі такти: відкриття 240 мс,
          // закриття 160. `visibility` переходить лише на закритті — щоб
          // підкладка зникала ПІСЛЯ згасання, а не обривала його; на відкритті
          // вона мусить стати видимою одразу.
          "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-[opacity] duration-slow ease-out motion-reduce:transition-none!",
          "data-[state=closed]:pointer-events-none data-[state=closed]:invisible data-[state=closed]:opacity-0 data-[state=closed]:transition-[opacity,visibility] data-[state=closed]:duration-base"
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Обговорення"
        tabIndex={-1}
        inert={!open}
        data-state={state}
        translate="no"
        className={cn(
          // Ширина — як у широкої колонки дизайн-задачі (25.75rem = 412 px):
          // рейка в шторці виглядає рівно так, як у колонці поруч.
          // Tailwind v4: translate-x-* — окрема властивість `translate`, тож
          // саме її, а не transform, перелічено в переході. `visibility` — лише
          // на закритті: прихований елемент не бере фокус, а його треба
          // поставити в шторку в ту ж мить, як вона відкрилась.
          "notranslate fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-background p-2.5 shadow-elevated-panel outline-none sm:w-[25.75rem] sm:border-l",
          "transition-[translate] duration-slow ease-out motion-reduce:transition-none!",
          "data-[state=closed]:invisible data-[state=closed]:translate-x-full data-[state=closed]:transition-[translate,visibility] data-[state=closed]:duration-base"
        )}
      >
        {/* Поки шторка відкрита, смуга вкладок на телефоні ховається — інакше
            вона лягала б на поле вводу. Маркер живе рівно стільки, скільки
            шторка відкрита (див. overlayPresence). */}
        {open ? <OverlayPresenceMarker /> : null}
        {children}
      </div>
    </>,
    document.body
  );
}
