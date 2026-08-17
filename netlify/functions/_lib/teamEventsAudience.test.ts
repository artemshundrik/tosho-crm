import { describe, expect, it } from "vitest";
import { resolveAudience } from "../team-events-reminders-background";

// Дані зліплені з реального випадку 17.08.2026: у команді були двоє звільнених
// (Вікторія, Євгенія) і двоє щойно доданих людей без картки співробітника.
// Звільнені тоді отримали ранкові сповіщення про відпустки — саме це тут і
// стережемо.
const WS = "ws-1";

const memberships = [
  { workspace_id: WS, user_id: "owner-artem", access_role: "owner", job_role: "it_specialist" },
  { workspace_id: WS, user_id: "seo-slava", access_role: "member", job_role: "seo" },
  { workspace_id: WS, user_id: "pm-tanya", access_role: "member", job_role: "pm" },
  { workspace_id: WS, user_id: "fired-vika", access_role: "member", job_role: "manager" },
  { workspace_id: WS, user_id: "fired-zhenya", access_role: "member", job_role: "designer" },
  { workspace_id: WS, user_id: "rejected-hire", access_role: "member", job_role: "manager" },
  { workspace_id: WS, user_id: "newcomer-no-profile", access_role: "member", job_role: "logistics" },
];

const knownProfiles = [
  { workspace_id: WS, user_id: "owner-artem", employment_status: "active" },
  { workspace_id: WS, user_id: "seo-slava", employment_status: "active" },
  { workspace_id: WS, user_id: "pm-tanya", employment_status: null },
  { workspace_id: WS, user_id: "fired-vika", employment_status: "inactive" },
  { workspace_id: WS, user_id: "fired-zhenya", employment_status: "INACTIVE " },
  { workspace_id: WS, user_id: "rejected-hire", employment_status: "rejected" },
  // newcomer-no-profile навмисно відсутній: картку співробітника ще не завели.
];

describe("resolveAudience", () => {
  it("звільнені не отримують сповіщень", () => {
    const { recipientIdsByWorkspace } = resolveAudience(memberships, knownProfiles);
    const recipients = recipientIdsByWorkspace.get(WS) ?? [];

    expect(recipients).not.toContain("fired-vika");
    expect(recipients).not.toContain("fired-zhenya");
    expect(recipients).not.toContain("rejected-hire");
  });

  it("новачок без картки співробітника сповіщення отримує", () => {
    const { recipientIdsByWorkspace } = resolveAudience(memberships, knownProfiles);
    // Мовчазно втратити новоприбулого гірше, ніж надіслати зайве: членство є,
    // статусу ще немає.
    expect(recipientIdsByWorkspace.get(WS)).toContain("newcomer-no-profile");
  });

  it("порожній employment_status = чинний співробітник", () => {
    const { recipientIdsByWorkspace } = resolveAudience(memberships, knownProfiles);
    expect(recipientIdsByWorkspace.get(WS)).toContain("pm-tanya");
  });

  it("КОНТРАКТ: фільтрований список профілів повертає баг — тому передаємо повний", () => {
    // Цей кейс навмисно перевіряє ПОГАНУ поведінку: так виглядав баг
    // 17.08.2026. Профілі відфільтрували від звільнених ЩЕ ДО виклику, і в
    // мапі їх не стало — «профілю немає» прочиталось як «людину не знаємо,
    // краще надішлемо». Кейс лишається як виконуваний коментар: він показує
    // ціну помилки в аргументі, а не бажану поведінку.
    const onlyActive = knownProfiles.filter((p) => {
      const status = (p.employment_status ?? "").trim().toLowerCase();
      return status !== "inactive" && status !== "rejected";
    });
    const { recipientIdsByWorkspace } = resolveAudience(memberships, onlyActive);

    expect(recipientIdsByWorkspace.get(WS)).toContain("fired-vika");
  });

  it("погоджувачі — власник і SEO, і обидва позначені привілейованими", () => {
    const { approverIdsByWorkspace, ownerIdsByWorkspace, privilegedByKey } = resolveAudience(
      memberships,
      knownProfiles
    );

    expect(approverIdsByWorkspace.get(WS)).toEqual(["owner-artem", "seo-slava"]);
    expect(ownerIdsByWorkspace.get(WS)).toEqual(["owner-artem"]);
    expect(privilegedByKey.has(`${WS}:seo-slava`)).toBe(true);
    expect(privilegedByKey.has(`${WS}:pm-tanya`)).toBe(false);
  });

  it("звільнений SEO не лишається погоджувачем заявок", () => {
    const withFiredSeo = [...memberships, { workspace_id: WS, user_id: "fired-seo", access_role: "member", job_role: "seo" }];
    const withFiredSeoProfile = [...knownProfiles, { workspace_id: WS, user_id: "fired-seo", employment_status: "inactive" }];

    const { approverIdsByWorkspace } = resolveAudience(withFiredSeo, withFiredSeoProfile);
    expect(approverIdsByWorkspace.get(WS)).not.toContain("fired-seo");
  });
});
