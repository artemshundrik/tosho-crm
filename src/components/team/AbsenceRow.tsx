import { CalendarRange, Loader2, Pencil, Trash2 } from "lucide-react";

import { AvatarBase } from "@/components/app/avatar-kit";
import { AbsenceKindChip } from "@/components/team/AbsenceKindChip";
import { Button } from "@/components/ui/button";
import { toneBadgeClass, toneTextClass } from "@/lib/statusTones";
import {
  ABSENCE_QUOTA_UNIT,
  ABSENCE_QUOTA_UNIT_LABEL,
  countQuotaDaysInYear,
} from "@/lib/teamAbsenceCalendar";
import { absenceWaitingDays, formatAbsenceSubmittedAgo } from "@/lib/teamAbsenceQueue";
import { type AbsenceBalance } from "@/lib/teamAbsenceQuotas";
import {
  formatAbsenceRange,
  isQuotaAbsenceKind,
  pluralDays,
  TEAM_ABSENCE_STATUS_LABELS,
  TEAM_ABSENCE_STATUS_TONE,
  type TeamAbsence,
} from "@/lib/teamAbsences";
import { getInitialsFromName } from "@/lib/userName";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Рядок відсутності                                                   */
/* ------------------------------------------------------------------ */

/**
 * Один запис журналу відсутностей — і в черзі погоджень, і у власних заявках,
 * і в повному списку року. Виїхав зі сторінки «Команда» окремим модулем, коли
 * ратчет розміру перестав пускати її зростання.
 */

/** Контекст для approver'а під заявкою: перетини і навантаження заявника. */
export type AbsenceDecideContext = {
  overlaps: string[];
  /** null — заявник не дизайнер, задачі не рахуємо. */
  activeTasks: number | null;
  dueInPeriod: number;
};

