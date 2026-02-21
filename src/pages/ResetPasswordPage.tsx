import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return "Не вдалося надіслати лист.";
}

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setBusy(true);

    try {
      if (!email.trim()) {
        setError("Вкажи email.");
        return;
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (resetError) throw resetError;
      setMsg("Лист для встановлення пароля надіслано. Перевір пошту.");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-[var(--radius-section)] border border-border bg-card shadow-surface p-6 text-card-foreground">
        <div className="mb-5">
          <div className="text-xl font-extrabold text-foreground">Відновлення пароля</div>
          <div className="text-sm text-muted-foreground mt-1">Введи email, і ми надішлемо лист для встановлення нового пароля.</div>
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
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input
              className="mt-1.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
              autoComplete="email"
              type="email"
            />
          </div>

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "..." : "Надіслати лист"}
          </Button>
        </form>

        <div className="mt-5 text-center text-xs text-muted-foreground">
          <Link className="underline hover:text-primary transition-colors" to="/login">
            Повернутись до входу
          </Link>
        </div>
      </div>
    </div>
  );
}
