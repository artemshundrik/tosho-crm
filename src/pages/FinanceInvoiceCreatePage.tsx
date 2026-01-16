import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, FilePlus2, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";
const CONTROL_BASE = "h-10 rounded-[var(--radius-md)] border border-input bg-background";

type FinanceInvoice = {
  status: "draft" | "sent" | "paid" | "overdue" | "canceled";
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

export function FinanceInvoiceCreatePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [teamPlayers, setTeamPlayers] = useState<PlayerLite[]>([]);
  const [form, setForm] = useState({
    title: "",
    amount: "",
    due_date: "",
    status: "sent" as FinanceInvoice["status"],
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
    if (!form.title || !form.amount) {
      toast.error("Заповни назву та суму");
      return;
    }
    setSaving(true);
    const payload = {
      team_id: TEAM_ID,
      player_id: form.player_id === "none" ? null : form.player_id,
      title: form.title,
      status: form.status,
      amount: toNumber(form.amount),
      currency: "UAH",
      due_date: form.due_date || null,
    };
    const { error } = await supabase.from("finance_invoices").insert(payload);
    if (error) {
      toast.error("Не вдалося створити рахунок");
      setSaving(false);
      return;
    }
    toast.success("Рахунок створено");
    navigate("/finance");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Новий рахунок</h1>
          <p className="text-sm text-muted-foreground">
            Створи рахунок для гравця або для всієї команди.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/finance")} disabled={saving}>
            Скасувати
          </Button>
          <Button type="submit" form="finance-invoice-form" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
            Створити
          </Button>
        </div>
      </div>

      <form id="finance-invoice-form" onSubmit={handleSubmit} className="space-y-6">
        <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Основна інформація</CardTitle>
            <p className="text-sm text-muted-foreground">Назва, сума та статус рахунку.</p>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Назва</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Наприклад, Абонемент на місяць"
                className={CONTROL_BASE}
                required
              />
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
                onValueChange={(val) => setForm((prev) => ({ ...prev, status: val as FinanceInvoice["status"] }))}
              >
                <SelectTrigger className={CONTROL_BASE}>
                  <SelectValue placeholder="Оберіть статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Чернетка</SelectItem>
                  <SelectItem value="sent">Надіслано</SelectItem>
                  <SelectItem value="paid">Оплачено</SelectItem>
                  <SelectItem value="overdue">Прострочено</SelectItem>
                  <SelectItem value="canceled">Скасовано</SelectItem>
                </SelectContent>
              </Select>
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
            <CardTitle className="text-base">Отримувач</CardTitle>
            <p className="text-sm text-muted-foreground">Привʼяжи рахунок до гравця, якщо потрібно.</p>
          </CardHeader>
          <CardContent className="grid gap-5">
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
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
