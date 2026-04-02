import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { AlertTriangle, Copy, RefreshCw, Search } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { TableActionCell, TableActionHeaderCell, TableHeaderCell } from "@/components/app/table-kit";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type RuntimeErrorRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  actor_name: string | null;
  title: string | null;
  href: string | null;
  metadata: Record<string, unknown> | null;
};

type RuntimeErrorSource = "all" | "boundary" | "window_error" | "unhandledrejection";

const SOURCE_LABELS: Record<Exclude<RuntimeErrorSource, "all">, string> = {
  boundary: "Boundary",
  window_error: "Window error",
  unhandledrejection: "Unhandled rejection",
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatCreatedAt(value: string) {
  try {
    return format(new Date(value), "dd.MM.yyyy HH:mm:ss", { locale: uk });
  } catch {
    return value;
  }
}

export default function RuntimeErrorsPage() {
  const { teamId, loading: authLoading, permissions } = useAuth();
  const [rows, setRows] = useState<RuntimeErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<RuntimeErrorSource>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadErrors = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!teamId) return;
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("activity_log")
        .select("id,created_at,user_id,actor_name,title,href,metadata")
        .eq("team_id", teamId)
        .eq("action", "app_runtime_error")
        .order("created_at", { ascending: false })
        .limit(200);

      if (fetchError) throw fetchError;
      setRows(((data ?? []) as RuntimeErrorRow[]).filter((row) => !!row.id));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Не вдалося завантажити технічні помилки.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (!teamId || !permissions.isSuperAdmin) return;
    void loadErrors();
  }, [loadErrors, permissions.isSuperAdmin, teamId]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const source = normalizeText(row.metadata?.source);
      if (sourceFilter !== "all" && source !== sourceFilter) return false;
      if (!query) return true;

      const haystack = [
        row.actor_name,
        row.title,
        row.href,
        normalizeText(row.metadata?.message),
        normalizeText(row.metadata?.path),
        normalizeText(row.metadata?.user_agent),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [rows, search, sourceFilter]);

  const copyError = async (row: RuntimeErrorRow) => {
    const payload = JSON.stringify(row, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Помилку скопійовано");
    } catch {
      toast.error("Не вдалося скопіювати помилку");
    }
  };

  if (authLoading) {
    return <AppPageLoader title="Завантаження" subtitle="Перевіряємо доступ до технічних помилок." />;
  }

  return (
    <PageCanvas>
      <PageCanvasBody className="space-y-6 px-5 py-3 pb-20 md:pb-6">
        <section className="rounded-[24px] border border-border/60 bg-card/95 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-warning-foreground" />
                Технічні помилки
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Логи фронтових падінь інтерфейсу. Доступно тільки для Super Admin.
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadErrors("refresh")} disabled={refreshing}>
              <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
              Оновити
            </Button>
          </div>
        </section>

        <section className="grid gap-3 rounded-[24px] border border-border/60 bg-card/95 p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Пошук по користувачу, тексту помилки, шляху або user agent..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 overflow-auto">
            {(["all", "boundary", "window_error", "unhandledrejection"] as RuntimeErrorSource[]).map((value) => (
              <Button
                key={value}
                type="button"
                variant={sourceFilter === value ? "primary" : "outline"}
                size="sm"
                onClick={() => setSourceFilter(value)}
                className="shrink-0"
              >
                {value === "all" ? "Всі джерела" : SOURCE_LABELS[value]}
              </Button>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-border/60 bg-card/95 shadow-sm">
          {loading ? (
            <AppSectionLoader label="Завантаження помилок..." className="border-none bg-transparent py-10" />
          ) : error ? (
            <div className="p-5 text-sm text-destructive">{error}</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">Помилок за поточним фільтром немає.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Коли</TableHeaderCell>
                    <TableHeaderCell>Користувач</TableHeaderCell>
                    <TableHeaderCell>Джерело</TableHeaderCell>
                    <TableHeaderCell>Помилка</TableHeaderCell>
                    <TableHeaderCell>Сторінка</TableHeaderCell>
                    <TableActionHeaderCell widthClass="w-[140px]">Дії</TableActionHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => {
                    const isExpanded = expandedId === row.id;
                    const source = normalizeText(row.metadata?.source) as Exclude<RuntimeErrorSource, "all"> | "";
                    const message = normalizeText(row.metadata?.message) || normalizeText(row.title) || "Без тексту помилки";
                    const path = normalizeText(row.metadata?.path) || normalizeText(row.href) || "—";
                    const userAgent = normalizeText(row.metadata?.user_agent);
                    const componentStack = normalizeText(row.metadata?.component_stack);

                    return [
                      <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-sm">{formatCreatedAt(row.created_at)}</TableCell>
                          <TableCell className="text-sm">
                            <div className="font-medium text-foreground">{row.actor_name || "Невідомий користувач"}</div>
                            <div className="text-xs text-muted-foreground">{row.user_id || "—"}</div>
                          </TableCell>
                          <TableCell className="text-sm">{source ? SOURCE_LABELS[source] : "—"}</TableCell>
                          <TableCell className="max-w-[420px] text-sm">
                            <div className="line-clamp-2">{message}</div>
                          </TableCell>
                          <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                            <div className="line-clamp-2 break-all">{path}</div>
                          </TableCell>
                          <TableActionCell>
                            <div className="flex items-center gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => setExpandedId(isExpanded ? null : row.id)}>
                                {isExpanded ? "Сховати" : "Деталі"}
                              </Button>
                              <Button type="button" variant="outline" size="icon" onClick={() => void copyError(row)} aria-label="Скопіювати">
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableActionCell>
                      </TableRow>,
                      isExpanded ? (
                        <TableRow key={`${row.id}:details`}>
                            <TableCell colSpan={6} className="bg-muted/20">
                              <div className="space-y-3 py-2">
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Message</div>
                                  <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-xs text-foreground">{message}</pre>
                                </div>
                                {componentStack ? (
                                  <div>
                                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Component Stack</div>
                                    <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-xs text-foreground">{componentStack}</pre>
                                  </div>
                                ) : null}
                                {userAgent ? (
                                  <div>
                                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">User Agent</div>
                                    <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-xs text-foreground">{userAgent}</pre>
                                  </div>
                                ) : null}
                              </div>
                            </TableCell>
                        </TableRow>
                      ) : null,
                    ];
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </PageCanvasBody>
    </PageCanvas>
  );
}
