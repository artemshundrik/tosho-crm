import React, { useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { 
  Loader2, 
  User, 
  Check, 
  LogOut, 
  ArrowRight,
  ShieldAlert
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function InvitePage() {
  const { session, signOut, refreshTeamContext } = useAuth();
  const user = session?.user;

  const [params] = useSearchParams();
  const code = params.get("code");
  const nav = useNavigate();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Посилання для логіну з поверненням назад на інвайт
  const linkToAuth = useMemo(() => {
    const nextPath = code ? `/invite?code=${code}` : "/";
    return `/login?next=${encodeURIComponent(nextPath)}`;
  }, [code]);

  // --- ВАРІАНТ 1: НЕМАЄ КОДУ ---
  if (!code) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-[28px] border border-border bg-card shadow-surface p-8 text-center text-card-foreground animate-in fade-in zoom-in-95">
          <div className="mx-auto bg-danger-soft w-16 h-16 rounded-full flex items-center justify-center mb-6 text-danger-foreground border border-danger-soft-border">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-extrabold text-foreground">Невірне посилання</h2>
          <p className="text-muted-foreground mt-2">
            У посиланні відсутній код запрошення. Спробуйте скопіювати його заново.
          </p>
          <button
            onClick={() => nav("/")}
            className="mt-6 w-full rounded-[var(--btn-radius)] border border-input bg-background py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-accent hover:text-accent-foreground"
          >
            На головну
          </button>
        </div>
      </div>
    );
  }

  // Функція прийняття
  const acceptInvite = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.rpc("accept_team_invite", { p_code: code });
      if (error) throw error;

      await refreshTeamContext();
      setSuccess(true);
      
      setTimeout(() => {
        nav("/overview");
      }, 1500);

    } catch (e: any) {
      console.error(e);
      let msg = "Не вдалося прийняти запрошення.";
      const rawMessage = e?.message || e?.error_description || e?.details;
      if (rawMessage?.includes("expired")) msg = "Термін дії посилання минув.";
      if (rawMessage?.includes("already")) msg = "Ви вже є учасником цієї команди.";
      if (rawMessage && rawMessage !== msg) {
        msg = `${msg} (${rawMessage})`;
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  // --- ВАРІАНТ 2: ЮЗЕР НЕ АВТОРИЗОВАНИЙ (Лендінг інвайту) ---
  if (!session) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-[28px] border border-border bg-card shadow-surface p-8 text-center text-card-foreground animate-in fade-in zoom-in-95 duration-300">
          
          {/* Іконка */}
          <div className="mx-auto bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center mb-6 text-primary border border-primary/20">
            <User className="w-10 h-10" />
          </div>

          <h1 className="text-2xl font-extrabold text-foreground">Вас запросили в команду!</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Щоб прийняти запрошення, увійдіть у свій обліковий запис або зареєструйтеся.
          </p>

          {/* Інфо-блок */}
          <div className="mt-6 bg-muted/50 rounded-xl p-4 border border-border text-sm text-muted-foreground">
            Це запрошення буде прив'язано до вашого акаунту після входу.
          </div>

          {/* Кнопка */}
          <Link 
            to={linkToAuth}
            className="mt-6 inline-flex w-full items-center justify-center rounded-[var(--btn-radius)] bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            Увійти або Створити акаунт <ArrowRight className="ml-2 w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  // --- ВАРІАНТ 3: ЮЗЕР АВТОРИЗОВАНИЙ (Підтвердження) ---
  const email = user?.email;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-[28px] border border-border bg-card shadow-surface p-8 text-center text-card-foreground animate-in fade-in zoom-in-95 duration-300 relative">
        
        {/* Кнопка виходу */}
        <button 
          onClick={() => signOut()}
          className="absolute top-4 right-4 text-xs font-medium text-muted-foreground hover:text-destructive flex items-center transition-colors"
          title="Вийти з акаунту"
        >
          <LogOut className="w-3.5 h-3.5 mr-1" /> Це не я
        </button>

        {success ? (
          // Стан успіху
          <div className="flex flex-col items-center justify-center py-4">
             <div className="w-16 h-16 bg-success-soft text-success-foreground border border-success-soft-border rounded-full flex items-center justify-center mb-4">
                <Check className="w-8 h-8" />
             </div>
             <h2 className="text-xl font-bold text-foreground">Успішно!</h2>
             <p className="text-muted-foreground mt-1">Заходимо в команду...</p>
          </div>
        ) : (
          // Стан підтвердження
          <>
            <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4 text-primary font-bold text-xl border-4 border-background shadow-sm">
              {email?.slice(0, 2).toUpperCase()}
            </div>

            <h2 className="text-lg font-medium text-muted-foreground">Привіт, {email}</h2>
            <h1 className="text-2xl font-extrabold text-foreground mt-1">Прийняти запрошення?</h1>

            <div className="mt-6 bg-muted/30 border border-border rounded-xl p-4 text-left flex items-start gap-3">
              <div className="bg-background p-1.5 rounded-lg shadow-sm text-primary border border-border shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Доступ до команди</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Ви отримаєте доступ до перегляду та редагування даних згідно з виданою роллю.
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-xl bg-danger-soft text-danger-foreground text-sm font-medium border border-danger-soft-border">
                {error}
              </div>
            )}

            <button
              onClick={acceptInvite}
              disabled={busy}
              className="mt-6 w-full rounded-[var(--btn-radius)] bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {busy ? (
                <>
                   <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Обробка...
                </>
              ) : (
                "Приєднатися до команди"
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
