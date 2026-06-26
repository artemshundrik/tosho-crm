import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { logActivity } from "@/lib/activityLogger";

// Промо «Підключи Telegram-бот». «Дотискаємо» незалучених: показуємо до
// MAX_SHOWS разів із добовим інтервалом, поки не підключать. Підключив — більше
// ніколи. Версія в ключі (_v1) — зміни на _v2, щоб запустити нову хвилю.
const PROMO_VER = "promo_telegram_v1";
const COUNT_KEY = `${PROMO_VER}_count`;
const LAST_KEY = `${PROMO_VER}_last`;
const LEGACY_KEY = `${PROMO_VER}_dismissed`;
const MAX_SHOWS = 3;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function readShowCount(): number {
  try {
    const raw = localStorage.getItem(COUNT_KEY);
    if (raw != null) return Number(raw) || 0;
    // міграція зі старого булевого прапорця: вважаємо що показ уже був 1 раз
    if (localStorage.getItem(LEGACY_KEY) === "1") return 1;
    return 0;
  } catch {
    return MAX_SHOWS; // нема доступу до storage — не нав'язуємось
  }
}

export function TelegramPromoModal() {
  const { userId, teamId } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const count = readShowCount();
    if (count >= MAX_SHOWS) return; // ліміт показів вичерпано
    let last = 0;
    try {
      last = Number(localStorage.getItem(LAST_KEY) || "0");
    } catch {
      return;
    }
    if (last && Date.now() - last < COOLDOWN_MS) return; // показували нещодавно — чекаємо добу

    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        const { data } = await db
          .from("user_notification_settings")
          .select("telegram_chat_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (!active) return;
        if (data?.telegram_chat_id == null) {
          setOpen(true);
          try {
            localStorage.setItem(COUNT_KEY, String(count + 1));
            localStorage.setItem(LAST_KEY, String(Date.now()));
          } catch {
            // ignore
          }
          void logActivity({
            teamId,
            userId,
            action: "telegram_promo_shown",
            entityType: "telegram_promo",
            metadata: { promo: PROMO_VER, show: count + 1 },
          });
        } else {
          // вже підключено — глушимо назавжди
          try {
            localStorage.setItem(COUNT_KEY, String(MAX_SHOWS));
          } catch {
            // ignore
          }
        }
      })();
    }, 900);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [userId, teamId]);

  const dismiss = () => {
    // Показ уже зараховано — просто закриваємо; за добу покажемо знову, поки не
    // вичерпано MAX_SHOWS і не підключив.
    setOpen(false);
  };

  const goToSettings = () => {
    void logActivity({
      teamId,
      userId,
      action: "telegram_promo_clicked",
      entityType: "telegram_promo",
      metadata: { promo: PROMO_VER },
    });
    dismiss();
    navigate("/profile");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent hideClose className="max-w-[400px] gap-0 overflow-hidden p-0 sm:gap-0 sm:p-0">
        <div className="relative">
          <img src="/brand/promo-telegram.png" alt="" className="block w-full" loading="eager" />
          <button
            type="button"
            onClick={dismiss}
            aria-label="Закрити"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 pb-6 pt-5 text-center">
          <DialogTitle className="flex items-center justify-center gap-2 text-xl font-semibold text-foreground">
            <Send className="h-5 w-5 text-primary" />
            Підключи Telegram-бот
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-6 text-muted-foreground">
            Отримуй сповіщення CRM прямо в Telegram: нагадування по клієнтах і лідах,
            дедлайни прорахунків, події команди. У налаштуваннях обереш, що саме слати.
          </DialogDescription>
          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={goToSettings} className="w-full">
              Перейти в налаштування
            </Button>
            <Button variant="ghost" onClick={dismiss} className="w-full">
              Пізніше
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
