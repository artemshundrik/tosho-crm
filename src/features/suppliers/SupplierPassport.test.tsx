import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { SupplierContractor } from "./queries";
import { SupplierPassport } from "./SupplierPassport";
import { supplierById } from "./suppliersCatalog";
import { supplierStatus, type SupplierPoolSummaryRow } from "./suppliersStatus";

const now = new Date("2026-09-09T12:00:00Z");
const totobi = supplierById("totobi")!;
const summary: SupplierPoolSummaryRow = {
  supplier_slug: "totobi.com.ua",
  contractor_id: "c1",
  rows_active: 3150,
  products: 679,
  with_price: 3074,
  with_photo: 3145,
  categories: 72,
  last_observed: "2026-09-09T10:00:00Z",
  // Не 08.09: того дня домовлено про ціну, і два однакові «08.09.2026» на
  // сторінці не дали б перевірити саме дату домовленості.
  first_loaded: "2026-09-01T08:06:16Z",
};
const contractor: SupplierContractor = {
  id: "c1",
  name: "ТОВ «ТоТобі»",
  contact_name: "Громовий Ярослав",
  phones: ["+380 67 000 00 00"],
  emails: null,
  website: "https://totobi.com.ua/",
  notes: null,
};

const renderPassport = (props: Partial<ComponentProps<typeof SupplierPassport>> = {}) =>
  render(
    <MemoryRouter>
      <SupplierPassport
        definition={totobi}
        status={supplierStatus(totobi, summary, now)}
        contractor={contractor}
        {...props}
      />
    </MemoryRouter>
  );

/**
 * Паспорт згорнутий за замовчуванням, тож майже кожна перевірка починається з
 * розгортання. Окремим помічником, а не рядком у кожному тесті: інакше перший
 * же новий тест забуде клікнути й «не знайшов текст» читатиметься як поламаний
 * паспорт, а не як закритий згортач.
 */
const openPassport = (props: Partial<ComponentProps<typeof SupplierPassport>> = {}) => {
  const result = renderPassport(props);
  fireEvent.click(screen.getByRole("button", { name: /Паспорт кабінету/ }));
  return result;
};

describe("SupplierPassport", () => {
  it("за замовчуванням згорнутий: видно числа пулу, а не платформу з розкладом", () => {
    renderPassport();
    // Три числа зі зведення — те, заради чого сюди дивляться щоразу.
    expect(screen.getByText("679")).toBeInTheDocument();
    // А довідка про кабінет чекає за кнопкою й на дорозі до товарів не стоїть.
    expect(screen.queryByText("CS-Cart")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Паспорт кабінету/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("паспорт: спосіб забору, правило ціни з датою, що дає фід, контакт", () => {
    openPassport();
    expect(screen.getByText("CS-Cart")).toBeInTheDocument();
    expect(screen.getByText(/сувенірка −44%/)).toBeInTheDocument();
    expect(screen.getByText("08.09.2026")).toBeInTheDocument();
    expect(screen.getByText("група нанесення")).toBeInTheDocument();
    // Роздільник тисяч у uk-UA — нерозривний пробіл, тому `\s`, а не пробіл.
    expect(screen.getByText(/3\s150 рядків, 679 товарів/)).toBeInTheDocument();
    expect(screen.getByText("Громовий Ярослав")).toBeInTheDocument();
    expect(screen.getByText("+380 67 000 00 00")).toBeInTheDocument();
  });

  it("доступ до кабінету: місце, де лежить пароль, а не сам пароль", () => {
    const berrytex = supplierById("berrytex")!;
    openPassport({ definition: berrytex, status: supplierStatus(berrytex, null, now), contractor: null });
    expect(screen.getByText(/BERRYTEX_EMAIL і BERRYTEX_PASSWORD/)).toBeInTheDocument();
    expect(screen.getByText(/У CRM зберігаємо лише імена змінних/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "berrytex.com.ua/customer/account/login/" })).toBeInTheDocument();
  });

  it("без картки підрядника — чесний порожній стан і посилання на «Підрядників»", () => {
    openPassport({ contractor: null });
    expect(screen.getByText("У картці підрядника контактів ще немає.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Підрядниках" })).toHaveAttribute("href", "/contractors");
  });

  it("запланований — «що заважає» замість ціни й фіда", () => {
    const toptime = supplierById("toptime")!;
    openPassport({ definition: toptime, status: supplierStatus(toptime, null, now), contractor: null });
    expect(screen.getByText("Що заважає")).toBeInTheDocument();
    expect(screen.getByText(toptime.planned!.blocker)).toBeInTheDocument();
    expect(screen.queryByText("Ціна")).not.toBeInTheDocument();
    expect(screen.queryByText("Що дає фід")).not.toBeInTheDocument();
  });
});
