import React, { useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup' | 'magic'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const title = useMemo(() => {
    if (mode === 'login') return 'Вхід (email + пароль)';
    if (mode === 'signup') return 'Реєстрація';
    return 'Вхід по magic link';
  }, [mode]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMsg('Успішно. Перенаправляю…');
      }

      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg('Акаунт створено. Якщо увімкнене підтвердження пошти — перевір email.');
      }

      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMsg('Відправив magic link на пошту. Відкрий лист і перейди за посиланням.');
      }
    } catch (err: any) {
      setMsg(err?.message ?? 'Помилка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-5">
          <div className="text-2xl font-semibold">FAYNA TEAM</div>
          <div className="text-sm text-gray-500 mt-1">{title}</div>
        </div>

        <div className="flex gap-2 mb-5">
          <button
            className={`px-3 py-2 rounded-lg border text-sm ${mode === 'login' ? 'bg-black text-white' : ''}`}
            onClick={() => setMode('login')}
            type="button"
          >
            Вхід
          </button>
          <button
            className={`px-3 py-2 rounded-lg border text-sm ${mode === 'signup' ? 'bg-black text-white' : ''}`}
            onClick={() => setMode('signup')}
            type="button"
          >
            Реєстрація
          </button>
          <button
            className={`px-3 py-2 rounded-lg border text-sm ${mode === 'magic' ? 'bg-black text-white' : ''}`}
            onClick={() => setMode('magic')}
            type="button"
          >
            Magic link
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <div className="text-sm font-medium mb-1">Email</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </label>

          {mode !== 'magic' && (
            <label className="block">
              <div className="text-sm font-medium mb-1">Пароль</div>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
              />
              <div className="text-xs text-gray-500 mt-1">Мінімум 6 символів.</div>
            </label>
          )}

          <button
            disabled={busy}
            className="w-full rounded-xl bg-black text-white py-2 font-medium disabled:opacity-60"
            type="submit"
          >
            {busy ? '...' : 'Продовжити'}
          </button>

          {msg && <div className="text-sm mt-2 text-gray-700">{msg}</div>}
        </form>
      </div>
    </div>
  );
}
