import { describe, expect, it } from "vitest";

import { formatAgo } from "./formatAgo";

const now = new Date("2026-09-09T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("formatAgo", () => {
  it("порожнє й зламане — null", () => {
    expect(formatAgo(null, now)).toBeNull();
    expect(formatAgo(undefined, now)).toBeNull();
    expect(formatAgo("не дата", now)).toBeNull();
  });

  it("хвилини, години, дні — з правильним відмінком", () => {
    expect(formatAgo(ago(20_000), now)).toBe("щойно");
    expect(formatAgo(ago(60_000), now)).toBe("1 хвилину тому");
    expect(formatAgo(ago(3 * 60_000), now)).toBe("3 хвилини тому");
    expect(formatAgo(ago(2 * 3_600_000), now)).toBe("2 години тому");
    expect(formatAgo(ago(5 * 86_400_000), now)).toBe("5 днів тому");
    expect(formatAgo(ago(21 * 86_400_000), now)).toBe("21 день тому");
  });

  it("старше за місяць — дата словами", () => {
    expect(formatAgo(ago(40 * 86_400_000), now)).toBe("31 липня");
  });
});
