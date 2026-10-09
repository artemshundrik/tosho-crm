import { describe, expect, it } from "vitest";
import { formatMarkupPrice, formatMarkupRunLabel, resolveMarkupApproverIds } from "./quoteMarkupNotice";

const plain = (value: string) => value.replace(/\s/g, " ");

const team = [
  { user_id: "owner", access_role: "owner", job_role: "seo" },
  { user_id: "seo-2", access_role: "member", job_role: "SEO" },
  { user_id: "accountant", access_role: "member", job_role: "chief_accountant" },
  { user_id: "manager", access_role: "member", job_role: "manager" },
  { user_id: null, access_role: "owner", job_role: null },
];

describe("хто вирішує ціну нижче дна", () => {
  it("мерч — власник, СЕО і головбух; менеджер — ні", () => {
    expect(resolveMarkupApproverIds({ members: team, isPrint: false }).sort()).toEqual(
      ["accountant", "owner", "seo-2"].sort()
    );
  });

  it("поліграфія з призначеним погоджувачем — лише він", () => {
    expect(resolveMarkupApproverIds({ members: team, isPrint: true, printApproverUserId: "seo-2" })).toEqual([
      "seo-2",
    ]);
  });

  it("поліграфія без призначеного — СЕО, але не головбух", () => {
    const ids = resolveMarkupApproverIds({ members: team, isPrint: true, printApproverUserId: null });
    expect(ids.sort()).toEqual(["owner", "seo-2"].sort());
    expect(ids).not.toContain("accountant");
  });

  it("одна людина в кількох рядках — один адресат", () => {
    const doubled = [...team, { user_id: "owner", access_role: "owner", job_role: null }];
    expect(resolveMarkupApproverIds({ members: doubled, isPrint: false }).filter((id) => id === "owner")).toHaveLength(1);
  });
});

describe("як підписати тираж і ціну", () => {
  it("сума та сама, що на картці TS-1026-0002", () => {
    const price = formatMarkupPrice({ quantity: 16, costTotal: 13964, markupRate: 16.9, unit: "шт", currency: "UAH" });
    expect(plain(price.total)).toBe("16 323,84 грн");
    expect(plain(price.label)).toBe("16 323,84 грн (1 020,24 грн/шт., 16,9 %)");
  });

  it("сирий відсоток зі сховища округлюється до сотих", () => {
    const price = formatMarkupPrice({ quantity: 10, costTotal: 1000, markupRate: 30.840579710144926 });
    expect(plain(price.label)).toContain("30,84 %");
  });

  it("тираж без кількості — без ціни за штуку", () => {
    const price = formatMarkupPrice({ quantity: 0, costTotal: 1000, markupRate: 10 });
    expect(plain(price.label)).toBe("1 100 грн (10 %)");
  });

  it("підпис тиражу: назва й кількість, одиниця людською", () => {
    expect(plain(formatMarkupRunLabel({ itemTitle: "Банер", quantity: 16, unit: "pcs" }))).toBe("Банер · 16 шт.");
    expect(plain(formatMarkupRunLabel({ itemTitle: "  ", quantity: 5, unit: null }))).toBe("5 шт.");
  });
});
