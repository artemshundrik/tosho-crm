import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StandingsUpdatePanel } from "@/features/standingsImport/StandingsUpdatePanel";
import { StandingsPreviewModal } from "@/features/standingsImport/StandingsPreviewModal";
import { useStandingsPreview } from "@/features/standingsImport/useStandingsPreview";

export default function TournamentStandingsImportPage() {
  const [tournamentId, setTournamentId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const preview = useStandingsPreview({ tournamentId: tournamentId.trim() });

  const canRun = useMemo(() => Boolean(tournamentId.trim()), [tournamentId]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>DEV: Tournament Standings Import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex flex-col gap-2 text-sm text-foreground">
            <span className="text-xs font-semibold text-muted-foreground">Tournament ID</span>
            <Input
              value={tournamentId}
              onChange={(event) => setTournamentId(event.target.value)}
              placeholder="UUID"
            />
          </label>
          {preview.tournament ? (
            <div className="text-xs text-muted-foreground">
              Loaded: {preview.tournament.name} · {preview.tournament.season ?? "Не вказано"}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <StandingsUpdatePanel
        loading={preview.loading}
        error={preview.error}
        diff={preview.diff}
        canWrite={preview.canWrite}
        lastFetchedAt={preview.lastFetchedAt}
        linkRequired={preview.linkRequired}
        previewDisabled={!canRun}
        onPreview={() => (canRun ? preview.runPreview() : null)}
        onOpenModal={() => setModalOpen(true)}
        onReset={preview.resetPreview}
        onLink={preview.linkTournamentToTeam}
      />

      <StandingsPreviewModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        rows={preview.diff?.rows ?? []}
        canWrite={preview.canWrite}
        onConfirm={async () => {
          await preview.confirmApply();
          setModalOpen(false);
        }}
        loading={preview.loading}
      />
    </div>
  );
}
