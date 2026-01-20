import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (!mounted) return;
      setHasSession(!!data.session);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);

    if (!password || password.length < 6) {
      setError("Пароль має містити щонайменше 6 символів.");
      return;
    }
    if (password !== confirm) {
      setError("Паролі не співпадають.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMsg("Пароль оновлено. Зараз перенаправлю на вхід.");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err: any) {
      setError(err?.message ?? "Не вдалося оновити пароль.");
    } finally {
      setBusy(false);
    }
  };

  if (hasSession === false) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-[var(--radius-section)] border border-border bg-card shadow-surface p-6 text-card-foreground text-center">
          <div className="text-xl font-extrabold text-foreground">Посилання недійсне</div>
          <div className="text-sm text-muted-foreground mt-2">
            Спробуй надіслати новий лист для встановлення пароля.
          </div>
          <div className="mt-5">
            <Link className="underline hover:text-primary transition-colors text-sm" to="/reset-password">
              Надіслати новий лист
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-[var(--radius-section)] border border-border bg-card shadow-surface p-6 text-card-foreground">
        <div className="mb-5">
          <div className="text-xl font-extrabold text-foreground">Встановити новий пароль</div>
          <div className="text-sm text-muted-foreground mt-1">Введи новий пароль для свого акаунта.</div>
        </div>

        {(error || msg) && (
          <div
            className={`mb-4 rounded-[var(--radius-inner)] border p-3 text-sm font-medium ${
              error
                ? "bg-danger-soft border-danger-soft-border text-danger-foreground"
                : "bg-success-soft border-success-soft-border text-success-foreground"
            }`}
          >
            <div className="font-bold">{error ? "Помилка" : "Готово"}</div>
            <div className="mt-0.5 opacity-90">{error ?? msg}</div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Новий пароль</label>
            <PasswordInput
              wrapperClassName="mt-1.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Повтори пароль</label>
            <PasswordInput
              wrapperClassName="mt-1.5"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "..." : "Оновити пароль"}
          </Button>
        </form>
      </div>
    </div>
  );
}
