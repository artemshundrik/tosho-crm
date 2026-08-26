import { describe, expect, it } from "vitest";

import {
  groupRecipientsByTeam,
  isDeliverable,
  isFinanceRole,
  mergeTeamMembers,
  resolveTeamIds,
  type TeamMemberRow,
} from "./teamMembers";

/**
 * Форма даних узята з прода 2026-07-25, з усіма пастками:
 *  - memberships_view не має імен (full_name порожній у 17 з 18),
 *  - team_member_profiles не має ролей взагалі,
 *  - workspace_id (dd80eefa…) ≠ team_id (389719a7…).
 */
const WORKSPACE = "dd80eefa-db36-499c-9a1d-ee98f95af59b";
const TEAM = "389719a7-5022-41da-bc49-11e7a3afbd98";

const memberships = [
  { user_id: "u-owner", workspace_id: WORKSPACE, access_role: "owner", job_role: "seo" },
  { user_id: "u-seo", workspace_id: WORKSPACE, access_role: "admin", job_role: "seo" },
  { user_id: "u-designer", workspace_id: WORKSPACE, access_role: "member", job_role: "designer" },
  { user_id: "u-accountant", workspace_id: WORKSPACE, access_role: "member", job_role: "accountant" },
  { user_id: "u-fired", workspace_id: WORKSPACE, access_role: "member", job_role: "manager" },
];

const profiles = [
  { user_id: "u-owner", employment_status: "active", first_name: "Артем", last_name: "Шундрик" },
  { user_id: "u-seo", employment_status: "active", first_name: "Олена", last_name: "Борщ" },
  { user_id: "u-designer", employment_status: "active", first_name: "Марʼяна", last_name: "Андроскова" },
  // Бухгалтер без профілю — статусу немає, але людина існує.
  { user_id: "u-fired", employment_status: "inactive", first_name: "Колишній", last_name: "Працівник" },
];

const teamLinks = [
  { user_id: "u-owner", team_id: TEAM },
  { user_id: "u-seo", team_id: TEAM },
  { user_id: "u-designer", team_id: TEAM },
  { user_id: "u-accountant", team_id: TEAM },
  { user_id: "u-fired", team_id: TEAM },
];

function merge() {
  return mergeTeamMembers({ memberships, profiles, teamLinks });
}

describe("mergeTeamMembers", () => {
  it("бере ролі з членств, а імена з профілів", () => {
    const owner = merge().find((m) => m.userId === "u-owner");
    expect(owner).toMatchObject({
      accessRole: "owner",
      jobRole: "seo",
      fullName: "Артем Шундрик",
      employmentStatus: "active",
    });
  });

  it("розрізняє workspace_id і операційний team_id", () => {
    const owner = merge().find((m) => m.userId === "u-owner");
    // Це та сама пастка, через яку бізнес-запити давали нуль рядків.
    expect(owner?.workspaceId).toBe(WORKSPACE);
    expect(owner?.teamId).toBe(TEAM);
    expect(owner?.workspaceId).not.toBe(owner?.teamId);
  });

  it("не втрачає людину без профілю — лише лишає поля порожніми", () => {
    const accountant = merge().find((m) => m.userId === "u-accountant");
    expect(accountant).toBeDefined();
    expect(accountant?.fullName).toBeNull();
    expect(accountant?.employmentStatus).toBeNull();
  });

  it("ігнорує членства без user_id", () => {
    const merged = mergeTeamMembers({
      memberships: [{ user_id: null, workspace_id: WORKSPACE, access_role: "owner", job_role: null }],
      profiles: [],
      teamLinks: [],
    });
    expect(merged).toHaveLength(0);
  });
});

describe("isDeliverable", () => {
  it("виключає звільнених і відхилених", () => {
    const byId = new Map(merge().map((m) => [m.userId, m]));
    expect(isDeliverable(byId.get("u-fired") as TeamMemberRow)).toBe(false);
    expect(isDeliverable(byId.get("u-owner") as TeamMemberRow)).toBe(true);
  });

  it("не виключає людину лише через відсутній статус", () => {
    const byId = new Map(merge().map((m) => [m.userId, m]));
    expect(isDeliverable(byId.get("u-accountant") as TeamMemberRow)).toBe(true);
  });
});

describe("isFinanceRole", () => {
  it("впускає власника, адміна, CEO і бухгалтерів", () => {
    const byId = new Map(merge().map((m) => [m.userId, m]));
    expect(isFinanceRole(byId.get("u-owner") as TeamMemberRow)).toBe(true);
    expect(isFinanceRole(byId.get("u-seo") as TeamMemberRow)).toBe(true);
    expect(isFinanceRole(byId.get("u-accountant") as TeamMemberRow)).toBe(true);
  });

  it("не впускає дизайнера", () => {
    const byId = new Map(merge().map((m) => [m.userId, m]));
    expect(isFinanceRole(byId.get("u-designer") as TeamMemberRow)).toBe(false);
  });
});

describe("groupRecipientsByTeam", () => {
  it("ключує за операційним team_id, а не за workspace_id", () => {
    const byTeam = groupRecipientsByTeam(merge(), isFinanceRole);
    // Саме через ключування по workspace_id фінансові нагадування
    // не знаходили жодного отримувача.
    expect(byTeam.has(TEAM)).toBe(true);
    expect(byTeam.has(WORKSPACE)).toBe(false);
  });

  it("збирає всіх фін-отримувачів і не бере зайвих", () => {
    const byTeam = groupRecipientsByTeam(merge(), isFinanceRole);
    expect(byTeam.get(TEAM)).toEqual(new Set(["u-owner", "u-seo", "u-accountant"]));
  });

  it("пропускає людей без прив'язки до команди", () => {
    const members = mergeTeamMembers({
      memberships: [{ user_id: "u-owner", workspace_id: WORKSPACE, access_role: "owner", job_role: null }],
      profiles: [],
      teamLinks: [],
    });
    expect(groupRecipientsByTeam(members, isFinanceRole).size).toBe(0);
  });

  it("не шле звільненим навіть із правильною роллю", () => {
    const members = mergeTeamMembers({
      memberships: [{ user_id: "u-x", workspace_id: WORKSPACE, access_role: "owner", job_role: null }],
      profiles: [{ user_id: "u-x", employment_status: "rejected" }],
      teamLinks: [{ user_id: "u-x", team_id: TEAM }],
    });
    expect(groupRecipientsByTeam(members, isFinanceRole).size).toBe(0);
  });
});

describe("resolveTeamIds", () => {
  it("віддає унікальні операційні team_id", () => {
    expect(resolveTeamIds(merge())).toEqual([TEAM]);
  });
});
