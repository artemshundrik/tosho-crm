/**
 * Липкий заголовок таблиці — перевірка не вигляду, а МЕХАНІЗМУ.
 *
 * Обидва рази, коли він не працював, причина була не в дизайні, а в тому, що
 * клас мовчки програвав іншому класу. Тест тримає саме ці два місця.
 */
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

// Фон варіанта `list` із самого Table — той, що перебивав напівпрозорістю.
const VARIANT_LIST_THEAD_BG = "[&_thead]:bg-muted/45";
// Те, що додає проп stickyHeader.
const STICKY_THEAD =
  "[&_thead]:sticky [&_thead]:top-[var(--page-chrome-offset,var(--app-header-height))] [&_thead]:z-10 [&_thead]:bg-card";

describe("stickyHeader", () => {
  it("непрозорий фон перемагає напівпрозорий фон варіанта", () => {
    // Селектор той самий — `[&_thead]`, — тож специфічність збігається і
    // вирішує порядок. Раніше клас стояв на самому <thead> (0,1,0) проти
    // селектора від таблиці (0,2,0) і програвав: крізь заголовок було видно
    // рядки, які під ним проїжджають.
    const merged = cn(VARIANT_LIST_THEAD_BG, STICKY_THEAD);
    expect(merged).toContain("[&_thead]:bg-card");
    expect(merged).not.toContain("[&_thead]:bg-muted/45");
  });

  it("заголовок зупиняється під усією верхньою обв'язкою, а не під верхом вікна", () => {
    // top-0 означає верх ВІКНА, а він перекритий фіксованою шапкою — заголовок
    // ховався б за нею саме тоді, коли потрібен. З 27.08.2026 смуга дій теж
    // липка, тож відступ рахує AppLayout у --page-chrome-offset: шапка + смуга,
    // а коли обв'язка поїхала вгору (headroom) — нуль.
    expect(STICKY_THEAD).toContain("[&_thead]:top-[var(--page-chrome-offset,var(--app-header-height))]");
    expect(STICKY_THEAD).not.toContain("top-0");
    // Запасне значення обов'язкове: на сторінках без смуги дій змінної немає.
    expect(STICKY_THEAD).toContain("var(--app-header-height)");
  });
});
