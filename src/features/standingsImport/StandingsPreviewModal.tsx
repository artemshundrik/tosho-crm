import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { StandingDiffRow } from "./diff";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: StandingDiffRow[];
  canWrite: boolean;
  onConfirm: () => void;
  loading: boolean;
};

function cellClass(hasChange: boolean, kind: StandingDiffRow["kind"]) {
  if (!hasChange) return "";
  if (kind === "new") return "text-emerald-600";
  if (kind === "removed") return "text-rose-600";
  return "text-amber-700";
}

export function StandingsPreviewModal({
  open,
  onOpenChange,
  rows,
  canWrite,
  onConfirm,
  loading,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Перевірка змін</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-2xl border border-border bg-card/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-4">Команда</TableHead>
                <TableHead className="w-[90px] text-center">Позиція</TableHead>
                <TableHead className="w-[70px] text-center">І</TableHead>
                <TableHead className="w-[70px] text-center">В</TableHead>
                <TableHead className="w-[70px] text-center">Н</TableHead>
                <TableHead className="w-[70px] text-center">П</TableHead>
                <TableHead className="w-[110px] text-center">Г</TableHead>
                <TableHead className="w-[70px] text-center">О</TableHead>
                <TableHead className="w-[110px] text-center">Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const positionChange = row.changes.position;
                const playedChange = row.changes.played;
                const pointsChange = row.changes.points;
                const winsChange = row.changes.wins;
                const drawsChange = row.changes.draws;
                const lossesChange = row.changes.losses;
                const goalsForChange = row.changes.goals_for;
                const goalsAgainstChange = row.changes.goals_against;
                const next = row.next ?? row.old;

                return (
                  <TableRow key={row.team_name} className="hover:bg-muted/20">
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        {next?.logo_url ? (
                          <img
                            src={next.logo_url}
                            alt={row.team_name}
                            className="h-7 w-7 rounded-full border border-border object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded-full border border-border bg-muted/60" />
                        )}
                        <span className="font-semibold">{row.team_name}</span>
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-center tabular-nums",
                        cellClass(Boolean(positionChange), row.kind),
                      )}
                    >
                      {next?.position ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-center tabular-nums",
                        cellClass(Boolean(playedChange), row.kind),
                      )}
                    >
                      {next?.played ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-center tabular-nums",
                        cellClass(Boolean(winsChange), row.kind),
                      )}
                    >
                      {next?.wins ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-center tabular-nums",
                        cellClass(Boolean(drawsChange), row.kind),
                      )}
                    >
                      {next?.draws ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-center tabular-nums",
                        cellClass(Boolean(lossesChange), row.kind),
                      )}
                    >
                      {next?.losses ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-center tabular-nums",
                        cellClass(Boolean(goalsForChange || goalsAgainstChange), row.kind),
                      )}
                    >
                      {next?.goals_for ?? "—"}-{next?.goals_against ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-center tabular-nums",
                        cellClass(Boolean(pointsChange), row.kind),
                      )}
                    >
                      {next?.points ?? "—"}
                    </TableCell>
                    <TableCell className="text-center text-xs uppercase tracking-wide text-muted-foreground">
                      {row.kind}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!canWrite || loading}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
