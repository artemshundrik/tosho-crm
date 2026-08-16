/**
 * Тема інтерфейсу: світла, темна або «як у системі» (REQ-52).
 *
 * ЧОМУ ТРЕТІЙ РЕЖИМ — НЕ ПРИКРАСА. До цієї задачі перемикач був тумблером на
 * два стани, і «системного» стану не існувало навіть на початку: перший же
 * рендер записував у localStorage конкретну тему, тож застосунок назавжди
 * відв'язувався від налаштування ОС. У кого ввечері темніє система, у того CRM
 * лишалась світлою, поки він не перемкне руками.
 *
 * Тепер у сховищі живе НАМІР користувача (`light` | `dark` | `system`), а те,
 * що реально малюється, обчислюється з наміру та поточного стану ОС. Ці дві
 * речі свідомо розведені: `preference` — що вибрала людина, `resolved` — який
 * клас висить на <html> прямо зараз.
 *
 * Модуль не читає DOM на рівні файлу — лише всередині функцій. Завдяки цьому
 * чиста логіка (нормалізація, обчислення, підписи) перевіряється юнітами в
 * node-середовищі, де ні window, ні document немає.
 */

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Ключ у localStorage. Той самий, що й до задачі, — щоб вибір не скинувся. */
export const THEME_STORAGE_KEY = "theme";

/**
 * Подія про зміну теми на window.
 *
 * Перемикачів у шапці два (десктопний і той, що в мобільному меню), і поза
 * ними є споживачі за межами AppLayout — наприклад тости. Замість контексту
 * через півзастосунку вони слухають одну подію: джерело правди — клас на
 * <html>, а подія лише каже, що він змінився.
 */
export const THEME_CHANGE_EVENT = "tosho:theme-change";

export type ThemeChangeDetail = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
};

export type ThemeOption = {
  value: ThemePreference;
  label: string;
};

/**
 * Порядок варіантів у меню.
 *
 * Спершу дві явні теми, «системна» — третя: вона не альтернатива світлій і
 * темній, а відмова вибирати. Цей же порядок тримає рух стрілками з
 * клавіатури.
 *
 * Пояснень під назвами свідомо немає (рішення Артема 2026-08-16): «Світла»,
 * «Темна» і «Системна» не потребують розшифровки, а два рядки тексту робили з
 * трьох пунктів меню окрему панель налаштувань.
 */
export const THEME_OPTIONS: ThemeOption[] = [
  { value: "light", label: "Світла" },
  { value: "dark", label: "Темна" },
  { value: "system", label: "Системна" },
];

const THEME_LABELS: Record<ThemePreference, string> = {
  light: "світла",
  dark: "темна",
  system: "як у системі",
};

export function normalizeThemePreference(value: unknown): ThemePreference {
  if (typeof value !== "string") return "system";
  const normalized = value.trim().toLowerCase();
  if (normalized === "light" || normalized === "dark" || normalized === "system") {
    return normalized;
  }
  // Порожньо або сміття — «системна». Порожнє сховище тепер означає не
  // «світла за замовчуванням», а «ще нічого не вибирали, йди за пристроєм».
  return "system";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  return systemPrefersDark ? "dark" : "light";
}

/**
 * Підпис кнопки — і для скрінрідера (aria-label), і для тултипа.
 *
 * У системному режимі називає обидва факти: який режим вибрано і яка тема
 * зараз насправді. Інакше на кнопці місяць, у меню «Системна», і зв'язок між
 * ними доводиться вгадувати.
 */
export function themeSwitcherLabel(preference: ThemePreference, resolved: ResolvedTheme): string {
  if (preference === "system") {
    return `Тема: як у системі (зараз ${THEME_LABELS[resolved]})`;
  }
  return `Тема: ${THEME_LABELS[preference]}`;
}

/**
 * Заголовок меню — «Тема · системна».
 *
 * Поточний режим переїхав сюди з рядків: у меню з трьох пунктів достатньо
 * одного місця, де написано, що зараз обрано, а галочка показує, який це
 * рядок.
 */
export function themeMenuTitle(preference: ThemePreference): string {
  const option = THEME_OPTIONS.find((item) => item.value === preference);
  return `Тема · ${(option?.label ?? "").toLowerCase()}`;
}

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

