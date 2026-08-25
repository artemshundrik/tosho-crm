import { flushSync } from "react-dom";

import { acquireLoadingHandoff } from "@/components/app/loadingHandoff";
import { prefersReducedMotion } from "@/lib/theme";

/**
 * МОРФІНГ КАРТКИ В СТОРІНКУ.
 *
 * Клік по картці канбану не просто змінює маршрут: картка лишається на екрані
 * й розкривається в сторінку сутності. Технічно це «контейнерний перехід» —
 * той самий прийом, яким нативні застосунки відкривають картку списку.
 *
 * ЯК ЦЕ ПРАЦЮЄ. Браузер знімає кадр «до», React міняє маршрут, браузер знімає
 * кадр «після» — і анімує між ними ті елементи, у яких збігається
 * `view-transition-name`. Тобто пара потрібна з ОБОХ боків: картка на дошці й
 * корінь сторінки, що відкривається. Ім'я дає CSS за атрибутом `data-morph`
 * (див. index.css), а цей модуль лише вирішує, кому й коли той атрибут стоїть.
 *
 * ЧОМУ ІМ'Я НЕ ВИСИТЬ ПОСТІЙНО, А ВВІМКНЕНЕ ПРАПОРЦЕМ НА <html>. Іменований
 * елемент виймається зі знімка своїх предків і живе окремим шаром. Це саме те,
 * що потрібно нам, — і рівно те, що зламало б хвилю перемикання теми: вона
 * малює коло по `::view-transition-new(root)`, а сторінка з постійним іменем у
 * root уже не входить, тож тема на ній міняється миттєво, обганяючи хвилю.
 * Тому `data-morph-active` на <html> стоїть лише ті кількасот мілісекунд, поки
 * триває перехід картки, а весь інший час імен на сторінці немає взагалі.
 *
 * ЧОМУ ПЕРЕХІД ЗАПУСКАЄМО САМІ, А НЕ ОПЦІЄЮ РОУТЕРА. У react-router є
 * `navigate(href, { viewTransition: true })`, і перший захід був саме таким —
 * але вона працює ЛИШЕ з data-роутером (createBrowserRouter + RouterProvider).
 * Застосунок зібраний на класичному <BrowserRouter> (App.tsx), і там опція
 * мовчки нічого не робить: перевірено в браузері 25.08.2026 —
 * `document.startViewTransition` не викликався жодного разу, хоча атрибути
 * розставлялись правильно. Помилки при цьому немає, тож зловити це можна було
 * тільки очима. Переїзд на data-роутер — окрема велика робота, а перехід
 * запустити самому — три рядки нижче.
 *
 * ЧОМУ flushSync. Знімок «після» береться одразу, щойно функція зворотного
 * виклику повернулась. Звичайний setState у React 19 асинхронний, тож на той
 * момент маршрут ще не перемальовано — і морфити було б НІ В ЩО. Той самий
 * висновок уже записаний у перемикачі теми: React має оновитись УСЕРЕДИНІ
 * callback.
 */

/** Атрибут-мітка на елементі, який бере участь у морфінгу. */
const MORPH_ATTR = "data-morph";

/** Прапорець на <html>: імена морфінгу діють лише поки він стоїть. */
const MORPH_ACTIVE_ATTR = "data-morph-active";

/**
 * Скільки тримати прапорець. Трохи довше за найдовшу анімацію переходу
 * (--morph-duration у index.css), із запасом на кадр знімка «після».
 */
const MORPH_LIFETIME_MS = 700;

/** Картка, яку зараз позначено. Друга позначка вбила б перехід: імена мусять бути унікальні. */
let markedSource: HTMLElement | null = null;
let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
let releaseHandoff: (() => void) | null = null;

type ViewTransition = {
  finished?: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition;
};

/** Чи вміє браузер переходи і чи не просив користувач прибрати рух. */
export function canMorph(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as ViewTransitionDocument;
  if (typeof doc.startViewTransition !== "function") return false;
  return !prefersReducedMotion();
}

function clearMorphState() {
  if (cleanupTimer !== null) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
  if (markedSource) {
    markedSource.removeAttribute(MORPH_ATTR);
    markedSource = null;
  }
  if (releaseHandoff) {
    releaseHandoff();
    releaseHandoff = null;
  }
  if (typeof document !== "undefined") {
    document.documentElement.removeAttribute(MORPH_ACTIVE_ATTR);
  }
}

/**
 * Відкрити сторінку так, щоб `source` розкрився в неї.
 *
 * `run` — звичайна навігація (`navigate(href)`); жодних додаткових опцій їй не
 * треба. Коли переходи недоступні або людина просила прибрати рух, `run` просто
 * виконується: відкриття сторінки не залежить від того, чи вийшла анімація.
 */
export function morphNavigate(source: HTMLElement | null | undefined, run: () => void) {
  if (!source || !canMorph()) {
    run();
    return;
  }

  // Попередній морфінг міг не догоріти — наприклад, коли по картках клацнули
  // двічі поспіль. Два однакові імена в одному кадрі скасовують перехід цілком,
  // тож старе знімаємо перед тим, як ставити нове.
  clearMorphState();

  source.setAttribute(MORPH_ATTR, "surface");
  document.documentElement.setAttribute(MORPH_ACTIVE_ATTR, "");
  markedSource = source;

  // Каркас сторінки мусить намалюватись У ТОМУ Ж кадрі, що й зміна маршруту, —
  // інакше морфити буде НІ В ЩО. Типово каркас чекає 150 мс, щоб не блимати на
  // швидких відкриттях; тут це шкодить: кадр «після» знімається одразу, і
  // сторінка в ньому має бути порожня рівно ті самі 150 мс.
  //
  // Окремого прапорця під це не заводимо: у каркасів уже є естафета, і морфінг
  // — саме той випадок, під який її придумали (очікування, у якому попередній
  // кадр уже показано). Тож морфінг просто бере слот естафети на свій час.
  releaseHandoff = acquireLoadingHandoff();

  const doc = document as ViewTransitionDocument;
  const transition = doc.startViewTransition!(() => {
    flushSync(run);
  });

  // Таймер лишається СТОРОЖЕМ, а не основним способом прибирання: браузер має
  // право скасувати перехід (вкладка сховалась, зверху почався інший перехід),
  // і тоді `finished` відхиляється. Прибрати треба в обох випадках, інакше
  // прапорець залипне й зіпсує наступну хвилю теми.
  transition.finished?.then(clearMorphState).catch(clearMorphState);
  cleanupTimer = setTimeout(clearMorphState, MORPH_LIFETIME_MS);
}
