import React, { useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../auth/AuthProvider';

export default function AdminInvitesPage() {
  const { role } = useAuth();
  const [inviteRole, setInviteRole] = useState<'manager' | 'viewer'>('viewer');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canManage = useMemo(() => role === 'super_admin' || role === 'manager', [role]);

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
      const { data, error } = await supabase.rpc('create_team_invite', {
        p_role: inviteRole,
        p_email: email.trim() ? email.trim() : null,
      });
      if (error) throw error;
      setCode(data as string);
    } catch (e: any) {
      setErr(e?.message ?? 'Не вдалося створити інвайт');
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <div className="p-6">
        <div className="text-lg font-semibold">Інвайти</div>
        <div className="text-sm text-gray-600 mt-2">Недостатньо прав.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="text-2xl font-semibold">Інвайти</div>
      <div className="text-sm text-gray-600 mt-1">Створи посилання і скинь людині.</div>

      <form onSubmit={createInvite} className="mt-6 rounded-2xl border bg-white p-5 space-y-4">
        <div>
          <div className="text-sm font-medium mb-1">Роль</div>
          <select
            className="w-full rounded-xl border px-3 py-2"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'manager' | 'viewer')}
          >
            <option value="viewer">viewer (read-only)</option>
            <option value="manager">manager (може редагувати/видаляти)</option>
          </select>
        </div>

        <div>
          <div className="text-sm font-medium mb-1">Email (опційно)</div>
          <input
            className="w-full rounded-xl border px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="можна лишити пустим"
          />
          <div className="text-xs text-gray-500 mt-1">
            Якщо вкажеш email — інвайт зможе прийняти лише цей email.
          </div>
        </div>

        <button
          disabled={busy}
          className="rounded-xl bg-black text-white px-4 py-2 font-medium disabled:opacity-60"
        >
          {busy ? '...' : 'Створити інвайт'}
        </button>

        {err && <div className="text-sm text-red-600">{err}</div>}

        {inviteLink && (
          <div className="mt-2 rounded-xl border p-3">
            <div className="text-sm font-medium">Готово</div>
            <div className="text-xs text-gray-500 mt-1">Скопіюй і відправ:</div>
            <div className="mt-2 font-mono text-xs break-all">{inviteLink}</div>
          </div>
        )}
      </form>
    </div>
  );
}
