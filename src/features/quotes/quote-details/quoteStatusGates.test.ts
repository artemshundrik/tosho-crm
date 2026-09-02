import { describe, expect, it } from "vitest";

import { resolveQuoteStatusGate, resolveStatusBlockReason } from "./quoteStatusGates";

/**
 * Двері назовні: незбережений тираж не має їхати далі статусом (REQ-242).
 *
 * ЧОМУ ЦЕ ВАРТО ТЕСТУ. Саме тиша тут і привела до скарги: гейт ПДВ мовчки
 * спиняв автозбереження, а статус ішов далі — «Прораховано» означало
 * «порахував», хоч вартість товару лишилась у браузері. Перевірка стоїть в
 * одному вузлі з гейтом накрутки, і будь-яке його редагування може зачепити
 * сусіда, не зачепивши жодного типу.
 */

const DEAL = "standard" as const;

describe("resolveQuoteStatusGate", () => {
  it("не пускає в «Прораховано» з незбереженим тиражем", () => {
    const gate = resolveQuoteStatusGate("estimated", false, DEAL, 1);
    expect(gate?.title).toBe("Тираж не збережено");
    expect(gate?.message).toContain("з ПДВ");
  });

  it("тримає й наступні статуси, не лише «Прораховано»", () => {
    expect(resolveQuoteStatusGate("awaiting_approval", false, DEAL, 1)).not.toBeNull();
    expect(resolveQuoteStatusGate("approved", false, DEAL, 1)).not.toBeNull();
  });

  it("рух назад і скасування не блокує — інакше зі статусу немає виходу", () => {
    expect(resolveQuoteStatusGate("new", false, DEAL, 2)).toBeNull();
    expect(resolveQuoteStatusGate("estimating", false, DEAL, 2)).toBeNull();
    expect(resolveQuoteStatusGate("cancelled", false, DEAL, 2)).toBeNull();
  });

  it("зі збереженими тиражами не заважає", () => {
    expect(resolveQuoteStatusGate("estimated", false, DEAL, 0)).toBeNull();
  });

  it("незбережене важить більше за накрутку: погоджувати нема чого, поки ціни немає в базі", () => {
    const gate = resolveQuoteStatusGate("approved", true, DEAL, 1);
    expect(gate?.title).toBe("Тираж не збережено");
  });

  it("гейт накрутки лишається чинним сам собою", () => {
    const gate = resolveQuoteStatusGate("approved", true, DEAL, 0);
    expect(gate?.title).toBe("Спершу погодження накрутки");
  });

  it("кількість тиражів у тексті — з правильним відмінком", () => {
    expect(resolveQuoteStatusGate("estimated", false, DEAL, 2)?.message).toContain("2 тиражі не збережено");
    expect(resolveQuoteStatusGate("estimated", false, DEAL, 5)?.message).toContain("5 тиражів не збережено");
  });
});

describe("resolveStatusBlockReason", () => {
  const base = { canEditContent: true, lockedByOther: false, requirements: [], unsavedRunCount: 0 };

  it("незбережений тираж пояснюється ДО кліку, а не тостом після", () => {
    expect(resolveStatusBlockReason({ ...base, unsavedRunCount: 1 })).toContain("Тираж не збережено");
  });

  it("порядок причин: права важать більше за незбережене", () => {
    expect(resolveStatusBlockReason({ ...base, canEditContent: false, unsavedRunCount: 1 })).toContain(
      "може менеджер цього прорахунку"
    );
  });

  it("чужий лок називає того, хто тримає", () => {
    expect(
      resolveStatusBlockReason({ ...base, lockedByOther: true, lockHolderName: "Ілля", unsavedRunCount: 1 })
    ).toContain("Ілля");
  });

  it("незаповнена картка йде поперед незбереженого тиражу", () => {
    expect(
      resolveStatusBlockReason({ ...base, requirements: ["Дедлайн прорахунку"], unsavedRunCount: 1 })
    ).toContain("Спершу заповніть");
  });

  it("коли все гаразд — мовчить", () => {
    expect(resolveStatusBlockReason(base)).toBeNull();
  });
});
