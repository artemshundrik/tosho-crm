import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { planUpdateModal, type ProductUpdate } from "@/lib/productUpdates";
import { useVisibleUpdates } from "@/features/features/useVisibleUpdates";
import { useMarkUpdatesRead } from "@/features/features/updateQueries";

/**
 * Модалка анонсу при вході.
 *
 * ОБЕРЕЖНО: саме тут живе весь ризик. Діюча промо-модалка бота дала 53 покази
 * й 2 кліки — тобто вікно, яке треба закрити, люди закривають. Тому:
 *   • не більше ОДНІЄЇ модалки за сеанс (і вона витісняє промо бота);
 *   • постер лише для поодинокої великої фічі, решта — дайджест;
 *   • анонси, старші за два тижні, модалкою не турбують — лише стрічкою;
 *   • «переглянув» пишеться в БД, а не в localStorage: промо обманювалась
 *     саме на цьому, бо новий браузер обнуляв лічильник.
 *
 * Якщо клікабельність виявиться нижчою за ті самі ~4% — модалку треба
 * вимкнути, а не «покращувати». Це записано в дизайн-доку свідомо.
 */

/** Ключ сеансу: одна модалка на вкладку, поки її не перезавантажили. */
const SESSION_KEY = "product_update_modal_shown";

function readShownThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    // Немає доступу до сховища — краще промовчати, ніж показувати щоразу.
    return true;
  }
}

export function ProductUpdateModal() {
  const navigate = useNavigate();
  const { viewUserId } = useAuth();
  const { unread, ready } = useVisibleUpdates();
  const markRead = useMarkUpdatesRead(viewUserId);
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<ReturnType<typeof planUpdateModal>>({ kind: "none" });

  useEffect(() => {
    if (!ready || open || plan.kind !== "none") return;

    const next = planUpdateModal({
      unread,
      now: new Date(),
      shownThisSession: readShownThisSession(),
    });
    if (next.kind === "none") return;

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // ignore
    }
    setPlan(next);
    setOpen(true);
  }, [ready, unread, open, plan.kind]);

  const shown = useMemo<ProductUpdate[]>(() => {
    if (plan.kind === "poster") return [plan.update];
    if (plan.kind === "digest") return plan.updates;
    return [];
  }, [plan]);

  const close = () => {
    setOpen(false);
    // Закрив — отже побачив. Далі його турбує лише стрічка.
    markRead(
      shown.map((update) => update.id),
      "modal"
    );
  };

  const go = (href: string) => {
    close();
    navigate(href);
  };

  if (plan.kind === "none" || shown.length === 0) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      {/* Анонс оновлення — нічого не вводять, клік повз закриває. */}
      <DialogContent
        dismissible
        className={cn(
          "gap-0 overflow-hidden p-0 sm:gap-0 sm:p-0",
          plan.kind === "poster" ? "max-w-[440px]" : "max-w-[560px]"
        )}
      >
        {plan.kind === "poster" ? (
          <PosterBody update={shown[0]} onGo={go} onClose={close} />
        ) : (
          <DigestBody updates={shown} onGo={go} onClose={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Постер: одна велика фіча ──────────────────────────────────── */

function PosterBody({
  update,
  onGo,
  onClose,
}: {
  update: ProductUpdate;
  onGo: (href: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="p-7">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-2xs font-semibold text-primary">
        <Sparkle className="h-3 w-3" />
        Нове в CRM
      </span>

      <DialogTitle className="mt-4 text-2xl font-semibold leading-tight tracking-tight">
        {update.title}
      </DialogTitle>

      <DialogDescription className="mt-3 text-sm leading-7 text-muted-foreground">
        {update.body}
      </DialogDescription>

      <div className="mt-6 grid gap-2">
        {update.ctaHref ? (
          <Button type="button" className="w-full" onClick={() => onGo(update.ctaHref as string)}>
            {update.ctaLabel ?? "Спробувати"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : null}
        <Button type="button" variant="ghost" className="w-full" onClick={onClose}>
          Пізніше
        </Button>
      </div>
    </div>
  );
}

/* ── Дайджест: пачка змін за реліз ─────────────────────────────── */

function DigestBody({
  updates,
  onGo,
  onClose,
}: {
  updates: ProductUpdate[];
  onGo: (href: string) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  return (
    <>
      <div className="px-6 pb-4 pt-6">
        <DialogTitle className="text-xl font-semibold tracking-tight">Що нового</DialogTitle>
        <DialogDescription className="mt-1.5 text-sm leading-6 text-muted-foreground">
          {updates.length === 1
            ? "Одне оновлення, поки тебе не було."
            : `${updates.length} оновлення, поки тебе не було. Хвилина на все.`}
        </DialogDescription>
      </div>

      <div className="border-t border-border">
        {updates.map((update) => (
          <div
            key={update.id}
            className="grid grid-cols-[3px_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-border px-6 py-3.5 last:border-b-0"
          >
            <span
              className={cn(
                "h-full min-h-[2rem] rounded-full",
                update.importance === "major" ? "bg-primary" : "bg-border"
              )}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium tracking-tight">{update.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {update.body}
              </p>
            </div>
            {update.ctaHref ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onGo(update.ctaHref as string)}
              >
                {update.ctaLabel ?? "Спробувати"}
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-6 py-4">
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate("/whats-new");
          }}
          className="cursor-pointer text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Уся історія →
        </button>
        <Button type="button" onClick={onClose}>
          Готово
        </Button>
      </div>
    </>
  );
}
