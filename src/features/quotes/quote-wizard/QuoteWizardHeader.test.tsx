import { describe, expect, it } from "vitest";

import { createEmptyQuoteWizardHeader, getQuoteWizardHeaderIssue } from "./QuoteWizardHeader";

/**
 * Що потрібно, щоб створити прорахунок (REQ-299).
 *
 * НАВІЩО ТЕСТ. Дедлайн тут уже раз був необовʼязковим — це було рішення від
 * 09.09.2026, і воно трималось лише на коментарі. Коли «Новий» прибрали, воно
 * перестало бути правдою. Тест робить нове правило видимим: якщо хтось знову
 * вирішить, що дедлайн — справа добровільна, він побачить це не через місяць
 * від менеджерів, а одразу.
 */
describe("шапка візарда: чого бракує для створення", () => {
  const filled = {
    ...createEmptyQuoteWizardHeader("manager-1"),
    partyId: "customer-1",
    partyLabel: "Кока-Кола",
    deadlineAt: "2026-09-30T10:00",
  };

  it("порожня шапка просить замовника — він перший", () => {
    expect(getQuoteWizardHeaderIssue(createEmptyQuoteWizardHeader(""))).toMatch(/замовника/i);
  });

  it("без менеджера — просить менеджера", () => {
    expect(getQuoteWizardHeaderIssue({ ...filled, managerId: "" })).toMatch(/менеджера/i);
  });

  it("без дедлайну створити не можна", () => {
    expect(getQuoteWizardHeaderIssue({ ...filled, deadlineAt: "" })).toMatch(/дедлайн/i);
  });

  it("усе заповнено — можна створювати", () => {
    expect(getQuoteWizardHeaderIssue(filled)).toBeNull();
  });
});
