import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TabBar } from "./TabBar";
import type { TabSourceLink } from "./tabBarItems";
import { setTabBarPrefs } from "./tabBarSettings";

/**
 * Смуга вкладок на телефоні (картка 146).
 *
 * ПРО ГЕОМЕТРІЮ. setupComponentTests застерігає не перевіряти в jsdom те, що
 * залежить від справжніх розмірів, — і це правило тут не порушується: власні
 * розміри ми НЕ міряємо. Замість цього підміняємо offsetLeft/offsetWidth
 * заздалегідь відомими числами й перевіряємо ЛОГІКУ: чи капсула стає на
 * позицію саме активної вкладки й чи переїжджає, коли активна змінюється.
 * Як воно виглядає в пікселях — питання прев'ю, а не цього тесту.
 */
const SLOT_WIDTH = 64;

const Icon = () => null;

const links: TabSourceLink[] = [
  { label: "Замовники", to: "/orders/customers", icon: Icon, moduleKey: "customers" },
  { label: "Прорахунки", to: "/orders/estimates", icon: Icon, moduleKey: "quotes" },
  { label: "Замовлення", to: "/orders/production", icon: Icon, moduleKey: "orders" },
  { label: "До відвантаження", to: "/orders/ready-to-ship", icon: Icon, moduleKey: "shipping" },
  { label: "Дизайн", to: "/design", icon: Icon, moduleKey: "design" },
  { label: "Фінанси", to: "/finances", icon: Icon, moduleKey: "finance" },
];

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <TabBar links={links} onAsk={() => {}} />
    </MemoryRouter>
  );
}

function capsuleX() {
  const capsule = document.querySelector<HTMLElement>('nav[aria-label="Primary"] > span[aria-hidden="true"]');
  const match = capsule?.style.transform.match(/translate\((-?\d+(?:\.\d+)?)px/);
  return match ? Number(match[1]) : null;
}

beforeAll(() => {
  // Смуга існує лише на вузькому екрані — інакше useIsNarrowViewport віддає
  // false і компонент свідомо не рендериться (десктоп не платить за мобільне).
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  // Кожен слот однакової ширини, позиція — за порядком у смузі.
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === "A" || this.tagName === "BUTTON" ? SLOT_WIDTH : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetLeft", {
    configurable: true,
    get(this: HTMLElement) {
      const parent = this.parentElement;
      if (!parent) return 0;
      const slots = Array.from(parent.children).filter(
        (child) => child.tagName === "A" || child.tagName === "BUTTON"
      );
      const index = slots.indexOf(this);
      return index < 0 ? 0 : index * SLOT_WIDTH;
    },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Скидаємо кеш налаштувань між тестами: він живе в модулі й інакше протік
  // би з попереднього тесту в наступний.
  setTabBarPrefs({ tabs: null, ai: true });
});

describe("TabBar", () => {
  it("показує чотири підписані вкладки — п'ятий слот за кружечком AI", () => {
    renderAt("/orders/estimates");
    const nav = screen.getByRole("navigation", { name: "Primary" });

    expect(within(nav).getByText("Прорахунки")).toBeInTheDocument();
    expect(within(nav).getByText("Замовники")).toBeInTheDocument();
    expect(within(nav).getByText("Замовлення")).toBeInTheDocument();
    expect(within(nav).getByText("Дизайн")).toBeInTheDocument();
  });

  it("кнопки «Меню» у смузі немає — до решти розділів веде гамбургер", () => {
    renderAt("/orders/estimates");
    expect(screen.queryByRole("button", { name: "Усі розділи" })).not.toBeInTheDocument();
  });

  it("вимкнений AI звільняє слот під п'яту вкладку", () => {
    setTabBarPrefs({ tabs: null, ai: false });
    renderAt("/orders/estimates");

    // П'ятою за пріоритетом іде «Фінанси» — саме вона займає звільнений слот.
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(within(nav).getByText("Фінанси")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Знайти або спитати ToSho AI" })).not.toBeInTheDocument();
  });

  it("обраний людиною склад смуги перемагає порядок за замовчуванням", () => {
    setTabBarPrefs({ tabs: ["design", "finance"], ai: true });
    renderAt("/design");

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByText("Дизайн")).toBeInTheDocument();
    expect(within(nav).getByText("Фінанси")).toBeInTheDocument();
    expect(within(nav).queryByText("Прорахунки")).not.toBeInTheDocument();
  });

  it("обрана вкладка без доступу зникає, а не веде в порожній екран", () => {
    setTabBarPrefs({ tabs: ["design", "finance"], ai: true });
    render(
      <MemoryRouter initialEntries={["/design"]}>
        <TabBar links={links.filter((l) => l.moduleKey !== "finance")} onAsk={() => {}} />
      </MemoryRouter>
    );

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByText("Дизайн")).toBeInTheDocument();
    expect(within(nav).queryByText("Фінанси")).not.toBeInTheDocument();
  });

  it("кружечок AI — єдиний без підпису, лише доступна назва", () => {
    renderAt("/orders/estimates");
    const ai = screen.getByRole("button", { name: "Знайти або спитати ToSho AI" });

    expect(ai).toBeInTheDocument();
    expect(ai).toHaveTextContent("");
    // Він поза навігацією: це дія, а не розділ.
    expect(screen.getByRole("navigation", { name: "Primary" })).not.toContainElement(ai);
  });

  it("капсула стає під активну вкладку, а не під першу-ліпшу", () => {
    renderAt("/orders/production");

    // «Замовлення» — третій слот (індекс 2) у порядку резолвера.
    expect(capsuleX()).toBe(2 * SLOT_WIDTH);
    expect(screen.getByRole("link", { name: /Замовлення/ })).toHaveAttribute("aria-current", "page");
  });

  it("капсула переїжджає, коли активним став інший розділ", () => {
    const first = renderAt("/orders/estimates");
    expect(capsuleX()).toBe(0);
    first.unmount();

    renderAt("/orders/customers");
    expect(capsuleX()).toBe(SLOT_WIDTH);
  });

  it("активна вкладка знайдена й на сторінці деталей, а не лише в списку", () => {
    renderAt("/orders/estimates/8f2c1e40-0000-4000-8000-000000000000");
    expect(capsuleX()).toBe(0);
  });

  it("поза розділами смуги капсули немає — підсвічувати нічого", () => {
    renderAt("/finances");
    expect(capsuleX()).toBeNull();
    // Сама смуга при цьому лишається: навігація нікуди не дівається.
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });

});
