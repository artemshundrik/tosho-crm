import { describe, expect, it } from "vitest";

import { allowedViewAsTarget, canTryOnAccessRole, type ViewAsTarget } from "./viewAs";

/**
 * Ціль режиму лежить у sessionStorage — переживає зміну прав і правиться
 * руками, — тож перевіряється на кожному читанні, а не в момент вибору.
 *
 * Інваріант той самий, що й у permissionsForViewAs: режим ЗВУЖУЄ. Прапорці
 * «хто я» беруться з цілі без перетину, і саме тому цілі, СТАРШІ ЗА ГЛЯДАЧА,
 * довелось закрити окремо: ціль-власник видала б CEO справжній isSuperAdmin,
 * ціль-адмін дала б не-адміну isAdmin.
 */
const person = (accessRole: string | null): ViewAsTarget => ({
  kind: "person",
  userId: "11111111-1111-1111-1111-111111111111",
  label: "Хтось",
  jobRole: "designer",
  accessRole,
  avatarUrl: null,
});

const role: ViewAsTarget = { kind: "role", jobRole: "pm", label: "Продакт" };

const owner = { canViewAsPerson: true, canViewAsRole: true, accessRole: "owner" };
const ceo = { canViewAsPerson: true, canViewAsRole: true, accessRole: "member" };
const admin = { canViewAsPerson: true, canViewAsRole: true, accessRole: "admin" };
const nobody = { canViewAsPerson: false, canViewAsRole: false, accessRole: "owner" };

describe("canTryOnAccessRole", () => {
  it("рівного й нижчого — можна", () => {
    expect(canTryOnAccessRole("member", "member")).toBe(true);
    expect(canTryOnAccessRole("member", "admin")).toBe(true);
    expect(canTryOnAccessRole("admin", "owner")).toBe(true);
  });

  it("старшого — ні, і регістр із пробілами тут не рятує", () => {
    expect(canTryOnAccessRole("owner", "admin")).toBe(false);
    expect(canTryOnAccessRole(" Owner ", "member")).toBe(false);
    expect(canTryOnAccessRole("admin", "member")).toBe(false);
  });

  it("невідома роль доступу — найнижчий ранг, а не «пропустити»", () => {
    expect(canTryOnAccessRole(null, null)).toBe(true);
    expect(canTryOnAccessRole("owner", null)).toBe(false);
    expect(canTryOnAccessRole("хтозна", "member")).toBe(true);
  });
});

describe("allowedViewAsTarget", () => {
  it("CEO дивиться очима звичайного співробітника", () => {
    expect(allowedViewAsTarget(person("member"), ceo)).not.toBeNull();
  });

  it("CEO не приміряє власника — інакше отримав би isSuperAdmin із цілі", () => {
    expect(allowedViewAsTarget(person("owner"), ceo)).toBeNull();
    expect(allowedViewAsTarget(person("OWNER"), ceo)).toBeNull();
  });

  it("не приміряє й адміна, поки сам не адмін", () => {
    expect(allowedViewAsTarget(person("admin"), ceo)).toBeNull();
    expect(allowedViewAsTarget(person("admin"), admin)).not.toBeNull();
  });

  it("власник приміряє будь-кого, зокрема іншого власника", () => {
    expect(allowedViewAsTarget(person("owner"), owner)).not.toBeNull();
  });

  it("без права на вхід «людина» ціль не діє, хоч би що лежало у сховищі", () => {
    expect(allowedViewAsTarget(person("member"), { ...ceo, canViewAsPerson: false })).toBeNull();
  });

  it("посада без людини ранга не має — її гейтить лише окреме право", () => {
    expect(allowedViewAsTarget(role, ceo)).toBe(role);
    expect(allowedViewAsTarget(role, { ...ceo, canViewAsRole: false })).toBeNull();
  });

  it("без жодного права режим не вмикається взагалі", () => {
    expect(allowedViewAsTarget(person("member"), nobody)).toBeNull();
    expect(allowedViewAsTarget(role, nobody)).toBeNull();
    expect(allowedViewAsTarget(null, owner)).toBeNull();
  });
});
