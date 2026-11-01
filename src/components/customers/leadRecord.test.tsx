import { describe, expect, it } from "vitest";

import { getFallbackLeadColumnsVariant, getLeadColumns } from "./leadRecord";

describe("колонки ліда до scripts/party-referred-by.sql", () => {
  it("помилка про referred_by веде в набір без колонки, решта на місці", () => {
    const message = 'column leads.referred_by does not exist';
    expect(getFallbackLeadColumnsVariant("full", message)).toBe("no_referral");
    expect(getLeadColumns("full")).toContain("referred_by");
    expect(getLeadColumns("no_referral")).not.toContain("referred_by");
    expect(getLeadColumns("no_referral")).toContain("tax_id");
  });

  it("стара схема без реквізитів далі падає в no_requisites і без referred_by", () => {
    expect(getFallbackLeadColumnsVariant("no_referral", "column leads.tax_id does not exist")).toBe("no_requisites");
    expect(getLeadColumns("no_requisites")).not.toContain("referred_by");
  });
});