function matchDarkScheme(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  try {
    return window.matchMedia(DARK_SCHEME_QUERY);
  } catch {
    return null;
  }
}

export function systemPrefersDark(): boolean {
  return matchDarkScheme()?.matches ?? false;
}

export function readThemePreference(): ThemePreference {
  try {
    return normalizeThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Приватний режим або заблоковане сховище — не привід падати.
    return "system";
  }
}

export function storeThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // ignore
  }
}

/** Яка тема намальована прямо зараз (за класом на <html>). */
export function currentResolvedTheme(): ResolvedTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Єдине місце, де тема реально застосовується до сторінки.
 *
 * Ідемпотентна: повторний виклик із тим самим значенням нічого не змінює й
 * події не шле — тож ефект у React може спокійно її смикати.
 */
export function applyResolvedTheme(preference: ThemePreference, resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const changed = root.classList.contains("dark") !== (resolved === "dark");
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.themePreference = preference;
  if (!changed) return;
  window.dispatchEvent(
    new CustomEvent<ThemeChangeDetail>(THEME_CHANGE_EVENT, { detail: { preference, resolved } })
  );
}

export function subscribeToSystemTheme(onChange: (prefersDark: boolean) => void): () => void {
  const media = matchDarkScheme();
  if (!media) return () => {};
  const handler = (event: MediaQueryListEvent) => onChange(event.matches);
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}

export function subscribeToResolvedTheme(onChange: (resolved: ResolvedTheme) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<ThemeChangeDetail>).detail;
    onChange(detail?.resolved ?? currentResolvedTheme());
  };
  window.addEventListener(THEME_CHANGE_EVENT, handler);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, handler);
}

type ViewTransition = {
  finished: Promise<void>;
  /**
   * Резолвиться, коли псевдоелементи переходу вже створені — раніше цього
   * анімувати їх нема чого. Відхиляється, якщо браузер перехід скасував.
   */
  ready?: Promise<void>;
  updateCallbackDone?: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition;
};

/**
 * Чи саме зараз іде хвиля перемикання теми.
 *
 * Позначка на <html> живе рівно від старту переходу до його завершення — і
 * слугує не лише для CSS: за нею React-споживачі розуміють, що оновитись треба
 * синхронно, поки браузер не зняв кадр «після».
 */
export function isThemeTransitionInFlight(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.hasAttribute("data-theme-switching");
}

/**
 * Темп хвилі — три підходи Артема 2026-08-16, тож історія тут же.
 *
 * Було 520 мс із cubic-bezier(0.22, 1, 0.36, 1) — «квінтичний» ease-out, у
 * якого останні 20% радіуса займали майже половину часу: хвиля наприкінці ніби
 * застрягала в дальньому куті. 320 мс із різким стартом вийшли рвані. Тут
 * середнє: старт м'який, а кінець і далі приходить на ходу — друга контрольна
 * точка нижча за одиницю, тобто підповзання немає.
 *
 * Пам'ятати при наступному підборі: площа кола росте як КВАДРАТ радіуса, тож
 * будь-яке сповільнення під кінець читається сильніше, ніж записано в кривій.
 */
const REVEAL_DURATION_MS = 460;
const REVEAL_EASING = "cubic-bezier(0.42, 0.04, 0.3, 0.96)";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Перемикання теми з круговим проявленням із точки натискання.
 *
 * Робиться через View Transitions API: браузер знімає «до» і «після» і
 * розводить їх анімацією, тож жодного мигтіння півперемальованим інтерфейсом
 * не буває. Де API немає (старий Firefox) або де в системі увімкнено
 * «зменшити рух» — тема просто перемикається миттєво, без анімації; це не
 * деградація, а свідомо той самий результат без руху.
 *
 * `origin` — центр кола, зазвичай центр кнопки-тригера. Без нього коло йде з
 * правого верхнього кута, де перемикач і стоїть у шапці.
 *
 * `commit` — ВСІ інші зміни, які мають потрапити в ту саму хвилю: перемальовка
 * React-стану (іконка кнопки, логотип, шапка). Це не зручність, а умова
 * працездатності. Браузер знімає кадр «до» не в момент виклику, а на
 * найближчому перемальовуванні — і якщо React встигне оновитись раніше, у
 * кадрі «до» вже буде нова тема. Тоді хвиля розводить два однакові кадри:
 * видно, що тема перемкнулась ОДРАЗУ, а ефект приходить після неї й ні на що
 * не схожий. Тому все, що змінює вигляд, робиться синхронно всередині
 * зворотного виклику переходу.
 */
