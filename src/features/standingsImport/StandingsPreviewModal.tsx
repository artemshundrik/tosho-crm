import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { TableHeaderCell, TableNumericCell } from "@/components/app/table-kit";
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
  const statusTone = (kind: StandingDiffRow["kind"]) => {
    if (kind === "new") return "success";
    if (kind === "removed") return "danger";
    if (kind === "changed") return "info";
    return "neutral";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader className="px-6 pt-4 pr-12 pb-3">
          <DialogTitle>Перевірка змін</DialogTitle>
        </DialogHeader>

        <div className="px-6">
          <div className="max-h-[60vh] overflow-auto rounded-[var(--radius-inner)] border border-border bg-card/60">
            <Table variant="analytics" size="sm">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Команда</TableHeaderCell>
                <TableHeaderCell align="center" widthClass="w-[90px]">Позиція</TableHeaderCell>
                <TableHeaderCell align="center" widthClass="w-[70px]">І</TableHeaderCell>
                <TableHeaderCell align="center" widthClass="w-[70px]">В</TableHeaderCell>
                <TableHeaderCell align="center" widthClass="w-[70px]">Н</TableHeaderCell>
                <TableHeaderCell align="center" widthClass="w-[70px]">П</TableHeaderCell>
                <TableHeaderCell align="center" widthClass="w-[110px]">Г</TableHeaderCell>
                <TableHeaderCell align="center" widthClass="w-[70px]">О</TableHeaderCell>
                <TableHeaderCell align="center" widthClass="w-[110px]">Статус</TableHeaderCell>
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
                  <TableRow key={row.team_name}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {next?.logo_url ? (
                          <img
                            src={next.logo_url}
                            alt={row.team_name}
                            className="h-6 w-6 rounded-full border border-border object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-full border border-border bg-muted/60" />
                        )}
                        <span className="font-semibold">{row.team_name}</span>
                      </div>
                    </TableCell>
                    <TableNumericCell
                      className={cn(
                        "text-center",
                        cellClass(Boolean(positionChange), row.kind),
                      )}
                    >
                      {next?.position ?? "Н/Д"}
                    </TableNumericCell>
                    <TableNumericCell
                      className={cn(
                        "text-center",
                        cellClass(Boolean(playedChange), row.kind),
                      )}
                    >
                      {next?.played ?? "Н/Д"}
                    </TableNumericCell>
                    <TableNumericCell
                      className={cn(
                        "text-center",
                        cellClass(Boolean(winsChange), row.kind),
                      )}
                    >
                      {next?.wins ?? "Н/Д"}
                    </TableNumericCell>
                    <TableNumericCell
                      className={cn(
                        "text-center",
                        cellClass(Boolean(drawsChange), row.kind),
                      )}
                    >
                      {next?.draws ?? "Н/Д"}
                    </TableNumericCell>
                    <TableNumericCell
                      className={cn(
                        "text-center",
                        cellClass(Boolean(lossesChange), row.kind),
                      )}
                    >
                      {next?.losses ?? "Н/Д"}
                    </TableNumericCell>
                    <TableNumericCell
                      className={cn(
                        "text-center",
                        cellClass(Boolean(goalsForChange || goalsAgainstChange), row.kind),
                      )}
                    >
                      {next?.goals_for ?? "Н/Д"}-{next?.goals_against ?? "Н/Д"}
                    </TableNumericCell>
                    <TableNumericCell
                      className={cn(
                        "text-center",
                        cellClass(Boolean(pointsChange), row.kind),
                      )}
                    >
                      {next?.points ?? "Н/Д"}
                    </TableNumericCell>
                    <TableCell className="text-center">
                      <Badge tone={statusTone(row.kind)} size="sm" pill>
                        {row.kind}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </div>

        <DialogFooter className="mt-4 px-6 pb-6">
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
