import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PersonIdentityFields } from "./PersonIdentityFields";
import type { WorkspaceMemberDirectoryRow } from "@/lib/workspaceMemberDirectory";

const upsert = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const invalidate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/workspaceMemberDirectory", () => ({
  upsertWorkspaceMemberProfile: upsert,
  invalidateWorkspaceMemberDirectory: invalidate,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function Person(overrides: Partial<WorkspaceMemberDirectoryRow> = {}) {
  return {
    workspaceId: "ws-1",
    userId: "user-1",
    email: "daria@tosho.agency",
    firstName: "Дар'я",
    lastName: "Мезенцева",
    fullName: "Дар'я Мезенцева",
    displayName: "Дар'я М.",
    initials: "ДМ",
    avatarUrl: null,
    avatarPath: "avatars/user-1/1/hero.webp",
    accessRole: "member",
    jobRole: "manager",
    birthDate: "2004-07-18",
    phone: "+380509813166",
    availabilityStatus: "available",
    availabilityStartDate: "",
    availabilityEndDate: "",
    absenceToday: null,
    startDate: "2025-10-20",
    probationEndDate: "",
    employmentStatus: "active",
    probationReviewNotifiedAt: "",
    probationReviewedAt: "",
    probationReviewedBy: "",
    probationExtensionCount: 0,
    managerUserId: "",
    moduleAccess: {},
    ...overrides,
  } as WorkspaceMemberDirectoryRow;
}

describe("дані людини в картці", () => {
  beforeEach(() => {
    upsert.mockClear();
    invalidate.mockClear();
  });

  it("без права редагувати показує дати текстом, а не полями", () => {
    render(
      <PersonIdentityFields
        person={Person()}
        workspaceId="ws-1"
        canEdit={false}
        actorUserId="admin-1"
        onSaved={() => {}}
      />
    );

    expect(screen.getByText("20.10.2025")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ім'я")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Зберегти" })).not.toBeInTheDocument();
  });

  it("кнопки збереження немає, поки нічого не змінено", () => {
    render(
      <PersonIdentityFields
        person={Person()}
        workspaceId="ws-1"
        canEdit
        actorUserId="admin-1"
        onSaved={() => {}}
      />
    );

    expect(screen.getByLabelText("Ім'я")).toHaveValue("Дар'я");
    expect(screen.queryByRole("button", { name: "Зберегти" })).not.toBeInTheDocument();
  });

  /**
   * Головний тест файлу. `upsertWorkspaceMemberProfile` пропускає `undefined`,
   * тож будь-яке зайве поле в payload затирає чуже свіже значення — саме так
   * 27.07.2026 зникла щойно завантажена аватарка. Форма редагує п'ять полів,
   * і рівно п'ять (плюс адресу й автора) має слати.
   */
  it("шле лише ті поля, якими форма керує — і жодного зайвого", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <PersonIdentityFields
        person={Person()}
        workspaceId="ws-1"
        canEdit
        actorUserId="admin-1"
        onSaved={onSaved}
      />
    );

    await user.clear(screen.getByLabelText("Прізвище"));
    await user.type(screen.getByLabelText("Прізвище"), "Мезенцева-Коваль");
    await user.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(Object.keys(upsert.mock.calls[0][0]).sort()).toEqual([
      "birthDate",
      "firstName",
      "fullName",
      "lastName",
      "startDate",
      "updatedBy",
      "userId",
      "workspaceId",
    ]);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      userId: "user-1",
      lastName: "Мезенцева-Коваль",
      // Повне ім'я перезбирається: заголовок картки й ініціали читаються з нього.
      fullName: "Дар'я Мезенцева-Коваль",
      updatedBy: "admin-1",
    });
    expect(invalidate).toHaveBeenCalledWith("ws-1");
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ lastName: "Мезенцева-Коваль", fullName: "Дар'я Мезенцева-Коваль" })
    );
  });

  it("«Скасувати» повертає поля до збереженого", async () => {
    const user = userEvent.setup();
    render(
      <PersonIdentityFields
        person={Person()}
        workspaceId="ws-1"
        canEdit
        actorUserId="admin-1"
        onSaved={() => {}}
      />
    );

    await user.type(screen.getByLabelText("Ім'я"), "-тест");
    await user.click(screen.getByRole("button", { name: "Скасувати" }));

    expect(screen.getByLabelText("Ім'я")).toHaveValue("Дар'я");
    expect(upsert).not.toHaveBeenCalled();
  });
});