export function AbsenceRow({
  absence,
  name,
  exceptions,
  year,
  canManage,
  deleting,
  onEdit,
  onDelete,
  hideName,
  avatarUrl,
  initials,
  decisionComment,
  balance,
  canDecide,
  decisionNote,
  deciding,
  onApprove,
  onDecline,
  canCancel,
  cancelling,
  onCancel,
  decideContext,
}: {
  absence: TeamAbsence;
  name: string;
  exceptions: Map<string, boolean>;
  year: number;
  canManage: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  hideName?: boolean;
  avatarUrl?: string | null;
  initials?: string;
  /** Причина рішення — приходить окремим RPC, видна лише заявнику й owner/CEO. */
  decisionComment?: string | null;
  /** Баланс заявника — щоб рішення приймалось із цифрами перед очима. */
  balance?: AbsenceBalance | null;
  canDecide?: boolean;
  /** Чому кнопок немає: напр. «вирішує власник» — для заявок CEO очима CEO. */
  decisionNote?: string;
  deciding?: boolean;
  onApprove?: () => void;
  onDecline?: () => void;
  canCancel?: boolean;
  cancelling?: boolean;
  onCancel?: () => void;
  /** Перетини з іншими відсутностями + навантаження заявника — для рішення. */
  decideContext?: AbsenceDecideContext | null;
}) {
  // «Інше» і «з дому» квоти не мають — рахуємо робочими днями, щоб показати
  // обсяг («3 роб. дн.»), але рядка «залишиться N із M» для них не буде.
  const quotaKind = isQuotaAbsenceKind(absence.kind) ? absence.kind : "day_off";
  // Рік беремо з самої відсутності, а не з курсора вкладки: у черзі погоджень
  // тепер бувають заявки на наступний рік, і з чужим роком вони показували б
  // «0 днів · квота не списується» (REQ-22).
  const rowYear = Number(absence.startDate.slice(0, 4)) || year;
  const chargedDays = countQuotaDaysInYear(quotaKind, absence, rowYear, exceptions);
  const unitLabel = ABSENCE_QUOTA_UNIT_LABEL[ABSENCE_QUOTA_UNIT[quotaKind]];
  const restOnly = chargedDays === 0;
  // Баланс порахований для завантаженого року. Для заявки на інший рік він
  // просто не про неї — мовчати чесніше, ніж показати чуже число.
  const bucket =
    balance && rowYear === year && isQuotaAbsenceKind(absence.kind) ? balance[absence.kind] : null;
  const submittedLabel = formatAbsenceSubmittedAgo(absence.createdAt);
  const waitingDays = absence.status === "pending" ? absenceWaitingDays(absence.createdAt) : null;
  // Три доби — та межа, після якої заявка вже не «щойно прилетіла». Свіжіші
  // вгорі, тож без цієї позначки задавнена мовчки з'їжджала б у хвіст.
  const waitingTooLong = waitingDays !== null && waitingDays >= 3;

  return (
    // Вузький екран: рядок стає стосом. Бейдж, кнопки рішення й іконки правки —
    // усі shrink-0, тож у один ряд вони видавлювали текстову колонку в стовпчик
    // по одному слову, а хвіст виїжджав за край картки. Поріг саме lg, а не sm:
    // фіксована частина рядка з'їдає близько 500 px, тож на 640 px (заміряно в
    // браузері) текст лишався без місця так само, як на телефоні. Від lg обидві
    // обгортки розпускаються (`display: contents`) назад у той самий плаский
    // ряд — десктоп не змінився.
    <div className="group flex flex-col gap-2 py-2.5 lg:flex-row lg:items-center lg:gap-3">
      <div className="flex min-w-0 items-start gap-3 lg:contents">
        {hideName ? null : (
          <AvatarBase
            src={avatarUrl}
            name={name}
            fallback={initials ?? getInitialsFromName(name)}
            assetVariant="xs"
            size={32}
            className="shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-xs">
            {hideName ? null : <span className="font-semibold">{name}</span>}
            <span className="font-medium tabular-nums">{formatAbsenceRange(absence)}</span>
            <span className="text-muted-foreground">
              {restOnly ? "квота не списується" : `${chargedDays} ${pluralDays(chargedDays)} · ${unitLabel}`}
            </span>
            {/* Дата подання — те, за чим список і впорядкований. Без неї порядок
                «свіжі вгорі» виглядав би випадковим. */}
            {submittedLabel ? (
              <span className={cn("text-muted-foreground", waitingTooLong && toneTextClass.warning)}>
                · {submittedLabel}
              </span>
            ) : null}
          </div>
          {bucket && absence.status === "pending" ? (
            <div className="mt-0.5 text-2xs text-muted-foreground">
              після погодження залишиться{" "}
              <b className="font-medium tabular-nums text-foreground">
                {Math.max(0, bucket.remaining - chargedDays)}
              </b>{" "}
              із {bucket.quota}
            </div>
          ) : null}
          {absence.comment ? (
            <div className="mt-0.5 truncate text-2xs text-muted-foreground">«{absence.comment}»</div>
          ) : null}
          {decisionComment ? (
            <div className={cn("mt-0.5 truncate text-2xs", toneTextClass.danger)}>
              Причина: {decisionComment}
            </div>
          ) : null}
          {decideContext ? (
            <div className="mt-1 space-y-0.5">
              {decideContext.overlaps.length > 0 ? (
                <div className={cn("flex items-start gap-1 text-2xs", toneTextClass.warning)}>
                  <CalendarRange className="mt-px h-3 w-3 shrink-0" aria-hidden />
                  <span className="min-w-0">У ці дні також: {decideContext.overlaps.join(" · ")}</span>
                </div>
              ) : null}
              {typeof decideContext.activeTasks === "number" ? (
                <div className="text-2xs text-muted-foreground">
                  Активних задач:{" "}
                  <b className="font-medium tabular-nums text-foreground">{decideContext.activeTasks}</b>
                  {decideContext.dueInPeriod > 0 ? (
                    <>
                      {" "}
                      · дедлайнів у період:{" "}
                      <b className={cn("font-medium tabular-nums", toneTextClass.danger)}>
                        {decideContext.dueInPeriod}
                      </b>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:contents">
        <AbsenceKindChip kind={absence.kind} size="sm" />
        {absence.status !== "approved" ? (
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-3xs font-semibold",
              toneBadgeClass[TEAM_ABSENCE_STATUS_TONE[absence.status]]
            )}
          >
            {TEAM_ABSENCE_STATUS_LABELS[absence.status]}
          </span>
        ) : null}
        {canDecide && absence.status === "pending" ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="successTonal"
              onClick={onApprove}
              disabled={deciding}
              className="h-10 lg:h-8"
            >
              {deciding ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Погодити
            </Button>
            <Button size="sm" variant="destructive" onClick={onDecline} disabled={deciding} className="h-10 lg:h-8">
              Відхилити
            </Button>
          </div>
        ) : null}
        {!canDecide && decisionNote && absence.status === "pending" ? (
          <span className="shrink-0 text-2xs text-muted-foreground/80">{decisionNote}</span>
        ) : null}
        {canCancel ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            disabled={cancelling}
            className="h-10 shrink-0 lg:h-8"
          >
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Скасувати
          </Button>
        ) : null}
        {/* Ховер — властивість щільного ряду, і на тачі його немає, тож до lg
            дії видно завжди; 44px — мінімальна зона натискання, тому кнопка
            більша за саму іконку. */}
        {canManage ? (
          <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
            <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-9 lg:w-9" onClick={onEdit} aria-label="Редагувати">
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-destructive lg:h-9 lg:w-9"
              onClick={onDelete}
              disabled={deleting}
              aria-label="Видалити"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              )}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
