import { describe, expect, it } from "vitest";
import { isTabActive, resolveTabItems, type TabSourceLink } from "./tabBarItems";

const Icon = () => null;

function link(moduleKey: TabSourceLink["moduleKey"], to: string, label = to): TabSourceLink {
  return { label, to, icon: Icon, moduleKey };
}

/** Пункти в порядку сайдбару — як віддає visibleSidebarLinks власнику. */
const ownerLinks: TabSourceLink[] = [
  link("overview", "/"),
  link("customers", "/orders/customers"),
  link("quotes", "/orders/estimates"),
  link("orders", "/orders/production"),
  link("shipping", "/orders/ready-to-ship"),
  link("catalog", "/catalog/products"),
  link("design", "/design"),
  link("finance", "/finances"),
  link("team", "/team"),
];

describe("resolveTabItems", () => {
  it("за замовчуванням 4 вкладки — п'ятий слот тримає кружечок AI", () => {
    expect(resolveTabItems(ownerLinks).map((t) => t.to)).toEqual([
      "/orders/estimates",
      "/orders/customers",
      "/orders/production",
      "/design",
    ]);
  });

  it("без AI слотів п'ять — заходить наступний за пріоритетом", () => {
    expect(resolveTabItems(ownerLinks, 5).map((t) => t.to)).toEqual([
      "/orders/estimates",
      "/orders/customers",
      "/orders/production",
      "/design",
      "/finances",
    ]);
  });

  it("обране людиною перемагає пріоритет і тримає її порядок", () => {
    expect(resolveTabItems(ownerLinks, 4, ["design", "quotes"]).map((t) => t.to)).toEqual([
      "/design",
      "/orders/estimates",
    ]);
  });

  it("обраний модуль без доступу випадає зі смуги", () => {
    const noFinance = ownerLinks.filter((l) => l.moduleKey !== "finance");
    expect(resolveTabItems(noFinance, 4, ["finance", "design"]).map((t) => t.to)).toEqual(["/design"]);
  });

  it("обраних більше, ніж слотів — беремо перші, решту відрізаємо", () => {
    const chosen = ["quotes", "customers", "orders", "design", "finance"];
    expect(resolveTabItems(ownerLinks, 4, chosen)).toHaveLength(4);
  });

  it("замість вимкненого модуля підставляє наступний доступний, а не мертву вкладку", () => {
    const withoutDesign = ownerLinks.filter((l) => l.moduleKey !== "design");
    expect(resolveTabItems(withoutDesign, 4).map((t) => t.to)).toEqual([
      "/orders/estimates",
      "/orders/customers",
      "/orders/production",
      "/finances",
    ]);
  });

  it("коли доступних менше за слоти — віддає скільки є, без вигаданих", () => {
    const two = [link("design", "/design"), link("team", "/team")];
    expect(resolveTabItems(two).map((t) => t.to)).toEqual(["/design", "/team"]);
  });

  it("порожні доступи (ще вантажаться) — порожня смуга, а не блимання дефолтом", () => {
    expect(resolveTabItems([])).toEqual([]);
  });

  it("пункти без moduleKey і поза пріоритетом у смугу не претендують", () => {
    const links = [
      { label: "Сповіщення", to: "/notifications", icon: Icon },
      link("quotes", "/orders/estimates"),
    ];
    expect(resolveTabItems(links).map((t) => t.to)).toEqual(["/orders/estimates"]);
  });

  it("з двох пунктів одного модуля бере перший — порядок сайдбару вирішує", () => {
    const links = [link("quotes", "/orders/estimates"), link("quotes", "/orders/estimates-alt")];
    expect(resolveTabItems(links).map((t) => t.to)).toEqual(["/orders/estimates"]);
  });
});

describe("isTabActive", () => {
  it("маршрут і його підсторінки активні, сусідні — ні", () => {
    expect(isTabActive("/orders/estimates", "/orders/estimates")).toBe(true);
    expect(isTabActive("/orders/estimates/123", "/orders/estimates")).toBe(true);
    expect(isTabActive("/orders/estimates-archive", "/orders/estimates")).toBe(false);
    expect(isTabActive("/design", "/orders/estimates")).toBe(false);
  });

  it("корінь не липне до всього поспіль", () => {
    expect(isTabActive("/orders/estimates", "/")).toBe(false);
    expect(isTabActive("/", "/")).toBe(true);
  });
});
