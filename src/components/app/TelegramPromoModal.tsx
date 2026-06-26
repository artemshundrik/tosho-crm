import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";

// Промо «Підключи Telegram-бот». Показуємо раз тим, хто ще не підключив.
// Версіонуємо ключем: щоб показати знову при наступній хвилі — зміни на _v2.
const PROMO_KEY = "promo_telegram_v1_dismissed";

export function TelegramPromoModal() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    try {
      if (localStorage.getItem(PROMO_KEY) === "1") return;
    } catch {
      // ignore storage access issues
    }
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
        } else {
          // вже підключено — більше не турбуємо
          try {
            localStorage.setItem(PROMO_KEY, "1");
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
  }, [userId]);

  const dismiss = () => {
    try {
      localStorage.setItem(PROMO_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  };

  const goToSettings = () => {
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
