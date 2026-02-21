import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import {
  Loader2,
  User,
  Check,
  LogOut,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";

type InviteInfo = {
  email: string;
  expiresAt: string;
  acceptedAt: string | null;
  accessRole?: string | null;
  jobRole?: string | null;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const fromMessage = record.message;
    if (typeof fromMessage === "string" && fromMessage) return fromMessage;
  }
  return fallback;
}

export default function InvitePage() {
  const { session, signOut } = useAuth();
  const user = session?.user;

  const [params] = useSearchParams();
  const token = params.get("token") ?? params.get("code");
  const nav = useNavigate();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const linkToAuth = useMemo(() => {
    const nextPath = token ? `/invite?token=${token}` : "/";
    return `/login?next=${encodeURIComponent(nextPath)}`;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const loadInvite = async () => {
      setInviteLoading(true);
      try {
        const response = await fetch(
          `/.netlify/functions/get-workspace-invite?token=${encodeURIComponent(token)}`
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Invite not found");
        if (!cancelled) setInviteInfo(payload as InviteInfo);
      } catch (e: unknown) {
        if (!cancelled) setError(getErrorMessage(e, "Не вдалося знайти інвайт"));
      } finally {
        if (!cancelled) setInviteLoading(false);
      }
    };

    void loadInvite();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-[var(--radius-section)] border border-border bg-card shadow-surface p-8 text-center text-card-foreground animate-in fade-in zoom-in-95">
          <div className="mx-auto bg-danger-soft w-16 h-16 rounded-full flex items-center justify-center mb-6 text-danger-foreground border border-danger-soft-border">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-extrabold text-foreground">Невірне посилання</h2>
          <p className="text-muted-foreground mt-2">
            У посиланні відсутній токен запрошення. Спробуйте скопіювати його заново.
          </p>
          <Button onClick={() => nav("/")} variant="outline" className="mt-6 w-full">
            На головну
          </Button>
        </div>
      </div>
    );
  }

  const acceptInvite = async () => {
    setBusy(true);
    setError(null);
    try {
      if (password || passwordConfirm) {
        if (password.length < 8) {
          throw new Error("Пароль має бути мінімум 8 символів.");
        }
        if (password !== passwordConfirm) {
          throw new Error("Паролі не співпадають.");
        }
        const { error: passwordError } = await supabase.auth.updateUser({ password });
        if (passwordError) throw passwordError;
      }

      const { error } = await supabase
        .schema("tosho")
        .rpc("accept_workspace_invite", { p_token: token });
      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        nav("/orders/estimates");
      }, 1500);
    } catch (e: unknown) {
      console.error(e);
      let msg = "Не вдалося прийняти запрошення.";
      let rawMessage: string | undefined;
      if (e instanceof Error) {
        rawMessage = e.message;
      } else if (typeof e === "object" && e !== null) {
        const record = e as Record<string, unknown>;
        rawMessage =
          (typeof record.message === "string" && record.message) ||
          (typeof record.error_description === "string" && record.error_description) ||
          (typeof record.details === "string" && record.details) ||
          undefined;
      }
      if (rawMessage?.includes("expired")) msg = "Термін дії посилання минув.";
      if (rawMessage?.includes("already")) msg = "Ви вже є учасником цього workspace.";
      if (rawMessage && rawMessage !== msg) {
        msg = `${msg} (${rawMessage})`;
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-[var(--radius-section)] border border-border bg-card shadow-surface p-8 text-center text-card-foreground animate-in fade-in zoom-in-95 duration-300">
          <div className="mx-auto bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center mb-6 text-primary border border-primary/20">
            <User className="w-10 h-10" />
          </div>

          <h1 className="text-2xl font-extrabold text-foreground">Вас запросили у workspace!</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Щоб прийняти запрошення, увійдіть у свій обліковий запис або зареєструйтеся.
          </p>

          <div className="mt-6 bg-muted/50 rounded-[var(--radius-inner)] p-4 border border-border text-sm text-muted-foreground">
            Це запрошення буде прив’язано до вашого акаунту після входу.
          </div>

          <Button asChild className="mt-6 w-full">
            <Link to={linkToAuth}>
              Увійти або Створити акаунт <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const email = user?.email;
  const inviteEmail = inviteInfo?.email;
  const isInviteExpired = Boolean(inviteInfo?.expiresAt && new Date(inviteInfo.expiresAt) < new Date());
  const inviteAccepted = Boolean(inviteInfo?.acceptedAt);
  const emailMismatch = Boolean(inviteEmail && email && inviteEmail.toLowerCase() !== email.toLowerCase());

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-[var(--radius-section)] border border-border bg-card shadow-surface p-8 text-center text-card-foreground animate-in fade-in zoom-in-95 duration-300 relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
          className="absolute top-4 right-4 h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-danger-soft/40"
          title="Вийти з акаунту"
        >
          <LogOut className="w-3.5 h-3.5 mr-1" /> Це не я
        </Button>

        {success ? (
          <div className="flex flex-col items-center justify-center py-4">
            <div className="w-16 h-16 bg-success-soft text-success-foreground border border-success-soft-border rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Успішно!</h2>
            <p className="text-muted-foreground mt-1">Заходимо у workspace...</p>
          </div>
        ) : (
          <>
            {inviteLoading ? (
              <div className="text-sm text-muted-foreground">Завантаження інвайту...</div>
            ) : null}

            {inviteEmail ? (
              <div className="mb-4 text-xs text-muted-foreground">
                Запрошення для: <span className="font-semibold text-foreground">{inviteEmail}</span>
              </div>
            ) : null}

            <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4 text-primary font-bold text-xl border-4 border-background shadow-sm">
              {email?.slice(0, 2).toUpperCase()}
            </div>

            <h2 className="text-lg font-medium text-muted-foreground">Привіт, {email}</h2>
            <h1 className="text-2xl font-extrabold text-foreground mt-1">Прийняти запрошення?</h1>

            {emailMismatch ? (
              <div className="mt-4 p-3 rounded-[var(--radius-inner)] bg-danger-soft text-danger-foreground text-sm font-medium border border-danger-soft-border">
                Ви увійшли як {email}, але інвайт для {inviteEmail}. Увійдіть правильним email.
              </div>
            ) : null}

            {inviteAccepted ? (
              <div className="mt-4 p-3 rounded-[var(--radius-inner)] bg-muted/40 text-muted-foreground text-sm font-medium border border-border">
                Інвайт уже використано.
              </div>
            ) : null}

            {isInviteExpired ? (
              <div className="mt-4 p-3 rounded-[var(--radius-inner)] bg-danger-soft text-danger-foreground text-sm font-medium border border-danger-soft-border">
                Термін дії інвайту минув.
              </div>
            ) : null}

            <div className="mt-6 bg-muted/30 border border-border rounded-[var(--radius-inner)] p-4 text-left flex items-start gap-3">
              <div className="bg-background p-1.5 rounded-[var(--radius)] shadow-sm text-primary border border-border shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Доступ до workspace</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Ви отримаєте доступ до перегляду та редагування даних згідно з виданою роллю.
                </p>
              </div>
            </div>

            <div className="mt-4 text-left">
              <label className="text-xs font-semibold text-muted-foreground">Пароль</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Вигадайте пароль"
                wrapperClassName="mt-2"
              />
              <label className="mt-3 block text-xs font-semibold text-muted-foreground">Підтвердження пароля</label>
              <PasswordInput
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Повторіть пароль"
                wrapperClassName="mt-2"
              />
              <div className="mt-2 text-xs text-muted-foreground">
                Якщо ви вже маєте пароль, можете залишити поля порожніми.
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-[var(--radius-inner)] bg-danger-soft text-danger-foreground text-sm font-medium border border-danger-soft-border">
                {error}
              </div>
            )}

            <Button
              onClick={acceptInvite}
              disabled={busy || emailMismatch || inviteAccepted || isInviteExpired}
              className="mt-6 w-full"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Обробка...
                </>
              ) : (
                "Приєднатися до workspace"
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
