import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { ViewAsBar } from "@/components/app/ViewAsBar";
import { VIEW_ONLY_BLOCKED_EVENT } from "@/lib/viewOnlyGuard";

const info = vi.fn();
vi.mock("sonner", () => ({ toast: { info: (...args: unknown[]) => info(...args) } }));

const auth = vi.fn();
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => auth() }));

const PERSON = {
  kind: "person" as const,
  userId: "u-1",
  label: "Мар'яна",
  jobRole: "designer",
  accessRole: "member",
  avatarUrl: null,
};

function block(times = 1) {
  for (let i = 0; i < times; i += 1) {
    window.dispatchEvent(new CustomEvent(VIEW_ONLY_BLOCKED_EVENT, { detail: { what: "update quotes" } }));
  }
}

afterEach(() => {
  info.mockReset();
  auth.mockReset();
});

/**
 * Лавина тостів у режимі перегляду (29.08.2026).
 *
 * Заблокованих записів за раз буває кілька, і кожен просив собі окреме
 * повідомлення — sonner складав їх у вежу однакових рядків. Ключ `id` робить із
 * вежі один тост: повторний виклик оновлює наявний.
 */
describe("тост режиму перегляду", () => {
  it("скільки б блокувань не прийшло, повідомлення одне", () => {
    auth.mockReturnValue({ viewAs: PERSON, viewAsMode: "observe" });
    render(<ViewAsBar />);

    block(6);

    expect(info).toHaveBeenCalledTimes(6);
    const ids = new Set(info.mock.calls.map((call) => (call[1] as { id?: string })?.id));
    // Один ключ на всі — саме він і склеює вежу в один тост.
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBeTruthy();
  });

  it("у режимі «приміряв посаду» тост не потрібен — там дії справді виконуються", () => {
    auth.mockReturnValue({ viewAs: { kind: "role", jobRole: "manager", label: "Менеджер" }, viewAsMode: "act" });
    render(<ViewAsBar />);

    block(3);

    expect(info).not.toHaveBeenCalled();
  });

  it("поза режимом смуги немає й ніхто не слухає", () => {
    auth.mockReturnValue({ viewAs: null, viewAsMode: null });
    const { container } = render(<ViewAsBar />);

    block(3);

    expect(container.firstChild).toBeNull();
    expect(info).not.toHaveBeenCalled();
  });
});
