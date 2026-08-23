/**
 * Замір блокування головного потоку під час пошуку.
 *
 * НАВІЩО. Скарги «список підвисає» перевіряються числом, а не відчуттям. Цей
 * замір дає одну цифру на сторінку: скільки довгих задач (>50 мс) дає одна
 * серія набору в полі пошуку. Ціль — жодної.
 *
 * ЯК ЗАПУСТИТИ. Відкрити потрібну сторінку в проді, DevTools → Console,
 * вставити ВЕСЬ цей файл, потім:
 *
 *     await measureSearchBlocking()                       // типово: 14 символів, пауза 400 мс
 *     await measureSearchBlocking('Червоний марке', 120)  // швидкий набір
 *
 * Пауза 400 мс НЕ випадкова: дебаунс у ToolbarSearch — 300 мс, тож більша пауза
 * означає, що КОЖНА літера дає окремий повний прохід фільтрації й рендера. Це
 * найгірший реальний випадок — повільний друкар. Пауза 120 мс — навпаки,
 * звичайний темп, коли дебаунс усе склеює в одне спрацювання.
 *
 * ДВІ ПАСТКИ, НА ЯКИХ ЛЕГКО ОТРИМАТИ ФАЛЬШИВИЙ НУЛЬ (обидві перевірені 24.08.2026):
 *
 * 1. ВІКНО МАЄ БУТИ НАПЕРЕДІ. У фоновій вкладці Chrome не малює кадрів і
 *    клампить таймери, і API довгих задач не віддає НІЧОГО. Виглядає це як
 *    ідеальний результат: нуль задач, нуль мілісекунд. Саме тому нижче спершу
 *    йде контрольний дослід — навмисне блокування на 260 мс. Якщо контроль
 *    порожній, замір недійсний, і функція скаже про це прямо.
 *
 * 2. КОД РОЗШИРЕННЯ НЕ РАХУЄТЬСЯ. Якщо ганяти цей замір через браузерне
 *    розширення (Claude in Chrome), код виконується в ізольованому світі, і його
 *    задачі не потрапляють у таймлайн сторінки. Тоді контроль теж буде порожній.
 *    Рятує вставка через <script> у власний світ сторінки — так, як робить
 *    injectIntoPage() нижче.
 *
 * ЗАМІРЯНО 24.08.2026 на проді, серія «Червоний марке» з паузою 400 мс:
 *   Замовлення (канбан, 2381 вузол) — 0 задач
 *   Замовники (таблиця, 3049)       — 0 задач
 *   Прорахунки (список, 10269)      — 1 задача, 55 мс
 *   Дизайн (канбан, 8311)           — 14 задач, 1098 мс, найдовша 205 мс
 */

async function measureSearchBlocking(text = "Червоний марке", gapMs = 400) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const input = document.querySelector('input[placeholder*="Пошук"]');
  if (!input) {
    const placeholders = Array.from(document.querySelectorAll("input")).map((i) => i.placeholder);
    return { помилка: "поля пошуку на сторінці немає", знайденіПоля: placeholders };
  }

  const tasks = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) tasks.push(Math.round(entry.duration));
  });
  observer.observe({ entryTypes: ["longtask"] });

  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  const put = (value) => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  put("");
  await wait(1200);

  // Контроль: чи взагалі доходять довгі задачі (див. пастку 1 угорі).
  tasks.length = 0;
  const until = performance.now() + 260;
  while (performance.now() < until) {
    /* навмисне блокування */
  }
  await wait(600);
  const control = tasks.slice();

  const domNodes = document.querySelectorAll("*").length;
  tasks.length = 0;
  for (let i = 1; i <= text.length; i += 1) {
    put(text.slice(0, i));
    await wait(gapMs);
  }
  await wait(1500);
  const measured = tasks.slice();

  observer.disconnect();
  put("");

  if (control.length === 0) {
    return {
      помилка: "замір НЕДІЙСНИЙ: контрольне блокування на 260 мс не зареєструвалось",
      підказка: "винеси вікно браузера наперед і не перемикайся під час заміру",
    };
  }

  return {
    сторінка: location.pathname,
    запит: text,
    паузаМіжЛітерамиМс: gapMs,
    вузлівDOM: domNodes,
    контрольнеБлокування: control,
    довгихЗадач: measured.length,
    сумаМс: measured.reduce((a, b) => a + b, 0),
    чистеБлокуванняМс: measured.reduce((a, b) => a + Math.max(0, b - 50), 0),
    найдовшаМс: measured.length ? Math.max(...measured) : 0,
    задачі: measured,
  };
}

/**
 * Те саме, але зі стороннього середовища (розширення, CDP) — вставляє замір у
 * власний світ сторінки й повертає результат через прихований вузол DOM.
 * Див. пастку 2 угорі: без цього контроль завжди порожній.
 */
function injectIntoPage(text = "Червоний марке", gapMs = 400) {
  const box = document.createElement("div");
  box.id = "__search-blocking-probe";
  box.style.display = "none";
  document.body.appendChild(box);

  const script = document.createElement("script");
  script.textContent = `(${measureSearchBlocking.toString()})(${JSON.stringify(text)}, ${gapMs})
    .then(r => { document.getElementById("__search-blocking-probe").textContent = JSON.stringify(r); });`;
  document.documentElement.appendChild(script);
  script.remove();

  return "результат зʼявиться у #__search-blocking-probe за ~" + Math.round((1200 + 860 + text.length * gapMs + 1500) / 1000) + " с";
}

if (typeof window !== "undefined") {
  window.measureSearchBlocking = measureSearchBlocking;
  window.injectSearchBlockingProbe = injectIntoPage;
}
