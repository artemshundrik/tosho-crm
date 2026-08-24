import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TabBar } from "./TabBar";
import type { TabSourceLink } from "./tabBarItems";

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
  { label: "Дизайн", to: "/design", icon: Icon, moduleKey: "design" },
];

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <TabBar links={links} onAsk={() => {}} onMenu={() => {}} />
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
});

describe("TabBar", () => {
  it("показує підписи під іконками — і у вкладок, і в «Меню»", () => {
    renderAt("/orders/estimates");
    const nav = screen.getByRole("navigation", { name: "Primary" });

    // Три вкладки за замовчуванням: AI і «Меню» займають решту з п'яти слотів.
    expect(within(nav).getByText("Прорахунки")).toBeInTheDocument();
    expect(within(nav).getByText("Замовники")).toBeInTheDocument();
    expect(within(nav).getByText("Замовлення")).toBeInTheDocument();
    expect(within(nav).getByText("Меню")).toBeInTheDocument();
    expect(within(nav).queryByText("Дизайн")).not.toBeInTheDocument();
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

  it("слот «Меню» — кнопка з попапом, а не посилання", () => {
    renderAt("/orders/estimates");
    const menu = screen.getByRole("button", { name: "Усі розділи" });

    expect(menu).toHaveAttribute("aria-haspopup", "menu");
    expect(menu.tagName).toBe("BUTTON");
  });
});
