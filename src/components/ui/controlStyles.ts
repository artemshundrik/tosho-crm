export function cx(...arr: Array<string | undefined | false | null>) {
  return arr.filter(Boolean).join(" ");
}

/**
 * Заблокований стан на спільних --control-* токенах — ЄДИНИЙ для кнопки й
 * полів (button.tsx імпортує цей самий рядок): поле й кнопка поруч у панелі
 * мають виглядати однаково заблокованими, і набір міняється в одному місці.
 */
export const CONTROL_DISABLED_STATE = cx(
  "disabled:bg-control-disabled disabled:text-control-disabled-fg disabled:border-control-disabled-border"
);

/**
 * Єдина база стилів для Input / SelectTrigger / ін.
 * Всі кольори — тільки через design tokens.
 */
export const CONTROL_BASE = cx(
  "h-10 rounded-xl bg-muted/40",
  "border border-border/50",
  "text-foreground placeholder:text-muted-foreground",
  // Перелік властивостей ПОІМЕННО, а не `transition-all`. Слово `all` означає
  // буквально все, зокрема ВІДСТУПИ — і саме через це модалки помітно
  // «розгорталися» після відкриття. Ланцюг такий: `space-y-*` у Tailwind v4
  // роздає margin усім дітям, крім останньої; поки React домальовує вміст,
  // контрол на мить перестає бути останнім і його margin міняється. З
  // `transition-all` браузер віз цю зміну 200 мс замість того, щоб перерахувати
  // верстку миттєво, а що вікно центроване — разом із відступом плавно їхала
  // вся модалка (заміряно на «Новому запиті»: 820→804 px, верхній край на 8 px).
  // Доказ знято через document.getAnimations(): там висів CSSTransition саме на
  // margin-bottom тривалістю 200 мс.
  // Той самий рецепт уже застосований нижче для фільтрів — тримаємо однаково.
  "transition-[background-color,border-color,color,box-shadow] duration-200 ease-out",
  "motion-reduce:transition-none",
  "hover:bg-muted/60",
  // Фокус: тільки темніша рамка, без рінга (рінг давав «блюр»-глоу на темній) і
  // тільки focus-visible (клавіатура) — інакше обводка липла на селект-тригері
  // після вибору мишею. Текстові поля браузер і так підсвічує focus-visible при вводі.
  "focus-visible:outline-none focus-visible:bg-background focus-visible:border-foreground/50",
  "disabled:cursor-not-allowed",
  CONTROL_DISABLED_STATE,
  // Стан помилки — через aria-invalid, а не клас: атрибут одночасно повідомляє
  // читача з екрана, тож доступність і вигляд не розʼїжджаються.
  "aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:bg-danger-soft/30",
  "aria-[invalid=true]:focus-visible:border-destructive"
  // Кольору іконок тут БІЛЬШЕ НЕМАЄ: [&>svg]:text-muted-foreground перебивав
  // успадкування currentColor, і на активному (синьому) тулбарному контролі
  // іконка лишалась сірою. Глушіння стрілки селекта переїхало в select.tsx.
);

export const TOOLBAR_CONTROL = cx(
  CONTROL_BASE,
  "px-3.5"
);

/**
 * База багаторядкового поля — та сама поверхня, що в `Input`.
 *
 * `Textarea` і `AutoTextarea` жили повз `CONTROL_BASE` з власним набором:
 * інший фон (`bg-background` проти `bg-muted/40`), інший фокус (синій ring-2
 * проти темнішої рамки), `disabled:opacity-50` замість спільних токенів і
 * власний радіус. У формі вони стоять просто під інпутами — і не збігались із
 * ними за жодним із цих пунктів.
 *
 * Висоту знімаємо (`h-auto`): у CONTROL_BASE вона розрахована на однорядкове
 * поле, а тут розмір задає вміст. Кегль `text-base` на мобільному навмисно —
 * менший iOS зумить при фокусі.
 */
export const TEXTAREA_BASE = cx(
  CONTROL_BASE,
  "flex h-auto w-full appearance-none px-3 py-2 text-base md:text-sm"
);

/**
 * «Контрол увімкнено» — один рецепт на всі тулбари (REQ-48).
 *
 * ЧОМУ ЦЕ ОКРЕМА КОНСТАНТА. Стан «щось відфільтровано» був написаний руками
 * приблизно сорок разів по базі з шістьма різними непрозоростями рамки
 * (/25 /30 /35 /40 /50 /60) — тобто спільного джерела не існувало, і до
 * тулбарних селектів («Всі статуси», «Всі менеджери») він просто не доїхав:
 * вибраний фільтр виглядав точно як невибраний, хоча ховав частину списку.
 *
 * ЧОМУ СІРИЙ, А НЕ СИНІЙ. Рішення Артема 2026-08-15 на живому тулбарі: увімкнений
 * контрол просто темнішає — фон на щабель, рамка контрастніша, текст і іконка
 * лишаються кольору тексту. Синій варіант він відхилив, подивившись на обидва
 * поруч. Тому фільтр і групування тут виглядають однаково: різницю між «ховає
 * рядки» і «лише перекладає» несе підпис контрола, а не колір.
 */
export const TOOLBAR_CONTROL_ACTIVE = cx(
  "border-control-active-border bg-control-active text-foreground",
  "hover:bg-control-active hover:text-foreground hover:border-control-active-border"
);

/**
 * Тулбарний фільтр-контрол: геометрія TOOLBAR_CONTROL плюс ТИПОГРАФІКА.
 *
 * Типографіка тут, а не в TOOLBAR_CONTROL, навмисно: той самий рецепт носить
 * поле пошуку, а набраний людиною текст і підпис органа керування мають різну
 * вагу. Через це фільтри й розповзлися — кнопки на дошці успадковували
 * font-medium від Button, а селект-тригери лишались 400: те саме 14px, різна
 * вага й трекінг, і ряд виглядав зібраним із двох різних наборів.
 */