export function applyThemeWithTransition(
  preference: ThemePreference,
  resolved: ResolvedTheme,
  origin?: { x: number; y: number } | null,
  commit?: () => void
): void {
  if (typeof document === "undefined") return;

  // Порядок важливий: спершу клас і подія (на неї синхронно відгукуються всі
  // перемикачі й шапка), і лише потім локальний стан. Навпаки — і `commit`
  // почав би React-рендер, усередині якого прилітала б подія: оновлення на
  // неї опинилось би посеред фази ефектів, звідки синхронно оновлюватись не
  // можна. Для знімка «після» порядок значення не має — обидві зміни все одно
  // всередині зворотного виклику.
  const applyAll = () => {
    applyResolvedTheme(preference, resolved);
    commit?.();
  };

  const doc = document as ViewTransitionDocument;
  const alreadyDark = document.documentElement.classList.contains("dark");
  const changesLook = alreadyDark !== (resolved === "dark");

  if (!changesLook || prefersReducedMotion() || typeof doc.startViewTransition !== "function") {
    applyAll();
    return;
  }

  const root = document.documentElement;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const x = origin?.x ?? width;
  const y = origin?.y ?? 0;
  // Радіус — до найдальшого кута екрана, інакше коло зупиниться, не накривши
  // всю сторінку, і в кутку лишиться шматок старої теми.
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));

  // ВСЕ У ВІДСОТКАХ, не в пікселях. Знімок переходу — окремий шар, і його
  // піксельна система координат не зобов'язана збігатися з піксельною системою
  // сторінки: масштаб вкладки (Cmd +/−), щільність екрана, зовнішній монітор —
  // будь-що з цього зсуває коло, якщо задавати його в px. Відсотки рахуються
  // від самого шару, тож центр лишається там, куди тиснули, за будь-якого
  // масштабу. Відсоток радіуса за специфікацією рахується від діагоналі,
  // поділеної на корінь із двох, — звідси дільник.
  const originX = (x / width) * 100;
  const originY = (y / height) * 100;
  const radiusPercent = (radius / (Math.hypot(width, height) / Math.SQRT2)) * 100;

  root.dataset.themeSwitching = "";

  const transition = doc.startViewTransition(applyAll);

  // Браузер має право скасувати перехід — коли вкладка сховалась, коли зверху
  // почався інший перехід, коли сторінка ще не намальована. Тоді `ready`
  // відхиляється, і без `catch` кожне таке скасування падає в консоль помилкою
  // «Transition was aborted because of invalid state». Сама тема при цьому
  // перемикається як слід: клас уже поставила функція зворотного виклику,
  // скасовується лише анімація.
  transition.ready
    ?.then(() => {
      // Коло малюється ТУТ, а не в @keyframes із CSS-змінними. Псевдодерево
      // переходу живе окремо від документа, і чи доїжджають у нього змінні з
      // <html> — залежить від збірки браузера: у вбудованому переглядачі
      // доїжджали, у звичайному Chrome бралися запасні значення (кут екрана й
      // 150vmax), тож хвиля йшла не з місця натиску й іншим темпом. Числа
      // всередині анімації жодного успадкування не потребують.
      try {
        const at = `at ${originX}% ${originY}%`;
        root.animate(
          {
            clipPath: [`circle(0% ${at})`, `circle(${radiusPercent}% ${at})`],
          },
          {
            duration: REVEAL_DURATION_MS,
            easing: REVEAL_EASING,
            pseudoElement: "::view-transition-new(root)",
          }
        );
      } catch {
        // Немає підтримки анімації псевдоелемента — тема просто перемкнеться
        // без хвилі. Клас уже стоїть, тож нічого не ламається.
      }
    })
    .catch(() => {});
  transition.updateCallbackDone?.catch(() => {});

  transition.finished
    .catch(() => {})
    .finally(() => {
      delete root.dataset.themeSwitching;
    });
}
