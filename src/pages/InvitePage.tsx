import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../auth/AuthProvider';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

type InviteRow = {
  team_id: string;
  code: string;
  email: string | null;
  role: 'manager' | 'viewer';
  used_at: string | null;
  expires_at: string;
};

export default function InvitePage() {
  const { session, refreshTeamContext } = useAuth();
  const [params] = useSearchParams();
  const code = params.get('code') ?? '';
  const nav = useNavigate();

  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const linkToAuth = useMemo(() => `/auth?next=${encodeURIComponent(`/invite?code=${code}`)}`, [code]);

  useEffect(() => {
    setErr(null);
    setInvite(null);

    (async () => {
      if (!code) {
        setErr('Немає коду інвайту.');
        return;
      }

      // We can read invite only if user is logged in (RLS: team members only),
      // BUT for first join user is not a member yet.
      // So we DON'T rely on selecting invite row. We'll just try accept RPC and show nice errors.
    })();
  }, [code]);

  const accept = async () => {
    setErr(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('accept_team_invite', { p_code: code });
      if (error) throw error;

      await refreshTeamContext();

      // data is table(team_id, role)
      console.log('accepted', data);

      nav('/');
    } catch (e: any) {
      setErr(e?.message ?? 'Не вдалося прийняти інвайт');
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border bg-white p-6">
          <div className="text-xl font-semibold">Запрошення в команду</div>
          <div className="text-sm text-gray-600 mt-2">
            Щоб прийняти інвайт, треба увійти.
          </div>
          <Link className="inline-block mt-4 px-4 py-2 rounded-xl bg-black text-white" to={linkToAuth}>
            Увійти
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-xl font-semibold">Прийняти запрошення</div>
        <div className="text-sm text-gray-600 mt-2">
          Код: <span className="font-mono">{code}</span>
        </div>

        <button
          disabled={busy || !code}
          onClick={accept}
          className="w-full mt-5 rounded-xl bg-black text-white py-2 font-medium disabled:opacity-60"
        >
          {busy ? '...' : 'Прийняти та зайти в систему'}
        </button>

        {err && <div className="text-sm mt-3 text-red-600">{err}</div>}
        {invite && (
          <div className="text-xs mt-3 text-gray-500">
            Team: {invite.team_id}, role: {invite.role}
          </div>
        )}
      </div>
    </div>
  );
}
