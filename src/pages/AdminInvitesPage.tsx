import React, { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTROL_BASE } from "@/components/ui/controlStyles";

export default function AdminInvitesPage() {
  const { permissions } = useAuth();
  const [inviteRole, setInviteRole] = useState<"manager" | "viewer">("viewer");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canManage = useMemo(() => permissions.canManageMembers, [permissions.canManageMembers]);

  const inviteLink = useMemo(() => {
    if (!code) return null;
    return `${window.location.origin}/invite?code=${code}`;
  }, [code]);

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setCode(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_team_invite", {
        p_role: inviteRole,
        p_email: email.trim() ? email.trim() : null,
      });
      if (error) throw error;
      setCode(data as string);
    } catch (e: any) {
      setErr(e?.message ?? "Не вдалося створити інвайт");
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <div className="p-6">
        <div className="text-lg font-semibold text-foreground">Інвайти</div>
        <div className="text-sm text-muted-foreground mt-2">Недостатньо прав.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="text-2xl font-semibold text-foreground">Інвайти</div>
      <div className="text-sm text-muted-foreground mt-1">Створи посилання і скинь людині.</div>

      <form onSubmit={createInvite} className="mt-6 rounded-[var(--radius-section)] border border-border bg-card p-5 space-y-4">
        <div>
          <Label className="text-sm font-medium mb-1">Роль</Label>
          <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "manager" | "viewer")}>
            <SelectTrigger className={CONTROL_BASE}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">viewer (read-only)</SelectItem>
              <SelectItem value="manager">manager (може редагувати/видаляти)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm font-medium mb-1">Email (опційно)</Label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="можна лишити пустим"
          />
          <div className="text-xs text-muted-foreground mt-1">
            Якщо вкажеш email — інвайт зможе прийняти лише цей email.
          </div>
        </div>

        <Button disabled={busy} className="w-fit">
          {busy ? "..." : "Створити інвайт"}
        </Button>

        {err && <div className="text-sm text-destructive">{err}</div>}

        {inviteLink && (
          <div className="mt-2 rounded-[var(--radius-inner)] border border-border p-3">
            <div className="text-sm font-medium text-foreground">Готово</div>
            <div className="text-xs text-muted-foreground mt-1">Скопіюй і відправ:</div>
            <div className="mt-2 font-mono text-xs break-all">{inviteLink}</div>
          </div>
        )}
      </form>
    </div>
  );
}
