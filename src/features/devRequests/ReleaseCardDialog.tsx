import * as React from "react";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { pluralUk } from "@/lib/lastSeen";
import {
  copyImageToClipboard,
  fitToRow,
  measureCardRow,
  renderReleaseCard,
  suggestAfter,
  suggestBefore,
  suggestHowToCheck,
  type CardRow,
} from "./releaseCardImage";
import { useReleaseCommitSummary } from "./queries";
import type { DevRequest } from "./types";

/**
 * Чи влізе рядок у картку — і скільки символів зайві.
 *
 * ПРАВИЛО ТУТ ТАКЕ: межа не забороняє писати довше, картка росте й показує
 * дописане цілим. Але «Було» на шість рядків перетворює картку для чату на
 * стіну тексту, тож вікно каже рівно, скільки прибрати. Рахує це той самий
 * canvas тим самим шрифтом, що й малює, — тому число точне, а не «десь
 * стільки». Мовчить, поки все гаразд: підказка, яка світиться завжди, за
 * тиждень перестає читатись.
 */
function RowFitHint({ row, text }: { row: CardRow; text: string }) {
  const fit = React.useMemo(() => measureCardRow(row, text), [row, text]);
  if (!fit || fit.overflow === 0) return null;
  return (
    <p className="text-2xs tone-text-warning">
      {fit.cropped
        ? `Стільки не влізе — текст обріжеться на «…». Прибери ≈${fit.overflow} символів.`
        : `На картці стане ${pluralUk(fit.lines, "рядок", "рядки", "рядків")} замість ${fit.limit} — вона розтягнеться. Прибери ≈${fit.overflow} символів.`}
    </p>
  );
}

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
  /**
   * Розбір опису рахуємо один раз на картку: усередині заміри по canvas, і
   * гнати їх щорендеру заради того самого рядка немає навіщо.
   */
  const parsedSummary = React.useMemo(() => suggestAfter(request.body), [request.body]);
  /**
   * Опис без розділу «Як має бути» — питаємо тему релізного коміта. Саме там
   * лежить результат людськими словами, бо цього вимагає домовленість про
   * теми комітів. Не питаємо, коли розділ є: свій текст завжди точніший.
   */
  const commitSummary = useReleaseCommitSummary(request.commitShas, open && !parsedSummary);
  const [before, setBefore] = React.useState(() => suggestBefore(request.body));
  /**
   * БЕЗ запасного варіанта на назву картки.
   *
   * Назва тут завжди формулює ПРОБЛЕМУ («Дизайнеру не приходять сповіщення»),
   * бо такою її складає розбір заявки. Підставлена в «Тепер», вона давала
   * картку, де до і після написано одне й те саме: «Було: не приходить
   * сповіщення» → «Тепер: не приходять сповіщення». Краще порожньо і видима
   * вимога дописати, ніж готовий текст, який заперечує сам себе.
   */
  const [summary, setSummary] = React.useState(parsedSummary);
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
    setSummary(parsedSummary);
    setHowToCheck(suggestHowToCheck(request.moduleKey, request.body));
  }, [open, request.number, request.title, request.body, request.moduleKey, parsedSummary]);

  /**
   * Тема коміта приходить пізніше за відкриття вікна, тож підставляємо її
   * окремо — і ТІЛЬКИ в порожнє поле. Якщо людина вже щось написала (або
   * свідомо стерла й пише своє), чернетка з бази не має цього збивати.
   */
  React.useEffect(() => {
    const subject = commitSummary.data;
    if (!open || !subject) return;
    const draft = fitToRow("summary", subject.charAt(0).toUpperCase() + subject.slice(1));
    setSummary((prev) => (prev.trim() ? prev : draft));
  }, [open, commitSummary.data]);

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
            <RowFitHint row="before" text={before} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="release-summary">Що тепер працює</Label>
            <Textarea
              id="release-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={2}
              placeholder="Одним реченням, з погляду того, хто користується: «сповіщення про повідомлення в чаті тепер приходять усім учасникам задачі»"
              className="resize-none text-sm"
            />
            {/*
             * Це головний рядок картки: без нього вона повідомляє проблему й
             * мовчить про зміну. Тому не підказка, а умова — кнопка нижче
             * лишається вимкненою, поки тут порожньо.
             */}
            {!summary.trim() ? (
              <p className="text-2xs tone-text-warning">
                Без цього рядка картка розповість лише про проблему — напишіть, що змінилось.
              </p>
            ) : (
              <RowFitHint row="summary" text={summary} />
            )}
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
            <RowFitHint row="howToCheck" text={howToCheck} />
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
          <Button onClick={() => void copy()} disabled={!blob || busy || !summary.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Скопіювати картинку
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
