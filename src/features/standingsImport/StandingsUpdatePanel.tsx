import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import type { StandingDiffRow } from "./diff";

type Props = {
  loading: boolean;
  error: string | null;
  diff: { changedCount: number; rows: StandingDiffRow[] } | null;
  canWrite: boolean;
  lastFetchedAt: string | null;
  linkRequired: boolean;
  previewDisabled?: boolean;
  onPreview: () => void;
  onOpenModal: () => void;
  onReset: () => void;
  onLink: () => void;
};

export function StandingsUpdatePanel({
  loading,
  error,
  diff,
  canWrite,
  lastFetchedAt,
  linkRequired,
  previewDisabled = false,
  onPreview,
  onOpenModal,
  onReset,
  onLink,
}: Props) {
  const summary = useMemo(() => {
    if (!diff) return null;
    const counts = diff.rows.reduce(
      (acc, row) => {
        acc[row.kind] += 1;
        return acc;
      },
      { changed: 0, new: 0, removed: 0, same: 0 },
    );
    return counts;
  }, [diff]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Оновлення турнірної таблиці</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onPreview} disabled={loading || previewDisabled}>
            Оновити таблицю
          </Button>
          {diff ? (
            <Button variant="outline" onClick={onOpenModal}>
              Перевірити зміни
            </Button>
          ) : null}
          {diff ? (
            <Button variant="ghost" onClick={onReset}>
              Скинути перегляд
            </Button>
          ) : null}
          {!canWrite ? <Badge variant="secondary">Тільки перегляд</Badge> : null}
          {lastFetchedAt ? (
            <span className="text-xs text-muted-foreground">
              Останній preview: {new Date(lastFetchedAt).toLocaleString("uk-UA", { hour12: false })}
            </span>
          ) : null}
        </div>

        {summary ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Зміни: {diff?.changedCount}</span>
            <span>Оновлено: {summary.changed}</span>
            <span>Нові: {summary.new}</span>
            <span>Видалені: {summary.removed}</span>
            <span>Без змін: {summary.same}</span>
          </div>
        ) : null}

        {linkRequired ? (
          <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Турнір не привʼязаний до поточної команди.
            <Button
              variant="link"
              className="ml-2 h-auto p-0 text-xs"
              onClick={onLink}
              disabled={loading}
            >
              Link tournament to this team
            </Button>
          </div>
        ) : null}

        {error ? <div className="text-xs text-destructive">{error}</div> : null}
      </CardContent>
    </Card>
  );
}
