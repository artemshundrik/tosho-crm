import { describe, expect, it } from "vitest";

import { allowedViewAsTarget, isOwnerViewAsTarget, type ViewAsTarget } from "./viewAs";

/**
 * Ціль режиму лежить у sessionStorage — переживає зміну прав і правиться
 * руками, — тож перевіряється на кожному читанні, а не в момент вибору.
 *
 * Інваріант той самий, що й у permissionsForViewAs: режим ЗВУЖУЄ. Прапорці
 * «хто я» беруться з цілі без перетину, і саме тому ціль-власник — єдиний вхід,
 * який довелось закрити окремо: вона видала б CEO справжній isSuperAdmin.
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

const owner = { canViewAsPerson: true, canViewAsRole: true, canViewAsOwner: true };
const ceo = { canViewAsPerson: true, canViewAsRole: true, canViewAsOwner: false };
const nobody = { canViewAsPerson: false, canViewAsRole: false, canViewAsOwner: false };

describe("isOwnerViewAsTarget", () => {
  it("впізнає власника незалежно від регістру й пробілів", () => {
    expect(isOwnerViewAsTarget("owner")).toBe(true);
    expect(isOwnerViewAsTarget(" Owner ")).toBe(true);
  });

  it("решта ролей доступу — не власник", () => {
    expect(isOwnerViewAsTarget("admin")).toBe(false);
    expect(isOwnerViewAsTarget("member")).toBe(false);
    expect(isOwnerViewAsTarget(null)).toBe(false);
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

  it("власник приміряє будь-кого, зокрема іншого власника", () => {
    expect(allowedViewAsTarget(person("owner"), owner)).not.toBeNull();
  });

  it("без права на вхід «людина» ціль не діє, хоч би що лежало у сховищі", () => {
    expect(allowedViewAsTarget(person("member"), { ...ceo, canViewAsPerson: false })).toBeNull();
  });

  it("посаду гейтить окреме право, і власника серед посад немає", () => {
    expect(allowedViewAsTarget(role, ceo)).toBe(role);
    expect(allowedViewAsTarget(role, { ...ceo, canViewAsRole: false })).toBeNull();
  });

  it("без жодного права режим не вмикається взагалі", () => {
    expect(allowedViewAsTarget(person("member"), nobody)).toBeNull();
    expect(allowedViewAsTarget(role, nobody)).toBeNull();
    expect(allowedViewAsTarget(null, owner)).toBeNull();
  });
});
