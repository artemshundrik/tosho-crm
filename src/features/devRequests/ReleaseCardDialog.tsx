import * as React from "react";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  copyImageToClipboard,
  renderReleaseCard,
  suggestAfter,
  suggestBefore,
  suggestHowToCheck,
} from "./releaseCardImage";
import type { DevRequest } from "./types";

/**
 * Збирає картинку «виправлено», щоб кинути її в чат тому, хто просив.
 *
 * ЧОМУ ТУТ ДВА ПОЛЯ, А НЕ ПОВНИЙ АВТОМАТ. У картці лежить опис ПРОБЛЕМИ, а не
 * результату: «модалки відкриваються з неправильним розміром» не перетворити
 * на «що тепер працює» без людини. Тим паче — на «як перевірити»: цього немає
 * в базі взагалі. Тож підставляємо назву як чернетку й даємо дописати двома
 * рядками. Це двадцять секунд, зате картка справді корисна, а не ввічлива.
 *
 * Прев'ю показуємо одразу: інакше людина копіює наосліп і дізнається про
 * обрізаний рядок уже з чату.
 */
export function ReleaseCardDialog({
  request,
  open,
  onOpenChange,
}: {
  request: DevRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [before, setBefore] = React.useState(() => suggestBefore(request.body));
  const [summary, setSummary] = React.useState(() => suggestAfter(request.body) || request.title);
  const [howToCheck, setHowToCheck] = React.useState(() =>
    suggestHowToCheck(request.moduleKey, request.body)
  );
  const [preview, setPreview] = React.useState<string | null>(null);
  const [blob, setBlob] = React.useState<Blob | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Нова картка — нова чернетка. Без цього діалог, відкритий удруге, показував
  // би текст від попередньої задачі.
  React.useEffect(() => {
    if (!open) return;
    setBefore(suggestBefore(request.body));
    setSummary(suggestAfter(request.body) || request.title);
    setHowToCheck(suggestHowToCheck(request.moduleKey, request.body));
  }, [open, request.number, request.title, request.body, request.moduleKey]);

  // Перемальовуємо з паузою: інакше кожна літера в полі — це новий PNG.
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    const timer = setTimeout(() => {
      void renderReleaseCard({
        number: request.number,
        kind: request.kind,
        title: request.title,
        before,
        summary,
        howToCheck,
        releasedAt: request.releasedAt ?? request.createdAt,
        zone: request.zone,
        theme: request.theme,
        moduleKey: request.moduleKey,
      }).then((next) => {
        if (!alive || !next) return;
        setBlob(next);
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(next);
        });
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, request.number, request.kind, request.title, request.releasedAt, request.createdAt, request.zone, request.theme, request.moduleKey, before, summary, howToCheck]);

  // Посилання на об'єкт живе рівно стільки, скільки відкритий діалог.
  React.useEffect(
    () => () => {
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    },
    []
  );

  const copy = async () => {
    if (!blob) return;
    setBusy(true);
    const ok = await copyImageToClipboard(blob);
    setBusy(false);
    if (ok) {
      toast.success("Картку скопійовано — вставляй у чат");
      onOpenChange(false);
      return;
    }
    toast.error("Не вдалося покласти в буфер", {
      description: "Браузер не дозволив запис картинки. Спробуй ще раз після кліку по вікну.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Картка для чату</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="release-before">Було</Label>
            <Textarea
              id="release-before"
              value={before}
              onChange={(event) => setBefore(event.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="release-summary">Що тепер працює</Label>
            <Textarea
              id="release-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="release-check">Як перевірити</Label>
            <Textarea
              id="release-check"
              value={howToCheck}
              onChange={(event) => setHowToCheck(event.target.value)}
              rows={2}
              placeholder="Наприклад: Фінанси → Виплати команді → колонка «Штраф»"
              className="resize-none text-sm"
            />
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            {preview ? (
              <img src={preview} alt="Прев'ю картки" className="w-full rounded-lg" />
            ) : (
              <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                Малюємо…
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button onClick={() => void copy()} disabled={!blob || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Скопіювати картинку
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
