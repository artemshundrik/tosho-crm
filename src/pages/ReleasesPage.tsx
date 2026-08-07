import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { SEGMENTED_GROUP, SEGMENTED_TRIGGER } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";
import { ReleaseHistory } from "@/features/features/ReleaseHistory";
import { useReleases, type Period } from "@/features/features/releaseQueries";
import { groupByMonth, monthTitle } from "@/lib/releaseHistory";

/**
 * «Релізи» — окремий розділ, не вкладка «Що нового».
 *
 * Це два різні питання й дві різні аудиторії: стрічка відповідає «що
 * змінилося для мене» й адресована всій команді, релізи — «скільки роботи
 * зроблено» й потрібні власнику з SEO. Змішані в один екран вони заважали
 * одне одному.
 */

export default function ReleasesPage() {
  const { accessRole, jobRole } = useAuth();
  const { data: releases } = useReleases();
  const [period, setPeriod] = useState<Period>({ kind: "all" });

  /**
   * Решті команди цифри про обсяг робіт нічого не дають: їм треба знати, ЩО
   * змінилось, а не скільки комітів на це пішло. Гейт тут дублює політику RLS
   * на таблиці — сторінка лише не показує того, чого база й так не віддасть.
   */
  const canSee =
    (accessRole ?? "").trim().toLowerCase() === "owner" ||
    (jobRole ?? "").trim().toLowerCase() === "seo";

  const months = useMemo(
    () => groupByMonth(releases ?? []).map((group) => group.key),
    [releases]
  );

  const options = useMemo(
    () => [
      { key: "all", label: "Усе" },
      ...months.map((key) => ({ key, label: monthTitle(key).replace(/\s\d{4}$/, "") })),
    ],
    [months]
  );

  const activeKey = period.kind === "all" ? "all" : period.key;

  usePageHeaderActions(
    canSee ? (
      <UnifiedPageToolbar
        topLeft={
          <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full lg:w-auto")}>
            {options.map((option) => (
              <Button
                key={option.key}
                variant="segmented"
                size="xs"
                aria-pressed={activeKey === option.key}
                data-state={activeKey === option.key ? "on" : "off"}
                onClick={() =>
                  setPeriod(option.key === "all" ? { kind: "all" } : { kind: "month", key: option.key })
                }
                className={cn(SEGMENTED_TRIGGER, "capitalize")}
              >
                {option.label}
              </Button>
            ))}
          </SegmentedGroup>
        }
      />
    ) : null,
    [canSee, options, activeKey]
  );

  if (!canSee) return <Navigate to="/whats-new" replace />;

  return (
    <div className="py-4">
      <div className="mx-auto max-w-[760px]">
        <ReleaseHistory period={period} />
      </div>
    </div>
  );
}
