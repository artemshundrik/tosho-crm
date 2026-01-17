import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { usePageCache } from "@/hooks/usePageCache";

import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";

type FinancePool = {
  id: string;
  title: string;
  total_amount: number | string;
  due_date: string | null;
  status: string;
  created_at: string;
};

type ParticipantRow = {
  id: string;
  pool_id: string;
  player_id: string;
  expected_amount: number | string;
  paid_amount: number | string | null;
  status: string;
  players?: {
    first_name: string | null;
    last_name: string | null;
  } | null;
};

type FinancePoolDetailsCache = {
  pool: FinancePool | null;
  participants: ParticipantRow[];
};

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(amount: number, currency = "UAH") {
  try {
    return new Intl.NumberFormat("uk-UA", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function FinancePoolDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cacheKey = id ? `finance-pool:${id}` : "finance-pool:unknown";
  const { cached, setCache } = usePageCache<FinancePoolDetailsCache>(cacheKey);
  const hasCacheRef = useRef(Boolean(cached));

  const [loading, setLoading] = useState(!cached);
  const [pool, setPool] = useState<FinancePool | null>(cached?.pool ?? null);
  const [participants, setParticipants] = useState<ParticipantRow[]>(cached?.participants ?? []);
  const [payInputs, setPayInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      if (!id) return;
      if (!hasCacheRef.current) {
        setLoading(true);
      }
      const [poolRes, participantsRes] = await Promise.all([
        supabase
          .from("finance_pools")
          .select("id, title, total_amount, due_date, status, created_at")
          .eq("id", id)
          .eq("team_id", TEAM_ID)
          .single(),
        supabase
          .from("finance_pool_participants")
          .select("id, pool_id, player_id, expected_amount, paid_amount, status, players(first_name,last_name)")
          .eq("pool_id", id),
      ]);

      if (poolRes.error) {
        toast.error("Не вдалося завантажити збір");
      } else {
        setPool(poolRes.data as FinancePool);
      }
      const normalized = !participantsRes.error && participantsRes.data
        ? ((participantsRes.data as any[]).map((row) => ({
            ...row,
            players: Array.isArray(row.players) ? row.players[0] ?? null : row.players ?? null,
          })) as ParticipantRow[])
        : [];
      setParticipants(normalized);
      setCache({
        pool: poolRes.error ? null : (poolRes.data as FinancePool),
        participants: normalized,
      });
      hasCacheRef.current = true;
      setLoading(false);
    }
    load();
  }, [id]);

  const totals = useMemo(() => {
    const expected = participants.reduce((sum, p) => sum + toNumber(p.expected_amount), 0);
    const paid = participants.reduce((sum, p) => sum + toNumber(p.paid_amount), 0);
    return {
      expected,
      paid,
      remaining: Math.max(expected - paid, 0),
      percent: expected ? Math.round((paid / expected) * 100) : 0,
    };
  }, [participants]);

  const handleAddPayment = async (participant: ParticipantRow) => {
    const raw = payInputs[participant.id];
    const amount = toNumber(raw);
    if (!amount) {
      toast.error("Вкажи суму");
      return;
    }
    const currentPaid = toNumber(participant.paid_amount);
    const nextPaid = currentPaid + amount;
    const expected = toNumber(participant.expected_amount);
    const nextStatus = nextPaid >= expected ? "paid" : "partial";

    const { error } = await supabase
      .from("finance_pool_participants")
      .update({ paid_amount: nextPaid, status: nextStatus })
      .eq("id", participant.id);
    if (error) {
      toast.error("Не вдалося зберегти платіж");
      return;
    }
    setParticipants((prev) =>
      prev.map((p) => (p.id === participant.id ? { ...p, paid_amount: nextPaid, status: nextStatus } : p))
    );
    setPayInputs((prev) => ({ ...prev, [participant.id]: "" }));
    toast.success("Платіж зараховано");
  };

  if (loading) {
    return <PageSkeleton />;
  }

  if (!pool) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">Збір не знайдено.</div>
        <Button variant="outline" onClick={() => navigate("/finance")}>
          Назад до фінансів
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{pool.title}</h1>
          <div className="text-sm text-muted-foreground">
            {pool.due_date ? `До ${formatDate(pool.due_date)}` : "Без дедлайну"}
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate("/finance")}>
          Назад
        </Button>
      </div>

      <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Прогрес збору</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Сплачено {formatCurrency(totals.paid)} із {formatCurrency(totals.expected)} • залишилось{" "}
            {formatCurrency(totals.remaining)}
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${totals.percent}%` }} />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Хто оплатив</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left py-2">Гравець</th>
                <th className="text-right py-2">Потрібно</th>
                <th className="text-right py-2">Сплачено</th>
                <th className="text-right py-2">Залишок</th>
                <th className="text-right py-2">Дія</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => {
                const expected = toNumber(p.expected_amount);
                const paid = toNumber(p.paid_amount);
                const remaining = Math.max(expected - paid, 0);
                const name = `${p.players?.first_name ?? ""} ${p.players?.last_name ?? ""}`.trim() || "Гравець";
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-3 text-foreground font-medium">{name}</td>
                    <td className="py-3 text-right text-muted-foreground tabular-nums">
                      {formatCurrency(expected)}
                    </td>
                    <td className="py-3 text-right tabular-nums">{formatCurrency(paid)}</td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(remaining)}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Input
                          type="number"
                          inputMode="decimal"
                          placeholder="Сума"
                          className="h-9 w-24"
                          value={payInputs[p.id] ?? ""}
                          onChange={(e) =>
                            setPayInputs((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                        />
                        <Button size="sm" onClick={() => handleAddPayment(p)}>
                          Зарахувати
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
