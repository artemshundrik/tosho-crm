import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ViewAsDialog } from "@/components/app/ViewAsDialog";

const auth = vi.fn();
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => auth() }));
vi.mock("@/lib/workspace", () => ({ resolveWorkspaceId: async () => "ws-1" }));

const MEMBERS = [
  {
    userId: "u-owner",
    fullName: "Артем Ш.",
    email: "artem@tosho.agency",
    jobRole: "it_specialist",
    accessRole: "owner",
    avatarDisplayUrl: null,
    initials: "АШ",
    employmentStatus: "active",
  },
  {
    userId: "u-designer",
    fullName: "Мар'яна Д.",
    email: "maryana@tosho.agency",
    jobRole: "designer",
    accessRole: "member",
    avatarDisplayUrl: null,
    initials: "МД",
    employmentStatus: "active",
  },
];

vi.mock("@/lib/workspaceMemberDirectory", () => ({
  listWorkspaceMembersForDisplay: async () => MEMBERS,
}));

afterEach(() => auth.mockReset());

const viewer = (overrides: Record<string, unknown>) => ({
  userId: "u-ceo",
  canViewAsPerson: true,
  canViewAsRole: true,
  realAccessRole: "member",
  viewAs: null,
  ...overrides,
});

/**
 * Вхід «Людина» відкрито не лише власнику (REQ-224), і разом із ним доводиться
 * тримати виняток: ціль, СТАРШУ ЗА ГЛЯДАЧА, приміряти не можна. Прапорці «хто
 * я» беруться з цілі без перетину, тож ціль-власник видала б CEO справжній
 * isSuperAdmin — а за ним відкриваються owner-ські екрани.
 */
describe("ViewAsDialog — кого пропонують у списку людей", () => {
  it("CEO бачить співробітників, але не власника", async () => {
    auth.mockReturnValue(viewer({}));
    render(<ViewAsDialog open onOpenChange={() => {}} />);

    expect(await screen.findByText("Мар'яна Д.")).toBeTruthy();
    expect(screen.queryByText("Артем Ш.")).toBeNull();
  });

  it("власник бачить у списку й іншого власника", async () => {
    auth.mockReturnValue(viewer({ userId: "u-someone", realAccessRole: "owner" }));
    render(<ViewAsDialog open onOpenChange={() => {}} />);

    expect(await screen.findByText("Артем Ш.")).toBeTruthy();
  });

  it("обидва входи доступні — вкладки «Людина» і «Посада» на місці", async () => {
    auth.mockReturnValue(viewer({}));
    render(<ViewAsDialog open onOpenChange={() => {}} />);

    expect(await screen.findByText("Людина")).toBeTruthy();
    expect(screen.getByText("Посада")).toBeTruthy();
  });

  it("без права на людей лишається сама посада", () => {
    auth.mockReturnValue(viewer({ canViewAsPerson: false }));
    render(<ViewAsDialog open onOpenChange={() => {}} />);

    expect(screen.queryByText("Людина")).toBeNull();
    expect(screen.getByPlaceholderText("Пошук посади")).toBeTruthy();
  });
});