export const TOOLBAR_FILTER = cx(
  TOOLBAR_CONTROL,
  "gap-2 text-sm font-medium tracking-[0.01em]",
  // БЕЗ АНІМАЦІЇ НАТИСКУ — свідомо, рішення Артема 2026-08-15.
  //
  // Стиснення кнопки тут пробували двічі й обидва рази воно виходило гіршим за
  // його відсутність: на важких сторінках (дизайн, прорахунки) відкриття меню
  // блокує головний потік приблизно на 120 мс, і перший кадр приходить, коли
  // кнопку вже відпущено. Через це рух показувався через раз і смикався.
  // Прибирати треба саме тут: фільтри всіх сторінок і дошки беруть цей рецепт.
  //
  // Лишається тихий відгук кольором — фон і рамка, без жодного руху.
  "transition-[background-color,border-color,color,box-shadow] duration-base ease-out",
  "motion-reduce:transition-none active:bg-muted",
  // active:scale-100 глушить стиснення, яке приходить із варіанта `Button`:
  // фільтр — це кнопка, тож без цього рядка рух повернувся б через варіант.
  "active:scale-100",
  // БЕЗ РІНГА НА ФОКУСІ — і це не примха, а те, що вже написано в CONTROL_BASE:
  // тулбарний контрол показує фокус ТІЛЬКИ темнішою рамкою. Ринг приїжджав
  // сюди з базового рецепта `Button` (focus-visible:ring-2) і перебивав це.
  //
  // Видно було так: вибираєш значення мишею, меню закривається, Radix програмно
  // повертає фокус на тригер — і Chrome зараховує це за focus-visible. Обводка
  // спалахувала вже ПІСЛЯ вибору й липла, доки не клацнеш деінде, а з клавіатури
  // чи мишею — залежало від того, як фокус повернувся, тож «через раз».
  //
  // Доступність не страждає: focus-visible:border-foreground/50 із CONTROL_BASE
  // лишається, тобто видимий індикатор фокуса нікуди не дівається.
  "focus-visible:ring-0 focus-visible:ring-offset-0"
);

/**
 * Кнопка-дія тулбара («Новий прорахунок»). Тільки геометрія: перехід і натиск
 * приходять з бази `Button`. Раніше тут стояли власні `transition-all
 * duration-200`, які перебивали базу — і кнопки дій натискались інакше за
 * фільтри поруч, хоча обидва — кнопки.
 */
export const TOOLBAR_ACTION_BUTTON = cx("h-10 rounded-xl px-4");

export const CONTROL_ICON_BTN = cx(
  "inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)]",
  "text-muted-foreground hover:text-foreground",
  "hover:bg-muted",
  // Нейтральний фокус, як у решти контролів (без синього рінга).
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
);

export const SEARCH_WRAP = cx("relative flex-1 max-w-[520px] min-w-[240px]");
export const SEARCH_LEFT_ICON = cx(
  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
);
export const SEARCH_INPUT = cx(TOOLBAR_CONTROL, "pl-9 pr-9");
export const SEARCH_CLEAR_BTN_POS = cx("absolute right-2 top-1/2 -translate-y-1/2");

export const SEGMENTED_GROUP = cx(
  "inline-flex p-1 h-11 items-center rounded-xl border border-border/50 bg-muted/40"
);

export const SEGMENTED_GROUP_SM = cx(
  "inline-flex p-0.5 h-9 items-center rounded-lg border border-border/50 bg-muted/40"
);

/**
 * Спільна частина сегментованого перемикача: поведінка й обидва стани «вибрано».
 *
 * Два стани, а не один, бо набір обслуговує і `Tabs` (`data-state=active`), і
 * `ToggleGroup` (`data-state=on`) — Radix називає вибране по-різному. Раніше
 * весь цей блок був виписаний двічі, у великому й малому рецептах: правку
 * стану доводилось робити в двох місцях, і розійтися вони могли будь-коли.
 * Розмір лишається на місці виклику — тільки він і відрізняє великий від малого.
 */
const SEGMENTED_TRIGGER_BASE = cx(
  "flex-1 inline-flex items-center justify-center font-medium",
  "transition-all duration-base ease-out motion-reduce:transition-none",
  "text-muted-foreground hover:text-foreground hover:bg-background/50",
  "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:ring-1 data-[state=active]:ring-[hsl(var(--soft-ring))]",
  "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-[hsl(var(--soft-ring))]"
);

export const SEGMENTED_TRIGGER = cx(SEGMENTED_TRIGGER_BASE, "gap-2 h-9 rounded-lg px-4 text-sm");

export const SEGMENTED_TRIGGER_SM = cx(SEGMENTED_TRIGGER_BASE, "gap-1.5 h-7 rounded-md px-3 text-xs");

/**
 * Найдрібніший розмір — рівно під рядок ПІДПИСУ поля (`min-h-5`).
 *
 * Потрібен там, де перемикач уточнює сусіднє поле й не має права додавати блоку
 * висоти: у рядку підпису вільне місце вже є, а окремий ярус під полем розсував
 * би сітку цін на цілий рядок (REQ-232).
 */
export const SEGMENTED_GROUP_XS = cx(
  "inline-flex p-px h-5 items-center rounded-md border border-border/50 bg-muted/40"
);

export const SEGMENTED_TRIGGER_XS = cx(
  SEGMENTED_TRIGGER_BASE,
  "h-full rounded-[5px] px-1.5 text-2xs whitespace-nowrap"
);
