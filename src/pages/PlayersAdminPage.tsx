import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";

import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/icon-input";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { OperationalSummary } from "@/components/app/OperationalSummary";
import { AppDropdown } from "@/components/app/AppDropdown";

import {
  Users,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  CalendarDays,
  Shield,
  Cake,
  Shirt,
  UserRound,
  Loader2,
  Stethoscope,
  PlaneTakeoff,
  UserMinus,
  Check,
  Activity,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";

type PlayerStatus = "active" | "injured" | "sick" | "away" | "inactive";

type Player = {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  position: string | null;
  birthday?: string | null;
  photo_url?: string | null;
  status: PlayerStatus;
};

type FormState = {
  firstName: string;
  lastName: string;
  shirtNumber: string;
  position: string;
  birthday: string;
  photoUrl: string;
  status: PlayerStatus;
};

type SortMode = "number" | "age_young_first" | "age_old_first";

const statusOptions: { value: PlayerStatus; label: string; tone: string; icon: any }[] = [
  { value: "active", label: "Активний", tone: "bg-success-soft text-success-foreground border-success-soft-border", icon: Shield },
  { value: "injured", label: "Травма", tone: "bg-danger-soft text-danger-foreground border-danger-soft-border", icon: Stethoscope },
  { value: "sick", label: "Хворіє", tone: "bg-info-soft text-info-foreground border-info-soft-border", icon: Activity },
  { value: "away", label: "Поїхав", tone: "bg-neutral-soft text-neutral-foreground border-neutral-soft-border", icon: PlaneTakeoff },
  { value: "inactive", label: "Колишній", tone: "bg-muted text-muted-foreground border-border", icon: UserMinus },
];

function getAgeFromBirthday(birthday: string | null): number | null {
  if (!birthday) return null;
  const date = new Date(birthday);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  if (today.getMonth() < date.getMonth() || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())) age--;
  return age;
}

