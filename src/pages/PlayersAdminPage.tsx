import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider"; // 1. Імпортуємо хук

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Icons
import {
  Users,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Shield,
  Cake,
  Shirt,
  Plus,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

// --- Types ---
type Player = {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  position: string | null;
  birthday?: string | null;
  photo_url?: string | null;
};

type FormState = {
  firstName: string;
  lastName: string;
  shirtNumber: string;
  position: string;
  birthday: string;
  photoUrl: string;
};

type SortMode = "number" | "age_young_first" | "age_old_first";

// --- Helpers ---
const INPUT_CLASS = cn(
  "bg-background border-input text-foreground placeholder:text-muted-foreground",
  "focus-visible:ring-primary/30",
  "dark:[color-scheme:dark]" 
);

function getAgeFromBirthday(birthday: string | null): number | null {
  if (!birthday) return null;
  const date = new Date(birthday);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  if (
    today.getMonth() < date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())
  ) {
    age--;
  }
  return age;
}

function formatBirthday(birthday: string | null): string {
  if (!birthday) return "—";
  const date = new Date(birthday);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function JerseyNumber({ number }: { number: number | null }) {
  if (number === null) return <span className="text-muted-foreground/20 text-xl font-bold">—</span>;
  
  return (
    <div className="relative flex items-center justify-center w-10 h-10 select-none">
       <Shirt className="absolute w-10 h-10 text-muted-foreground/5 dark:text-white/5" strokeWidth={1} />
       <span className="relative text-lg font-black tracking-tight text-foreground/80 z-10 font-mono">
        {number}
      </span>
    </div>
  );
}

function PlayerAvatar({ player, size = 48 }: { player: Player; size?: number }) {
  const initials = `${player.first_name?.[0] || ""}${player.last_name?.[0] || ""}`.toUpperCase();
  const hasPhoto = Boolean(player.photo_url);

  return (
    <div
      className="shrink-0 overflow-hidden rounded-full border border-border/50 bg-muted/50 shadow-sm"
      style={{ width: size, height: size }}
    >
      {hasPhoto ? (
        <img
          src={player.photo_url as string}
          alt="Avatar"
          className="h-full w-full object-cover object-[50%_-100%] scale-180"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
          <span className="text-base font-semibold tracking-tight">{initials || "•"}</span>
        </div>
      )}
    </div>
  );
}

export function PlayersAdminPage() {
  const navigate = useNavigate();
  // 2. Отримуємо реальний teamId з контексту
  const { teamId } = useAuth();

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("number");

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [form, setForm] = useState<FormState>({
    firstName: "",
    lastName: "",
    shirtNumber: "",
    position: "UNIV",
    birthday: "",
    photoUrl: "",
  });
  const [saving, setSaving] = useState(false);

  // Огортаємо в useCallback або просто слідкуємо за teamId
  useEffect(() => {
    if (teamId) {
      loadPlayers();
    }
  }, [teamId]);

  async function loadPlayers() {
    if (!teamId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("team_id", teamId) // Використовуємо динамічний ID
      .order("shirt_number", { ascending: true });

    if (!error && data) {
      setPlayers(data as Player[]);
    }
    setLoading(false);
  }

  function openCreate() {
    setForm({ firstName: "", lastName: "", shirtNumber: "", position: "UNIV", birthday: "", photoUrl: "" });
    setMode("create");
    setEditingId(null);
    setIsSheetOpen(true);
  }

  function openEdit(player: Player, e: React.MouseEvent) {
    e.stopPropagation();
    setForm({
      firstName: player.first_name,
      lastName: player.last_name,
      shirtNumber: player.shirt_number !== null ? String(player.shirt_number) : "",
      position: player.position || "UNIV",
      birthday: player.birthday || "",
      photoUrl: player.photo_url || "",
    });
    setMode("edit");
    setEditingId(player.id);
    setIsSheetOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    if (!teamId) return;

    setSaving(true);
    const payload = {
      team_id: teamId, // Динамічний ID
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      shirt_number: form.shirtNumber.trim() === "" ? null : Number(form.shirtNumber),
      position: form.position.trim() || null,
      birthday: form.birthday.trim() || null,
      photo_url: form.photoUrl.trim() || null,
    };

    if (mode === "create") await supabase.from("players").insert(payload);
    else if (mode === "edit" && editingId) await supabase.from("players").update(payload).eq("id", editingId);

    setSaving(false);
    setIsSheetOpen(false);
    loadPlayers();
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Видалити гравця?")) return;
    await supabase.from("players").delete().eq("id", id);
    loadPlayers();
  }

  const stats = useMemo(() => {
    const total = players.length;
    const withAge = players.map(p => getAgeFromBirthday(p.birthday ?? null)).filter((a): a is number => a !== null);
    const avgAge = withAge.length ? (withAge.reduce((a, b) => a + b, 0) / withAge.length).toFixed(1) : "—";
    const gk = players.filter(p => p.position === 'GK').length;
    return { total, avgAge, gk, univ: total - gk };
  }, [players]);

  const playerKpis = useMemo(
    () => [
      {
        key: "total",
        label: "Всього гравців",
        value: String(stats.total),
        icon: Users,
        iconTone: "bg-blue-500/10 text-blue-600",
      },
      {
        key: "age",
        label: "Середній вік",
        value: stats.avgAge,
        unit: "років",
        icon: Cake,
        iconTone: "bg-emerald-500/10 text-emerald-600",
      },
      {
        key: "gk",
        label: "Воротарі",
        value: String(stats.gk),
        icon: Shield,
        iconTone: "bg-amber-500/10 text-amber-600",
      },
      {
        key: "univ",
        label: "Універсали",
        value: String(stats.univ),
        icon: Shirt,
        iconTone: "bg-slate-500/10 text-slate-600",
      },
    ],
    [stats]
  );

  const filteredPlayers = useMemo(() => {
    let res = [...players];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      res = res.filter(p => 
        p.first_name.toLowerCase().includes(q) || 
        p.last_name.toLowerCase().includes(q) || 
        String(p.shirt_number).includes(q)
      );
    }
    res.sort((a, b) => {
      if (sortMode === "number") return (a.shirt_number || 999) - (b.shirt_number || 999);
      const ageA = getAgeFromBirthday(a.birthday ?? null) ?? -1;
      const ageB = getAgeFromBirthday(b.birthday ?? null) ?? -1;
      return sortMode === "age_young_first" ? ageA - ageB : ageB - ageA;
    });
    return res;
  }, [players, searchQuery, sortMode]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-20">
      
      <OperationalSummary
        title="Склад команди"
        subtitle="Склад і базові метрики по гравцях."
        hideNextUp
        primaryAction={{
          label: "Новий гравець",
          onClick: openCreate,
          iconLeft: Plus,
          variant: "default", // 3. Виправлено з "primary" на "default"
        }}
        kpis={playerKpis}
      />

      {/* TABLE SECTION */}
      <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none overflow-hidden">
        
        {/* Toolbar */}
        <div className="flex flex-col gap-4 p-5 border-b border-border bg-muted/5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Склад команди</div>
              <div className="text-xs text-muted-foreground">Пошук, сортування та швидкі дії</div>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-end gap-3 md:w-auto">
            <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                <SelectTrigger className="w-full md:w-64 bg-background border-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">За номером (0-99)</SelectItem>
                  <SelectItem value="age_young_first">Спочатку молоді</SelectItem>
                  <SelectItem value="age_old_first">Спочатку досвідчені</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={cn(INPUT_CLASS, "pl-10")}
                  placeholder="Знайти гравця..."
                />
              </div>
            </div>

          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          {loading ? (
             <div className="p-8 space-y-4">
                {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
             </div>
          ) : filteredPlayers.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50">
                <Users className="h-12 w-12 mb-4 opacity-20" />
                <p className="font-medium text-foreground">Гравців не знайдено</p>
             </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-[80px] text-center">№</TableHead>
                  <TableHead className="w-[300px]">Гравець</TableHead>
                  <TableHead>Амплуа</TableHead>
                  <TableHead>Вік</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayers.map((player) => {
                  const age = getAgeFromBirthday(player.birthday ?? null);
                  const isGK = player.position === 'GK';

                  return (
                    <TableRow 
                        key={player.id} 
                        className="group cursor-pointer hover:bg-muted/40 transition-colors h-[72px] border-border/50"
                        onClick={() => navigate(`/player/${player.id}`)}
                    >
                      <TableCell className="text-center p-0">
                         <div className="flex items-center justify-center h-full">
                            <JerseyNumber number={player.shirt_number} />
                         </div>
                      </TableCell>
                      
                      <TableCell>
                         <div className="flex items-center gap-4">
                            <PlayerAvatar player={player} />
                            <div className="flex flex-col">
                                <span className="font-bold text-foreground text-[15px] leading-tight group-hover:text-primary transition-colors">
                                    {player.first_name} {player.last_name}
                                </span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                   <Cake className="h-3 w-3 text-muted-foreground/60" />
                                   <span className="text-xs text-muted-foreground font-medium">
                                      {player.birthday ? formatBirthday(player.birthday) : "—"}
                                   </span>
                                </div>
                            </div>
                         </div>
                      </TableCell>

                      <TableCell>
                         <Badge 
                            variant="outline"
                            className={cn(
                               "px-2.5 py-1 text-xs font-semibold rounded-md border",
                               isGK 
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20" 
                                : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 hover:bg-slate-500/20"
                            )}
                         >
                            {isGK ? "Воротар" : "Універсал"}
                         </Badge>
                      </TableCell>

                      <TableCell>
                         {age !== null ? (
                            <div className="font-mono font-medium text-sm text-foreground/80">
                               {age} <span className="text-muted-foreground text-xs ml-0.5 font-sans">років</span>
                            </div>
                         ) : (
                            <span className="text-muted-foreground/30">—</span>
                         )}
                      </TableCell>

                      <TableCell className="text-right pr-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-muted-foreground opacity-50 group-hover:opacity-100 hover:text-foreground"
                                onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40 rounded-lg">
                            <DropdownMenuLabel>Дії</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => openEdit(player, e)}>
                              <Edit className="mr-2 h-4 w-4" /> Редагувати
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => handleDelete(player.id, e)} className="text-red-600 focus:text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" /> Видалити
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      {/* Sheet Form */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0 gap-0 border-l border-border bg-background text-foreground"> 
             <div className="px-6 py-6 border-b border-border bg-muted/5">
                <SheetTitle className="text-xl font-bold text-foreground">
                    {mode === 'create' ? "Новий гравець" : "Редагування профілю"}
                </SheetTitle>
                <SheetDescription className="mt-1 text-muted-foreground">
                    Основна інформація про гравця.
                </SheetDescription>
             </div>
            
            <form onSubmit={handleSubmit} className="flex flex-col flex-1">
                <div className="p-6 space-y-6 flex-1">
                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <Label htmlFor="firstName" className="text-foreground">Ім'я <span className="text-red-500">*</span></Label>
                            <Input 
                                id="firstName" 
                                className={INPUT_CLASS} 
                                required 
                                value={form.firstName} 
                                onChange={e => setForm({...form, firstName: e.target.value})} 
                                placeholder="Іван" 
                            />
                        </div>
                        <div className="space-y-2">
                             <Label htmlFor="lastName" className="text-foreground">Прізвище <span className="text-red-500">*</span></Label>
                             <Input 
                                id="lastName" 
                                className={INPUT_CLASS} 
                                required 
                                value={form.lastName} 
                                onChange={e => setForm({...form, lastName: e.target.value})} 
                                placeholder="Коваленко" 
                             />
                        </div>
                    </div>

                    <Separator className="bg-border" />

                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <Label htmlFor="shirtNumber" className="text-foreground">Ігровий номер</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">#</span>
                                <Input 
                                    id="shirtNumber" 
                                    type="number" 
                                    className={cn(INPUT_CLASS, "pl-7")} 
                                    value={form.shirtNumber} 
                                    onChange={e => setForm({...form, shirtNumber: e.target.value})} 
                                    placeholder="10" 
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                             <Label className="text-foreground">Амплуа</Label>
                             <Select value={form.position} onValueChange={v => setForm({...form, position: v})}>
                                <SelectTrigger className={INPUT_CLASS}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="UNIV">Універсал</SelectItem>
                                    <SelectItem value="GK">Воротар</SelectItem>
                                </SelectContent>
                             </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="birthday" className="text-foreground">Дата народження</Label>
                        <Input 
                            id="birthday" 
                            type="date" 
                            className={INPUT_CLASS} 
                            value={form.birthday} 
                            max={new Date().toISOString().split("T")[0]} 
                            onChange={e => setForm({...form, birthday: e.target.value})} 
                        />
                    </div>

                    <div className="space-y-2">
                         <Label htmlFor="photoUrl" className="text-foreground">URL Фото</Label>
                         <Input 
                            id="photoUrl" 
                            className={INPUT_CLASS} 
                            value={form.photoUrl} 
                            onChange={e => setForm({...form, photoUrl: e.target.value})} 
                            placeholder="https://..." 
                         />
                         <p className="text-[11px] text-muted-foreground">Якщо пусто, буде згенеровано аватар з ініціалів.</p>
                    </div>
                </div>

                <div className="p-6 border-t border-border bg-muted/5 flex justify-end gap-3">
                    <Button 
                        variant="secondary" 
                        type="button" 
                        onClick={() => setIsSheetOpen(false)}
                    >
                        Скасувати
                    </Button>
                    {/* Виправлено variant="primary" -> variant="default" */}
                    <Button 
                        variant="default" 
                        type="submit" 
                        disabled={saving} 
                        className="min-w-[120px]"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Зберегти"}
                    </Button>
                </div>
            </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}