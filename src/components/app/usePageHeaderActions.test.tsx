import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { PageHeaderActionsProvider } from "@/components/app/PageHeaderActionsProvider";
import {
  PageHeaderActionsSetterContext,
  usePageHeaderActionsNode,
  usePageHeaderActionsPresence,
  type PageHeaderActionsSetter,
} from "@/components/app/pageHeaderActionsContext";
import { usePageHeaderActions } from "@/components/app/usePageHeaderActions";

/**
 * Гак, яким 19 сторінок віддають кнопки в шапку.
 *
 * ЧОМУ ТЕСТИ З'ЯВИЛИСЬ АЖ 01.09.2026. Їх не було зовсім, а гак тим часом
 * тримав тулбари всіх сторінок. Приводом стала правка під ратчет боргу
 * компілятора (`react-hooks/refs`): два присвоєння `ref.current` у тілі гака
 * поїхали в ефект. Помилка в такій правці не впала б у `tsc` і не впала б у
 * лінті — вона просто лишила б 19 сторінок без кнопок.
 *
 * Кожен тест нижче стереже конкретну можливість помилитись:
 *   1. дії взагалі доїжджають до шапки, і з поверхнею СВОЄЇ сторінки;
 *   2. зміна залежностей везе нові дії (а не лишає перші назавжди);
 *   3. демонтаж дії знімає — інакше на новій сторінці висить чужий тулбар;
 *   4. знімає їх ТИМ сеттером, який актуальний на момент демонтажу.
 *
 * Четвертий — головний. Прибирання при демонтажі має порожні залежності, тобто
 * його замикання заморожене першим рендером. Саме заради цього випадку сеттер
 * там читається через реф, і саме цей реф найлегше «спростити» назад.
 */

function Page({ label, deps = [] }: { label: string; deps?: React.DependencyList }) {
  usePageHeaderActions(<button type="button">{label}</button>, deps);
  return <div>тіло сторінки</div>;
}

/** Показує те саме, що бачить оболонка застосунку: присутність і сам вузол. */
function Shell({ surfaceId }: { surfaceId: string }) {
  const present = usePageHeaderActionsPresence(surfaceId);
  const node = usePageHeaderActionsNode(surfaceId);
  return (
    <div data-testid="shell">
      <span>{present ? "дії є" : "дій немає"}</span>
      {node}
    </div>
  );
}

function renderAt(pathname: string, children: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <PageHeaderActionsProvider>
        {children}
        <Shell surfaceId="quotes" />
      </PageHeaderActionsProvider>
    </MemoryRouter>
  );
}

describe("usePageHeaderActions", () => {
  it("везе кнопки в шапку разом із поверхнею своєї сторінки", async () => {
    renderAt("/orders/estimates", <Page label="Новий прорахунок" />);

    expect(await screen.findByText("дії є")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Новий прорахунок" })).toBeTruthy();
  });

  it("чужій поверхні своїх кнопок не віддає", async () => {
    // Сторінка «Замовлення», а оболонка питає про поверхню «Прорахунки»:
    // саме той кадр після переходу, у якому шлях уже новий, а дії ще старі.
    renderAt("/orders/production", <Page label="Нове замовлення" />);

    expect(await screen.findByText("дій немає")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Нове замовлення" })).toBeNull();
  });

  it("зміна залежностей везе нові кнопки", async () => {
    const view = renderAt("/orders/estimates", <Page label="Спершу" deps={[1]} />);
    expect(await screen.findByRole("button", { name: "Спершу" })).toBeTruthy();

    view.rerender(
      <MemoryRouter initialEntries={["/orders/estimates"]}>
        <PageHeaderActionsProvider>
          <Page label="Потім" deps={[2]} />
          <Shell surfaceId="quotes" />
        </PageHeaderActionsProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Потім" })).toBeTruthy();
  });

  it("демонтаж знімає дії з шапки", async () => {
    const view = renderAt("/orders/estimates", <Page label="Новий прорахунок" />);
    expect(await screen.findByText("дії є")).toBeTruthy();

    view.rerender(
      <MemoryRouter initialEntries={["/orders/estimates"]}>
        <PageHeaderActionsProvider>
          <Shell surfaceId="quotes" />
        </PageHeaderActionsProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("дій немає")).toBeTruthy();
  });

  it("при демонтажі кличе сеттер, актуальний НА ТОЙ МОМЕНТ, а не перший", () => {
    // Справжній провайдер віддає стабільний сеттер, тож підміняємо контекст
    // руками: інакше цю помилку не відтворити, а коштує вона тулбарів.
    const first = vi.fn() as unknown as PageHeaderActionsSetter;
    const second = vi.fn() as unknown as PageHeaderActionsSetter;

    function Harness({ setter, mounted }: { setter: PageHeaderActionsSetter; mounted: boolean }) {
      return (
        <MemoryRouter initialEntries={["/orders/estimates"]}>
          <PageHeaderActionsSetterContext.Provider value={setter}>
            {mounted ? <Page label="Кнопка" /> : null}
          </PageHeaderActionsSetterContext.Provider>
        </MemoryRouter>
      );
    }

    const view = render(<Harness setter={first} mounted />);
    view.rerender(<Harness setter={second} mounted />);
    view.rerender(<Harness setter={second} mounted={false} />);

    expect(second).toHaveBeenCalledWith(null);
    expect(first).not.toHaveBeenCalledWith(null);
  });
});
