import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldAlert, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarBase } from "@/components/app/avatar-kit";
import { cn } from "@/lib/utils";
import type { EntityLockState } from "@/hooks/useEntityLock";

/**
 * «Хтось працює в задачі» — один банер на всі стани передачі редагування.
 *
 * ЧОМУ НЕ ЖОВТИЙ. Попередня версія була tone-warning, і це була помилка змісту,
 * а не відтінку: жовтий у CRM означає «щось не так», а тут нічого не сталося —
 * людина просто працює. Тому основний стан нейтральний, з аватаром і живим
 * вогником: він повідомляє ПРИСУТНІСТЬ, а не тривогу.
 *
 * Жовтий лишився рівно в одному місці — коли відлік простою справді тікає.
 * Там попередження чесне.
 *
 * Станів чотири, і в кожного інший адресат — тому вони зібрані разом, а не
 * розкидані по сторінках: інакше ТЗ, прорахунок і замовлення почали б говорити
 * про одне й те саме різними словами.
 */

type EntityLockBannerProps = {
  lock: EntityLockState;
  /** Що саме заблоковано: «ТЗ», «прорахунок». Знахідний відмінок. */
  subject: string;
  /** Власник і CEO — резервний сценарій, коли людина недоступна. */
  canForceRelease?: boolean;
  /** Віддати лок самому (для стану «мене просять»). */
  onRelease?: () => void;
  className?: string;
};

const SHELL = "rounded-xl border px-3.5 py-2.5 text-sm";
const CALM = "border-border bg-card";

/**
 * Рядок банера: на телефоні — стовпчик, на sm+ — рядок.
 *
 * Було `flex flex-wrap items-center gap-3` на всі ширини. На 375px кнопки
 * «Попросити звільнити» і «Забрати» переносились під текст і ставали в лівий
 * край нерівною драбинкою, а `gap-3` між ними лишався вертикальним — виходило
 * три різні відступи в одному банері. Тепер дві явні розкладки замість однієї
 * «щоб якось перенеслось».
 */
// `items-start` у колонковому режимі обов'язковий: без нього flex розтягує
// дочірні елементи на всю ширину (stretch за замовчуванням), і обгортка
// аватара з `absolute` вогником стає шириною в екран — крапка присутності
// відлітає до правого краю банера, за кілометр від людини, якій належить.
const ROW = "flex flex-col items-start gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3";
/** Кнопки: на телефоні тримаються правого краю під текстом. */
const ACTIONS = "flex shrink-0 items-center gap-1.5 max-sm:w-full max-sm:justify-end";

/** Живий вогник присутності. Кільце гасне при prefers-reduced-motion. */
function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
    </span>
  );
}

export function EntityLockBanner({
  lock,
  subject,
  canForceRelease = false,
  onRelease,
  className,
}: EntityLockBannerProps) {
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(failure, { description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  // 4. Лок віддано, але людина ще на сторінці й може повернутись.
  if (lock.releasedReason) {
    return (
      <div className={cn(SHELL, CALM, className)}>
        <div className={ROW}>
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border/70 bg-muted text-muted-foreground"
            aria-hidden
          >
            <TimerReset className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 leading-relaxed">
            <span className="font-medium">Редагування завершено</span>{" "}
            <span className="text-muted-foreground">
              {lock.releasedReason === "idle" ? "через відсутність активності. " : ""}
              Зміни збережено, версію додано в історію.
            </span>
          </span>
          <div className={ACTIONS}>
            <Button size="sm" variant="outline" onClick={lock.resume}>
              Продовжити редагування
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Відлік. Єдине місце, де жовтий доречний: тут справді щось зараз станеться.
  if (lock.acquired && lock.idleSecondsLeft !== null) {
    return (
      <div className={cn(SHELL, "tone-warning", className)}>
        <div className={ROW}>
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-current/25 bg-background/40"
            aria-hidden
          >
            <TimerReset className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 leading-relaxed">
            Редагування буде завершено через{" "}
            <span className="font-semibold tabular-nums">{lock.idleSecondsLeft} с</span> через
            відсутність активності.
            {lock.releaseRequestedByName ? ` ${lock.releaseRequestedByName} чекає на доступ.` : ""}
          </span>
          <div className={ACTIONS}>
            <Button size="sm" onClick={lock.keepAlive}>
              Я тут
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Тримаєш ти, і хтось просить звільнити.
  if (lock.acquired && lock.releaseRequestedByName) {
    return (
      <div className={cn(SHELL, CALM, className)}>
        <div className={ROW}>
          <AvatarBase name={lock.releaseRequestedByName} size={28} showStatusIndicator={false} />
          <span className="min-w-0 flex-1 leading-relaxed">
            <span className="font-medium">{lock.releaseRequestedByName}</span>{" "}
            <span className="text-muted-foreground">просить звільнити {subject}</span>
          </span>
          {onRelease ? (
            <div className={ACTIONS}>
              <Button size="sm" onClick={onRelease}>
                Звільнити
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // 1. Заблоковано тебе — основний і найчастіший стан.
  if (lock.lockedByOther) {
    const holder = lock.holderName ?? "Інший користувач";
    return (
      <div className={cn(SHELL, CALM, className)}>
        <div className={ROW}>
          {/* Аватар із вогником у кутику замість двох окремих значків у ряд:
              крапка належить людині, а не стоїть поруч як третій елемент. */}
          <span className="relative shrink-0">
            <AvatarBase name={holder} size={28} showStatusIndicator={false} />
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-card p-0.5">
              <LiveDot />
            </span>
          </span>
          <span className="min-w-0 flex-1 leading-relaxed">
            <span className="font-medium">{holder}</span>{" "}
            <span className="text-muted-foreground">редагує {subject}</span>
          </span>

          <div className={ACTIONS}>
            {lock.releaseRequestSent ? (
              // Свідомо без «надіслати ще раз»: повторний запит нічого не
              // змінює, а кнопка провокує довбати по ній.
              <span className="text-xs text-muted-foreground">Запит надіслано, очікуємо…</span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => run(lock.requestRelease, "Не вдалося надіслати запит")}
              >
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Попросити звільнити
              </Button>
            )}

            {canForceRelease ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => run(lock.forceRelease, "Не вдалося забрати редагування")}
              >
                <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
                Забрати
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
