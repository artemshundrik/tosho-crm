import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NotificationsMenu } from "@/components/app/NotificationsMenu";
import type { NotificationItem } from "@/lib/notifications";

// Підказка про бота тягне за собою авторизацію й запити — до цієї поведінки
// вона стосунку не має, тож у тесті це порожній рядок.
vi.mock("@/features/features/FeatureHint", () => ({
  FeatureHint: () => null,
}));

const PUSH = {
  supported: false,
  configured: false,
  enabled: false,
  busy: false,
  permission: "default" as NotificationPermission,
  enable: () => {},
  disable: () => {},
  sendTest: () => {},
  refresh: () => {},
};

function makeItem(id: string): NotificationItem {
  return {
    id,
    title: `Подія ${id}`,
    description: "опис",
    time: "12:00",
    createdAt: new Date().toISOString(),
    read: false,
  };
}

function renderMenu(overrides: Partial<React.ComponentProps<typeof NotificationsMenu>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    items: [makeItem("a"), makeItem("b")],
    unreadCount: 2,
    loading: false,
    push: PUSH as unknown as React.ComponentProps<typeof NotificationsMenu>["push"],
    onOpenItem: vi.fn(),
    onMarkAllRead: vi.fn(),
    onOpenAll: vi.fn(),
    onOpenTelegramSetup: vi.fn(),
    ...overrides,
  };
  render(<NotificationsMenu {...props} />);
  return props;
}

/**
 * «Прочитати всі» — дія, після якої дивитись у панелі вже нема на що.
 *
 * До 29.08.2026 кнопка лише позначала прочитаним, а панель лишалась відкритою:
 * список під нею миттю ставав порожнім («Усе прочитано»), і це читалось як
 * «не спрацювало» — рівно навпаки до того, що сталось насправді.
 */
describe("прочитати всі", () => {
  it("позначає прочитаним І закриває панель", async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByRole("button", { name: "Прочитати всі" }));

    expect(props.onMarkAllRead).toHaveBeenCalledTimes(1);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("одне непрочитане — кнопка в однині, поведінка та сама", async () => {
    const user = userEvent.setup();
    const props = renderMenu({ items: [makeItem("a")], unreadCount: 1 });

    await user.click(screen.getByRole("button", { name: "Прочитати" }));

    expect(props.onMarkAllRead).toHaveBeenCalledTimes(1);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("без непрочитаних кнопки немає взагалі", () => {
    renderMenu({ items: [], unreadCount: 0 });
    expect(screen.queryByRole("button", { name: /Прочитати/ })).toBeNull();
  });
});

/**
 * Лічильник на дзвіночку. Тест тримає саме ті два числа, які було зламано:
 * розмір (20 px на кнопці 40 px) і кріплення (відсотковий зсув, що залежав від
 * кількості цифр).
 */
describe("лічильник непрочитаних", () => {
  it("кріпиться фіксованим відступом, а не відсотковим зсувом", () => {
    renderMenu({ unreadCount: 3 });
    const badge = screen.getByText("3");
    expect(badge.className).toContain("right-1");
    expect(badge.className).toContain("top-1");
    expect(badge.className).not.toContain("translate-x-1/3");
    expect(badge.className).not.toContain("-translate-y-1/3");
  });

  it("більше за 99 показує «99+», а не чотиризначне число", () => {
    renderMenu({ unreadCount: 128 });
    expect(screen.getByText("99+")).toBeTruthy();
  });
});
