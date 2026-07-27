import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Проміжна сторінка для посилань входу.
 *
 * Навіщо: месенджери самі відкривають кожне надіслане посилання, щоб зібрати
 * прев'ю. Одноразовий токен Supabase від такого візиту згорає, і людина, яка
 * тисне на посилання через хвилину, отримує вже мертве. У нас це підтвердилось
 * буквально: сесію тримав user_agent «TelegramBot (like TwitterBot)».
 *
 * Тому справжнє посилання їде у hash — фрагмент URL взагалі не надсилається на
 * сервер, тож краулер його не бачить і перейти за ним не може. Перехід робить
 * лише людина, натиснувши кнопку.
 */
export default function EnterPage() {
  const [target, setTarget] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const allowedOrigin = useMemo(() => {
    try {
      return new URL(import.meta.env.VITE_SUPABASE_URL as string).origin;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const raw = new URLSearchParams(hash).get("link");
    if (!raw) {
      setInvalid(true);
      return;
    }

    // Пускаємо лише на власний Supabase: інакше сторінка стала б відкритим
    // редиректом, яким зручно маскувати фішинг під наш домен.
    try {
      const url = new URL(raw);
      if (!allowedOrigin || url.origin !== allowedOrigin) {
        setInvalid(true);
        return;
      }
      setTarget(url.toString());
    } catch {
      setInvalid(true);
    }
  }, [allowedOrigin]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-section border border-border bg-card shadow-surface p-8 text-center text-card-foreground">
        {invalid ? (
          <>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-danger-soft-border bg-danger-soft text-danger-foreground">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-extrabold text-foreground">Посилання неповне</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Схоже, воно скопіювалося не повністю. Попросіть адміністратора надіслати нове —
              копіювати треба весь рядок цілком.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold text-foreground">Вхід у ToSho CRM</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Натисніть кнопку, щоб увійти та задати свій пароль. Посилання одноразове —
              відкривайте його один раз і до кінця.
            </p>
            <Button asChild className="mt-6 w-full" disabled={!target}>
              <a href={target ?? "#"}>
                Увійти <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
