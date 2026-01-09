import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Команда</TableHead>
                <TableHead className="w-[120px]">Позиція</TableHead>
                <TableHead className="w-[90px]">І</TableHead>
                <TableHead className="w-[90px]">В</TableHead>
                <TableHead className="w-[90px]">Н</TableHead>
                <TableHead className="w-[90px]">П</TableHead>
                <TableHead className="w-[120px]">Г</TableHead>
                <TableHead className="w-[90px]">О</TableHead>
                <TableHead className="w-[120px]">Статус</TableHead>
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
                    <TableCell className="font-medium">{row.team_name}</TableCell>
                    <TableCell className={cellClass(Boolean(positionChange), row.kind)}>
                      {next?.position ?? "—"}
                    </TableCell>
                    <TableCell className={cellClass(Boolean(playedChange), row.kind)}>
                      {next?.played ?? "—"}
                    </TableCell>
                    <TableCell className={cellClass(Boolean(winsChange), row.kind)}>
                      {next?.wins ?? "—"}
                    </TableCell>
                    <TableCell className={cellClass(Boolean(drawsChange), row.kind)}>
                      {next?.draws ?? "—"}
                    </TableCell>
                    <TableCell className={cellClass(Boolean(lossesChange), row.kind)}>
                      {next?.losses ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cellClass(Boolean(goalsForChange || goalsAgainstChange), row.kind)}
                    >
                      {next?.goals_for ?? "—"}-{next?.goals_against ?? "—"}
                    </TableCell>
                    <TableCell className={cellClass(Boolean(pointsChange), row.kind)}>
                      {next?.points ?? "—"}
                    </TableCell>
                    <TableCell>{row.kind}</TableCell>
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