function formatBirthday(birthday: string | null): string {
  if (!birthday) return "—";
  const date = new Date(birthday);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function JerseyNumber({ number }: { number: number | null }) {
  if (number === null) return <span className="text-muted-foreground/20 text-lg font-bold">—</span>;
  return (
    <div className="relative flex items-center justify-center w-10 h-10 select-none">
       <Shirt className="absolute w-8 h-8 text-muted-foreground/10" strokeWidth={1.5} />
       <span className="relative text-[15px] font-black text-foreground/80 z-10">{number}</span>
    </div>
  );
}

function PlayerAvatar({ player, size = 44 }: { player: Player; size?: number }) {
  const initials = `${player.first_name?.[0] || ""}${player.last_name?.[0] || ""}`.toUpperCase();
  return (
    <div
      className="shrink-0 overflow-hidden rounded-full border border-border/50 bg-muted/40 shadow-sm"
      style={{ width: size, height: size }}
    >
      {player.photo_url ? (
        <img
          src={player.photo_url}
          alt="Avatar"
          className="h-full w-full object-cover object-top"
          style={{ transform: "scale(1.8)", objectPosition: "50% -90%" }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-muted-foreground uppercase">
          {initials}
        </div>
      )}
    </div>
  );
}

export function PlayersAdminPage() {
  const navigate = useNavigate();
  const { teamId } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("number");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ firstName: "", lastName: "", shirtNumber: "", position: "UNIV", birthday: "", photoUrl: "", status: "active" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (teamId) loadPlayers(); }, [teamId]);

  async function loadPlayers() {
    if (!teamId) return;
    setLoading(true);
    const { data, error } = await supabase.from("players").select("*").eq("team_id", teamId).order("shirt_number", { ascending: true });
    if (!error && data) setPlayers(data as Player[]);
    setLoading(false);
  }

  async function updatePlayerStatus(playerId: string, newStatus: PlayerStatus) {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, status: newStatus } : p));
    const { error } = await supabase.from("players").update({ status: newStatus }).eq("id", playerId);
    if (error) loadPlayers();
  }

  const openCreate = useCallback(() => {
    setForm({ firstName: "", lastName: "", shirtNumber: "", position: "UNIV", birthday: "", photoUrl: "", status: "active" });
    setMode("create");
    setEditingId(null);
    setIsSheetOpen(true);
  }, []);

  function openEdit(player: Player, e?: React.MouseEvent) {
    e?.stopPropagation();
    setForm({ firstName: player.first_name, lastName: player.last_name, shirtNumber: player.shirt_number !== null ? String(player.shirt_number) : "", position: player.position || "UNIV", birthday: player.birthday || "", photoUrl: player.photo_url || "", status: player.status || "active" });
    setMode("edit");
    setEditingId(player.id);
    setIsSheetOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !teamId) return;
    setSaving(true);
    const payload = { team_id: teamId, first_name: form.firstName.trim(), last_name: form.lastName.trim(), shirt_number: form.shirtNumber.trim() === "" ? null : Number(form.shirtNumber), position: form.position.trim() || null, birthday: form.birthday.trim() || null, photo_url: form.photoUrl.trim() || null, status: form.status };
    if (mode === "create") await supabase.from("players").insert(payload);
    else if (mode === "edit" && editingId) await supabase.from("players").update(payload).eq("id", editingId);
    setSaving(false);
    setIsSheetOpen(false);
    loadPlayers();
  }

  async function handleDelete(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm("Видалити гравця?")) return;
    await supabase.from("players").delete().eq("id", id);
    loadPlayers();
  }

  const stats = useMemo(() => {
    const total = players.length;
    const withAge = players.map(p => getAgeFromBirthday(p.birthday ?? null)).filter((a): a is number => a !== null);
    const avgAge = withAge.length ? (withAge.reduce((a, b) => a + b, 0) / withAge.length).toFixed(1) : "—";
    const activeGk = players.filter(p => p.position === 'GK' && p.status !== 'inactive').length;
    return { total, avgAge, gk: activeGk, univ: total - activeGk };
  }, [players]);

  const filteredPlayers = useMemo(() => {
    let res = [...players];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      res = res.filter(p => p.first_name.toLowerCase().includes(q) || p.last_name.toLowerCase().includes(q) || String(p.shirt_number).includes(q));
    }
    res.sort((a, b) => {
      if (sortMode === "number") return (a.shirt_number || 999) - (b.shirt_number || 999);
      const ageA = getAgeFromBirthday(a.birthday ?? null) ?? -1;
      const ageB = getAgeFromBirthday(b.birthday ?? null) ?? -1;
      return sortMode === "age_young_first" ? ageA - ageB : ageB - ageA;
    });
    return res;
  }, [players, searchQuery, sortMode]);

  const headerActions = useMemo(
    () => (
      <Button onClick={openCreate} variant="primary">
        Новий гравець
      </Button>
    ),
    [openCreate]
  );

  usePageHeaderActions(headerActions, [openCreate]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-20">
      <OperationalSummary
        title="Склад команди"
        subtitle="Керування гравцями та статусами доступності."
        titleVariant="hidden"
        sectionLabel="Склад команди"
        sectionIcon={UserRound}
        hideNextUp
        kpis={[
            { key: "total", label: "Всього гравців", value: String(stats.total), icon: Users, iconTone: "bg-blue-500/10 text-blue-600" },
            { key: "age", label: "Середній вік", value: stats.avgAge, unit: "років", icon: Cake, iconTone: "bg-emerald-500/10 text-emerald-600" },
            { key: "gk", label: "Воротарі", value: String(stats.gk), icon: Shield, iconTone: "bg-amber-500/10 text-amber-600" },
            { key: "univ", label: "Універсали", value: String(stats.univ), icon: Shirt, iconTone: "bg-slate-500/10 text-slate-600" },
        ]}
      />

      <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none overflow-hidden">
        <div className="flex flex-col gap-4 p-5 border-b border-border bg-muted/5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 pl-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-primary/10 text-primary"><Users className="h-4 w-4" /></div>
            <div>
              <div className="text-sm font-semibold text-foreground">Список гравців</div>
              <div className="text-[11px] text-muted-foreground">Усього: {filteredPlayers.length} осіб</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pr-2">
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                <SelectTrigger className="w-full md:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">За номером (0-99)</SelectItem>
                  <SelectItem value="age_young_first">Спочатку молоді</SelectItem>
                  <SelectItem value="age_old_first">Спочатку досвідчені</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-full md:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                  placeholder="Знайти гравця..."
                />
              </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
             <div className="p-8 space-y-4">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-[var(--radius-inner)]" />)}</div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/20">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-[80px] text-center pl-6 uppercase text-[10px] font-bold tracking-wider">№</TableHead>
                  <TableHead className="w-[260px] uppercase text-[10px] font-bold tracking-wider">Гравець</TableHead>
                  <TableHead className="w-[180px] text-center uppercase text-[10px] font-bold tracking-wider">Статус</TableHead>
                  <TableHead className="w-[140px] text-center uppercase text-[10px] font-bold tracking-wider">Амплуа</TableHead>
                  <TableHead className="w-[80px] text-center uppercase text-[10px] font-bold tracking-wider">Вік</TableHead>
                  <TableHead className="w-[64px] pr-6"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayers.map((player) => {
                  const currentStatus = statusOptions.find(s => s.value === player.status) || statusOptions[0];
                  return (
                    <TableRow 
                      key={player.id} 
                      onClick={() => navigate(`/player/${player.id}`)}
                      className={cn(
                        "group transition-colors border-border/40 h-[72px] cursor-pointer",
                        "hover:bg-muted/30",
                        player.status === 'inactive' && "opacity-50 grayscale"
                      )}
                    >
                      <TableCell className="text-center pl-6"><JerseyNumber number={player.shirt_number} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <PlayerAvatar player={player} />
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-foreground text-[15px] leading-tight truncate">{player.first_name} {player.last_name}</span>
                            <span className="text-[11px] text-muted-foreground mt-0.5">{formatBirthday(player.birthday || null)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <AppDropdown
                          align="center"
                          contentClassName="w-48 shadow-floating border-border/50"
                          trigger={
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 group/status"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Badge variant="outline" className={cn(
                                "h-7 px-2.5 py-0 rounded-[var(--radius-md)] cursor-pointer transition-all flex items-center justify-between gap-2 border shadow-sm", 
                                "hover:brightness-95 active:scale-95",
                                currentStatus.tone
                              )}>
                                <div className="flex items-center gap-1.5">
                                  {React.createElement(currentStatus.icon, { className: "h-3.5 w-3.5" })}
                                  <span className="text-[11px] font-bold">{currentStatus.label}</span>
                                </div>
                                <ChevronDown className="h-3 w-3 opacity-40 group-hover/status:opacity-100 transition-opacity" />
                              </Badge>
                            </Button>
                          }
                          items={[
                            { type: "label", label: <span className="text-[10px] uppercase tracking-wider">Оновити статус</span> },
                            { type: "separator" },
                            ...statusOptions.map((opt) => ({
                              key: opt.value,
                              onSelect: () => updatePlayerStatus(player.id, opt.value),
                              className: "py-2.5",
                              label: (
                                <div className="flex items-center gap-2.5 w-full">
                                  <opt.icon className={cn("h-4 w-4", opt.tone.split(" ")[1])} />
                                  <span className={cn("text-xs font-medium", player.status === opt.value ? "text-primary font-bold" : "text-foreground/80")}>
                                    {opt.label}
                                  </span>
                                  {player.status === opt.value ? (
                                    <Check className="ml-auto h-3.5 w-3.5 text-primary" strokeWidth={3} />
                                  ) : null}
                                </div>
                              ),
                            })),
                          ]}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="h-7 px-3 rounded-[var(--radius-md)] bg-muted/30 border-border/60 font-medium text-xs">
                          {player.position === 'GK' ? "Воротар" : "Універсал"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm font-medium tabular-nums text-muted-foreground">
                        {getAgeFromBirthday(player.birthday || null) || "—"} р.
                      </TableCell>
                      <TableCell className="pr-6">
                        <AppDropdown
                          align="end"
                          contentClassName="shadow-floating border-border/50"
                          trigger={
                            <Button
                              variant="control"
                              size="iconXs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          }
                          items={[
                            {
                              label: (
                                <>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Редагувати
                                </>
                              ),
                              onSelect: () => openEdit(player),
                              className: "rounded-[var(--radius-md)]",
                            },
                            { type: "separator" },
                            {
                              label: (
                                <>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Видалити
                                </>
                              ),
                              onSelect: () => handleDelete(player.id),
                              destructive: true,
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full max-w-xl border-border bg-card/95 p-0 sm:max-w-xl">
          <div className="flex h-full flex-col">
            <div className="border-b border-border bg-card/70 px-6 py-4">
              <SheetHeader>
                <SheetTitle>
                  {mode === "create" ? "Новий гравець" : "Редагування профілю"}
                </SheetTitle>
                <SheetDescription>
                  Налаштуйте основну інформацію та статус доступності гравця.
                </SheetDescription>
              </SheetHeader>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
              <div className="flex-1 space-y-6 overflow-auto px-6 py-4">
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-xs text-muted-foreground">
                      Ім'я <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="firstName"
                      required
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      placeholder="Іван"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-xs text-muted-foreground">
                      Прізвище <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="lastName"
                      required
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      placeholder="Коваленко"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Статус доступності</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as PlayerStatus })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <opt.icon className="h-3.5 w-3.5" />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Separator className="opacity-50" />
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="shirtNumber" className="text-xs text-muted-foreground">
                      Ігровий номер
                    </Label>
                    <Input
                      id="shirtNumber"
                      type="number"
                      value={form.shirtNumber}
                      onChange={(e) => setForm({ ...form, shirtNumber: e.target.value })}
                      placeholder="10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Амплуа</Label>
                    <Select value={form.position || "UNIV"} onValueChange={(v) => setForm({ ...form, position: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNIV">
                          Універсал
                        </SelectItem>
                        <SelectItem value="GK">
                          Воротар
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="birthday" className="text-xs text-muted-foreground">
                    Дата народження
                  </Label>
                  <IconInput
                    id="birthday"
                    type="date"
                    value={form.birthday}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                    icon={CalendarDays}
                    iconLabel="Вибрати дату"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="photoUrl" className="text-xs text-muted-foreground">
                    URL Фото
                  </Label>
                  <Input
                    id="photoUrl"
                    value={form.photoUrl}
                    onChange={(e) => setForm({ ...form, photoUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>
              <SheetFooter className="border-t border-border bg-card/70 px-6 py-4">
                <Button variant="ghost" type="button" onClick={() => setIsSheetOpen(false)} disabled={saving}>
                  Скасувати
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Зберегти"}
                </Button>
              </SheetFooter>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
