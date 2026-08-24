import { test as base, expect, type Page } from "@playwright/test";

import { installWriteGuard, type BlockedWrite } from "./writeGuard";

/**
 * СПІЛЬНИЙ СТОРОЖ УСІХ СЦЕНАРІЇВ.
 *
 * Картка REQ-140 вимагає від кожного сценарію трьох речей: ловити незловлені
 * помилки в консолі, невдалі мережеві запити й елементи, що не з'явились за
 * розумний час. Третє дає сам Playwright (кожен `expect` має дедлайн), перші
 * два — цей файл.
 *
 * ЧОМУ АВТОМАТИЧНО, А НЕ ВИКЛИКОМ У КОЖНОМУ ТЕСТІ. Перевірка, яку треба не
 * забути додати, рано чи пізно не додається — і сценарій мовчки перестає
 * ловити половину того, заради чого написаний. Тут сторож `auto: true`: він
 * стоїть на кожному тесті сам, і забути його не можна.
 *
 * ЧОМУ ПОТРІБНІ ПЕРЕЛІКИ ДОЗВОЛЕНОГО. Живий застосунок шумить: розширення
 * браузера, відсутня іконка, третій бік. Якщо валити тест на будь-якому рядку
 * в консолі, набір стане червоним завжди — а червоний завжди означає те саме,
 * що зелений завжди: його перестають читати. Тому шум описаний ЯВНО й
 * поіменно, і кожен новий запис має пояснювати, чому він нешкідливий.
 */

/** Шум, який не є поламаним застосунком. Кожен запис — з поясненням. */
const IGNORED_CONSOLE = [
  // Vite у прев'ю не віддає мапи джерел для сторонніх пакетів.
  /Source map error/i,
  // Іконка вкладки в прев'ю не обов'язкова.
  /favicon/i,
  // Відомий нешкідливий викид спостерігача розмірів: спрацьовує на анімаціях
  // і не означає поламаної розкладки.
  /ResizeObserver loop/i,
  // Розширення браузера в профілі розробника.
  /chrome-extension:/i,
  /**
   * НАСЛІДОК НАШОГО Ж ГАЛЬМА, А НЕ ПОЛОМКА. Спинений запис повертається як 423,
   * і браузер сам пише про це в консоль рядком «Failed to load resource».
   * Без цього винятку одна спроба запису давала ДВА різні падіння, і в звіті
   * першим стояло найменш зрозуміле — «помилка в консолі: 423» замість
   * «сценарій намагався писати в базу».
   */
  /Failed to load resource.*\b423\b/i,
];

/**
 * Коди відповідей, які не є поламаним запитом.
 * 423 сюди не входить: це наше власне гальмо, і воно рахується окремо.
 */
const IGNORED_RESPONSES = [
  // Порожня іконка вкладки.
  /\/favicon\./i,
];

export type Guard = {
  /** Дозволити конкретний шум саме в цьому сценарії. */
  allowConsole: (pattern: RegExp) => void;
  /** Дозволити конкретну невдалу відповідь саме в цьому сценарії. */
  allowResponse: (pattern: RegExp) => void;
  /**
   * Дозволити спинений запис. Потрібно там, де застосунок пише сам собою —
   * присутність у розділі, журнал помилок, — а не через дію людини.
   */
  allowWrite: (pattern: RegExp) => void;
  /** Що сторож спинив. Для перевірок «сценарій нічого не писав». */
  blockedWrites: BlockedWrite[];
};

type Fixtures = { guard: Guard };

export const test = base.extend<Fixtures>({
  guard: [
    async ({ page }: { page: Page }, use) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const badResponses: string[] = [];
      const failedRequests: string[] = [];

      const allowedConsole: RegExp[] = [...IGNORED_CONSOLE];
      const allowedResponses: RegExp[] = [...IGNORED_RESPONSES];
      const allowedWrites: RegExp[] = [];

      const blockedWrites = installWriteGuard(page);

      page.on("console", (message) => {
        if (message.type() !== "error") return;
        consoleErrors.push(message.text());
      });

      // `pageerror` — це саме НЕЗЛОВЛЕНИЙ виняток: те, що обвалює гілку React.
      // Він приходить окремо від console.error і найцінніший із трьох.
      page.on("pageerror", (error) => {
        pageErrors.push(error.stack ?? error.message);
      });

      page.on("response", (response) => {
        const status = response.status();
        // 423 — наше гальмо. Воно рахується як спинений запис, а не як поломка.
        if (status < 400 || status === 423) return;
        badResponses.push(`${status} ${response.request().method()} ${response.url()}`);
      });

      page.on("requestfailed", (request) => {
        const failure = request.failure()?.errorText ?? "невідомо";
        // Скасований запит — норма: сторінка пішла далі, поки він летів.
        if (/ERR_ABORTED|net::ERR_ABORTED/i.test(failure)) return;
        failedRequests.push(`${request.method()} ${request.url()} — ${failure}`);
      });

      const guard: Guard = {
        allowConsole: (pattern) => allowedConsole.push(pattern),
        allowResponse: (pattern) => allowedResponses.push(pattern),
        allowWrite: (pattern) => allowedWrites.push(pattern),
        blockedWrites,
      };

      await use(guard);

      const keep = (list: string[], allowed: RegExp[]) =>
        list.filter((entry) => !allowed.some((pattern) => pattern.test(entry)));

      const unexpectedWrites = blockedWrites.filter(
        (write) => !allowedWrites.some((pattern) => pattern.test(write.why) || pattern.test(write.url))
      );

      /**
       * ПОРЯДОК ТУТ ЗНАЧУЩИЙ: перший невдалий `expect` і є те, що людина
       * прочитає у звіті. Спроба запису йде першою, бо вона пояснює найбільше:
       * решта скарг у такому разі — її наслідки.
       *
       * Спинений запис — це не «сторож спрацював, молодець». Це означає, що
       * сценарій, який мав лише дивитись, спробував щось змінити в проді. Такий
       * сценарій написаний неправильно, і його треба переписати, а не дозволяти.
       */
      expect(
        unexpectedWrites.map((write) => `${write.method} ${write.why}`),
        "сценарій намагався писати в базу"
      ).toEqual([]);

      // Далі — окремими `expect`, щоб у звіті було видно, ЩО саме зламалось, а
      // не одне зведене «сторож незадоволений».
      expect(pageErrors, "незловлені помилки на сторінці").toEqual([]);
      expect(keep(consoleErrors, allowedConsole), "помилки в консолі").toEqual([]);
      expect(keep(badResponses, allowedResponses), "невдалі мережеві запити").toEqual([]);
      expect(keep(failedRequests, allowedResponses), "запити, що не долетіли").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
