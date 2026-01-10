import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Clock, Copy, MapPin, Plus, Shield, Swords, Loader2 } from "lucide-react";

import { createTraining, getLastTrainingForTeam } from "../../api/trainings";
import type { Training } from "../../types/trainings";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CONTROL_BASE } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activityLogger";

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";

type TrainingType = "regular" | "tactics" | "fitness" | "sparring";

const typeOptions: Array<{ value: TrainingType; label: string; icon: React.ElementType }> = [
  { value: "regular", label: "Звичайне", icon: Shield },
  { value: "tactics", label: "Тактичне", icon: Shield },
  { value: "fitness", label: "Фізпідготовка", icon: Shield },
  { value: "sparring", label: "Спаринг", icon: Swords },
];

export function TrainingCreatePage() {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [type, setType] = useState<TrainingType>("regular");
  const [location, setLocation] = useState("");
  const [sparringOpponent, setSparringOpponent] = useState("");
  const [sparringLogo, setSparringLogo] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const navigate = useNavigate();
  const { state } = useLocation() as { state?: { prefillFromTraining?: Partial<Training> } };

  const isSparring = type === "sparring";

  const selectedType = useMemo(() => typeOptions.find((t) => t.value === type), [type]);

  useEffect(() => {
    const prefill = state?.prefillFromTraining;
    if (prefill) {
      if (prefill.time) setTime(prefill.time);
      if (prefill.type) setType(prefill.type as TrainingType);
      if (prefill.location) setLocation(prefill.location || "");
      if (prefill.sparring_opponent) setSparringOpponent(prefill.sparring_opponent || "");
      if (prefill.sparring_logo_url) setSparringLogo(prefill.sparring_logo_url || "");
      if (prefill.comment) setComment(prefill.comment || "");
      const baseDate = prefill.date ? new Date(prefill.date) : new Date();
      const nextDate = prefill.date
        ? new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000)
        : new Date();
      const iso = nextDate.toISOString().slice(0, 10);
      setDate(iso);
      setInfo("Форма заповнена на основі попереднього тренування");
    } else {
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [state]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!date || !time) {
      setError("Вкажіть дату та час");
      return;
    }
    try {
      setSaving(true);
      const created = await createTraining({
        team_id: TEAM_ID,
        date,
        time,
        type,
        sparring_opponent: isSparring ? sparringOpponent.trim() || null : null,
        sparring_logo_url: isSparring ? sparringLogo.trim() || null : null,
        location: location.trim() || null,
        comment: comment.trim() || undefined,
      });
      logActivity({
        teamId: TEAM_ID,
        action: "create_training",
        entityType: "trainings",
        entityId: created.id,
        title: `Створено тренування ${created.date} ${created.time || ""}`.trim(),
        href: `/admin/trainings/${created.id}`,
        metadata: {
          event_date: created.date,
          event_time: created.time || null,
        },
      });
      navigate("/admin/trainings");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Не вдалося створити тренування");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyLast() {
    setError(null);
    setInfo(null);
    setCopying(true);
    try {
      const last = await getLastTrainingForTeam(TEAM_ID);
      if (!last) {
        setInfo("Немає попередніх тренувань для копіювання.");
      } else {
        setTime(last.time);
        setType(last.type as TrainingType);
        setLocation(last.location || "");
        setSparringOpponent(last.sparring_opponent || "");
        setSparringLogo(last.sparring_logo_url || "");
        setComment(last.comment || "");
        setDate(new Date().toISOString().slice(0, 10));
        setInfo("Заповнено з останнього тренування");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Не вдалося отримати останнє тренування");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Нове тренування</h1>
          <p className="text-sm text-muted-foreground">
            Заповни деталі тренування, щоб команда бачила розклад і локацію.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleCopyLast} disabled={copying}>
            {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Скопіювати останнє
          </Button>
          <Button type="submit" form="training-create-form" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Створити тренування
          </Button>
        </div>
      </div>

      {info && (
        <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
          <AlertTitle>Готово</AlertTitle>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Помилка</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form id="training-create-form" onSubmit={handleSubmit} className="space-y-6">
        <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">Основна інформація</CardTitle>
            <p className="text-sm text-muted-foreground">Дата, час, тип та місце тренування.</p>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="training-date">Дата</Label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="training-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.currentTarget.value)}
                  className={cn(CONTROL_BASE, "pl-9")}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="training-time">Час</Label>
              <div className="relative">
                <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="training-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.currentTarget.value)}
                  className={cn(CONTROL_BASE, "pl-9")}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Тип тренування</Label>
              <Select value={type} onValueChange={(val) => setType(val as TrainingType)}>
                <SelectTrigger className={CONTROL_BASE}>
                  <SelectValue placeholder="Оберіть тип" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          {option.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedType && (
                <p className="text-xs text-muted-foreground">
                  Обрано: {selectedType.label}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="training-location">Місце проведення</Label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="training-location"
                  placeholder="Адреса або зал"
                  value={location}
                  onChange={(e) => setLocation(e.currentTarget.value)}
                  className={cn(CONTROL_BASE, "pl-9")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {isSparring && (
          <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg">Спаринг</CardTitle>
              <p className="text-sm text-muted-foreground">Додай суперника та логотип для афіші.</p>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sparring-opponent">Суперник</Label>
                <Input
                  id="sparring-opponent"
                  placeholder="Назва команди"
                  value={sparringOpponent}
                  onChange={(e) => setSparringOpponent(e.currentTarget.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sparring-logo">Логотип (URL)</Label>
                <Input
                  id="sparring-logo"
                  placeholder="https://..."
                  value={sparringLogo}
                  onChange={(e) => setSparringLogo(e.currentTarget.value)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">Коментар</CardTitle>
            <p className="text-sm text-muted-foreground">Нотатки для тренування, план або пояснення.</p>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Додаткові нотатки"
              value={comment}
              onChange={(e) => setComment(e.currentTarget.value)}
              className="min-h-[120px]"
            />
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
