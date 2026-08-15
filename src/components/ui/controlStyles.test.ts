import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";
import { TOOLBAR_FILTER } from "@/components/ui/controlStyles";

// Те, що реально стоїть у Button (variant="outline") перед className.
// Дублюється навмисно: тест має ловити саме зіткнення двох рецептів, а не
// повторювати за поточним button.tsx те, що там написано сьогодні.
const BUTTON_BASE =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-1 focus-visible:ring-offset-background";

describe("тулбарний фільтр не світить рінгом", () => {
  it("ring-0 із TOOLBAR_FILTER перемагає ring-2 із Button", () => {
    const merged = cn(BUTTON_BASE, TOOLBAR_FILTER);
    expect(merged).toContain("focus-visible:ring-0");
    expect(merged).not.toContain("focus-visible:ring-2");
    expect(merged).toContain("focus-visible:ring-offset-0");
    expect(merged).not.toContain("focus-visible:ring-offset-1");
  });

  it("видимий індикатор фокуса лишається — темніша рамка", () => {
    expect(cn(BUTTON_BASE, TOOLBAR_FILTER)).toContain("focus-visible:border-foreground/50");
  });
});
