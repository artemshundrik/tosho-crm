import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Receipt } from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";
const CONTROL_BASE = "h-10 rounded-[var(--radius-md)] border border-input bg-background";

type FinanceTransaction = {
  type: "income" | "expense";
  status: "pending" | "paid" | "canceled" | "refunded";
};

type PlayerLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function FinanceTransactionCreatePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [teamPlayers, setTeamPlayers] = useState<PlayerLite[]>([]);
  const [form, setForm] = useState({
    type: "income" as FinanceTransaction["type"],
    amount: "",
    category: "",
    occurred_at: new Date().toISOString().slice(0, 10),
    status: "paid" as FinanceTransaction["status"],
    note: "",
    player_id: "none",
  });

  useEffect(() => {
    async function loadPlayers() {
      const { data, error } = await supabase
        .from("players")
        .select("id, first_name, last_name")
        .eq("team_id", TEAM_ID)
        .order("last_name", { ascending: true });
      if (!error && data) {
        setTeamPlayers(data as PlayerLite[]);
      }
    }
    loadPlayers();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.amount) {
      toast.error("Вкажи суму");
      return;
    }
    setSaving(true);
    const payload = {
      team_id: TEAM_ID,
      type: form.type,
      category: form.category || null,
      amount: toNumber(form.amount),
      currency: "UAH",
      status: form.status,
      occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : new Date().toISOString(),
      note: form.note || null,
      player_id: form.player_id === "none" ? null : form.player_id,
    };
    const { error } = await supabase.from("finance_transactions").insert(payload);
    if (error) {
      toast.error("Не вдалося додати платіж");
      setSaving(false);
      return;
    }
    toast.success("Платіж додано");
    navigate("/finance");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Новий платіж</h1>
          <p className="text-sm text-muted-foreground">
            Додай дохід або витрату та привʼяжи до гравця за потреби.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/finance")} disabled={saving}>
            Скасувати
          </Button>
          <Button type="submit" form="finance-transaction-form" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
            Зберегти
          </Button>
        </div>
      </div>

      <form id="finance-transaction-form" onSubmit={handleSubmit} className="space-y-6">
        <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Основне</CardTitle>
            <p className="text-sm text-muted-foreground">Тип, сума, статус та дата.</p>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Тип</Label>
              <Select
                value={form.type}
                onValueChange={(val) => setForm((prev) => ({ ...prev, type: val as FinanceTransaction["type"] }))}
              >
                <SelectTrigger className={CONTROL_BASE}>
                  <SelectValue placeholder="Оберіть тип" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Дохід</SelectItem>
                  <SelectItem value="expense">Витрата</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Сума</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="0"
                className={CONTROL_BASE}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Статус</Label>
              <Select
                value={form.status}
                onValueChange={(val) => setForm((prev) => ({ ...prev, status: val as FinanceTransaction["status"] }))}
              >
                <SelectTrigger className={CONTROL_BASE}>
                  <SelectValue placeholder="Оберіть статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Оплачено</SelectItem>
                  <SelectItem value="pending">Очікує</SelectItem>
                  <SelectItem value="canceled">Скасовано</SelectItem>
                  <SelectItem value="refunded">Повернено</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Дата</Label>
              <Input
                type="date"
                value={form.occurred_at}
                onChange={(e) => setForm((prev) => ({ ...prev, occurred_at: e.target.value }))}
                className={CONTROL_BASE}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Деталі</CardTitle>
            <p className="text-sm text-muted-foreground">Категорія, гравець та нотатка.</p>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Категорія</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="Оренда, екіпірування…"
                className={CONTROL_BASE}
              />
            </div>
            <div className="space-y-2">
              <Label>Гравець (опційно)</Label>
              <Select
                value={form.player_id}
                onValueChange={(val) => setForm((prev) => ({ ...prev, player_id: val }))}
              >
                <SelectTrigger className={CONTROL_BASE}>
                  <SelectValue placeholder="— Без гравця —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Без гравця —</SelectItem>
                  {teamPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Гравець"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Нотатка</Label>
              <Input
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Коментар"
                className={CONTROL_BASE}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
