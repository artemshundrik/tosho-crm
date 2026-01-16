import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, FolderPlus, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";
const CONTROL_BASE = "h-10 rounded-[var(--radius-md)] border border-input bg-background";

type PlayerLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  status?: string | null;
};

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function FinancePoolCreatePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [teamPlayers, setTeamPlayers] = useState<PlayerLite[]>([]);
  const [form, setForm] = useState({
    title: "",
    total_amount: "",
    due_date: "",
    split: "equal" as "equal",
  });

  useEffect(() => {
    async function loadPlayers() {
      const { data, error } = await supabase
        .from("players")
        .select("id, first_name, last_name, status")
        .eq("team_id", TEAM_ID)
        .neq("status", "inactive")
        .order("last_name", { ascending: true });
      if (!error && data) {
        setTeamPlayers(data as PlayerLite[]);
      }
    }
    loadPlayers();
  }, []);

  const activeCount = teamPlayers.length;
  const perPlayer = useMemo(() => {
    if (!form.total_amount || activeCount === 0) return 0;
    return Math.round(toNumber(form.total_amount) / activeCount);
  }, [form.total_amount, activeCount]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.title || !form.total_amount) {
      toast.error("Заповни назву та суму");
      return;
    }
    if (teamPlayers.length === 0) {
      toast.error("Немає активних гравців для збору");
      return;
    }
    setSaving(true);
    const poolPayload = {
      team_id: TEAM_ID,
      title: form.title,
      total_amount: toNumber(form.total_amount),
      due_date: form.due_date || null,
      status: "active",
    };
    const { data: pool, error: poolError } = await supabase
      .from("finance_pools")
      .insert(poolPayload)
      .select("id")
      .single();
    if (poolError || !pool) {
      toast.error("Не вдалося створити збір");
      setSaving(false);
      return;
    }

    const expectedAmount = perPlayer || Math.round(toNumber(form.total_amount) / teamPlayers.length);
    const participants = teamPlayers.map((p) => ({
      pool_id: pool.id,
      player_id: p.id,
      expected_amount: expectedAmount,
      paid_amount: 0,
      status: "unpaid",
    }));
    const { error: participantsError } = await supabase
      .from("finance_pool_participants")
      .insert(participants);
    if (participantsError) {
      toast.error("Збір створено, але не вдалося додати учасників");
      setSaving(false);
      navigate(`/finance/pools/${pool.id}`);
      return;
    }

    toast.success("Збір створено");
    navigate(`/finance/pools/${pool.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Новий збір</h1>
          <p className="text-sm text-muted-foreground">
            Створи збір на оренду або внески і відстежуй оплату.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/finance")} disabled={saving}>
            Скасувати
          </Button>
          <Button type="submit" form="finance-pool-form" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
            Створити збір
          </Button>
        </div>
      </div>

      <form id="finance-pool-form" onSubmit={handleSubmit} className="space-y-6">
        <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Параметри збору</CardTitle>
            <p className="text-sm text-muted-foreground">Назва, сума та дедлайн.</p>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Назва</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Оренда зала Горай Арена, жовтень"
                className={CONTROL_BASE}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Сума збору</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.total_amount}
                onChange={(e) => setForm((prev) => ({ ...prev, total_amount: e.target.value }))}
                placeholder="0"
                className={CONTROL_BASE}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Кінцева дата</Label>
              <IconInput
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))}
                className={CONTROL_BASE}
                icon={CalendarDays}
                iconLabel="Вибрати дату"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Розподіл</CardTitle>
            <p className="text-sm text-muted-foreground">Як поділити суму між гравцями.</p>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Тип</Label>
              <Select value={form.split} onValueChange={(val) => setForm((prev) => ({ ...prev, split: val as "equal" }))}>
                <SelectTrigger className={CONTROL_BASE}>
                  <SelectValue placeholder="Оберіть тип" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equal">Порівну між усіма</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>На гравця (оцінка)</Label>
              <Input
                value={activeCount ? String(perPlayer) : "0"}
                readOnly
                className={CONTROL_BASE}
              />
            </div>
            <div className="text-xs text-muted-foreground md:col-span-2">
              Учасників: {activeCount}. Сума ділиться рівномірно.
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
