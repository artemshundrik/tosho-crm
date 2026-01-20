import React, { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup" | "magic">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const title = useMemo(() => {
    if (mode === "login") return "Вхід (email + пароль)";
    if (mode === "signup") return "Реєстрація";
    return "Вхід по magic link";
  }, [mode]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMsg("Успішно. Перенаправляю…");
      }

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Акаунт створено. Якщо увімкнене підтвердження пошти — перевір email.");
      }

      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMsg("Відправив magic link на пошту. Відкрий лист і перейди за посиланням.");
      }
    } catch (err: any) {
      setMsg(err?.message ?? "Помилка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-[var(--radius-section)] border border-border bg-card p-6 shadow-surface text-card-foreground">
        <div className="mb-5">
          <div className="text-2xl font-semibold text-foreground">FAYNA TEAM</div>
          <div className="text-sm text-muted-foreground mt-1">{title}</div>
        </div>

        <div className="inline-flex h-10 items-center rounded-[var(--radius-lg)] border border-border bg-muted p-1 gap-1 mb-5">
          <Button
            type="button"
            variant="segmented"
            size="xs"
            aria-pressed={mode === "login"}
            onClick={() => setMode("login")}
          >
            Вхід
          </Button>
          <Button
            type="button"
            variant="segmented"
            size="xs"
            aria-pressed={mode === "signup"}
            onClick={() => setMode("signup")}
          >
            Реєстрація
          </Button>
          <Button
            type="button"
            variant="segmented"
            size="xs"
            aria-pressed={mode === "magic"}
            onClick={() => setMode("magic")}
          >
            Magic link
          </Button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <div className="text-sm font-medium mb-1">Email</div>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </label>

          {mode !== "magic" && (
            <label className="block">
              <div className="text-sm font-medium mb-1">Пароль</div>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={6}
              />
              <div className="text-xs text-muted-foreground mt-1">Мінімум 6 символів.</div>
            </label>
          )}

          <Button className="w-full" type="submit" disabled={busy}>
            {busy ? "..." : "Продовжити"}
          </Button>

          {msg && <div className="text-sm mt-2 text-muted-foreground">{msg}</div>}
        </form>
      </div>
    </div>
  );
}
