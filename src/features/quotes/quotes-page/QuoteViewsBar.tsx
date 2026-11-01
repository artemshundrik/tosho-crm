import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Plus, X } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TabBar, TabBarItem } from "@/components/ui/tab-bar";
import { createSavedView, deleteSavedView, listSavedViews, type SavedListView } from "@/features/savedViews/savedListViews";
import { customerFilterKey, type CustomerFilterValue } from "@/lib/customerFilter";
import { cn } from "@/lib/utils";

/**
 * Вигляди над таблицею прорахунків (хвиля В5, картка 346) — замість вкладок-
 * статусів. Стан тепер видно групами в самій таблиці (В4), тож вкладка на
 * кожен статус лише дублювала їх. Вигляд — це набір фільтрів: вбудовані живуть
 * тут, свої людина зберігає в базу. Активним підсвічується той вигляд, з яким
 * збігаються поточні фільтри; змінив фільтр руками — не підсвічено жоден.
 */

export type QuoteViewState = {
  status: string;
  /** "all", "me" (той, хто дивиться) або id менеджера. */
  manager: string;
  customer: CustomerFilterValue | null;
  /** «Горять»: хід наш, а дедлайн сьогодні чи вже минув. */
  burning: boolean;
};

const BUILT_IN: Array<{ id: string; label: string; state: QuoteViewState }> = [
  { id: "active", label: "Активні", state: { status: "active", manager: "all", customer: null, burning: false } },
  { id: "mine", label: "Мої", state: { status: "active", manager: "me", customer: null, burning: false } },
  { id: "burning", label: "Горять", state: { status: "active", manager: "all", customer: null, burning: true } },
  { id: "all", label: "Усі", state: { status: "all", manager: "all", customer: null, burning: false } },
];

const sameState = (a: QuoteViewState, b: QuoteViewState) =>
  a.status === b.status && a.manager === b.manager && customerFilterKey(a.customer) === customerFilterKey(b.customer) && a.burning === b.burning;

export function QuoteViewsBar({
  current,
  onApply,
}: {
  current: QuoteViewState;
  onApply: (state: QuoteViewState) => void;
}) {
  const [saved, setSaved] = useState<SavedListView<QuoteViewState>[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    // Без таблиці (SQL ще не застосовано) лишаються вбудовані вигляди — це не помилка для людини.
    listSavedViews<QuoteViewState>("quotes")
      .then((views) => active && setSaved(views))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const views = [
    ...BUILT_IN.map((view) => ({ ...view, savedId: null as string | null })),
    ...saved.map((view) => ({ id: `saved:${view.id}`, label: view.name, state: { ...BUILT_IN[0].state, ...view.state }, savedId: view.id })),
  ];
  const activeId = views.find((view) => sameState(view.state, current))?.id ?? "";

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const view = await createSavedView("quotes", name, current);
      setSaved((list) => [...list, view]);
      setSaveOpen(false);
      setName("");
    } catch {
      toast.error("Не вдалося зберегти вигляд");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteSavedView(id);
      setSaved((list) => list.filter((view) => view.id !== id));
    } catch {
      toast.error("Не вдалося видалити вигляд");
    }
  };

  return (
    <div className="flex items-center gap-1 border-b border-border/60 px-2">
      <TabBar value={activeId} wrapperClassName="min-w-0 overflow-x-auto">
        {views.map((view) => (
          <TabBarItem
            key={view.id}
            value={view.id}
            onSelect={() => onApply(view.state)}
            className={cn(view.savedId && "group/view pr-1")}
          >
            {view.label}
            {view.savedId ? (
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Видалити вигляд «${view.label}»`}
                onClick={(event) => {
                  event.stopPropagation();
                  void remove(view.savedId!);
                }}
                className="ml-0.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/view:opacity-100"
              >
                <X className="size-3" />
              </span>
            ) : null}
          </TabBarItem>
        ))}
      </TabBar>
      {activeId ? null : (
        <Popover open={saveOpen} onOpenChange={setSaveOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="xs" className="shrink-0 gap-1 text-muted-foreground">
              <Plus className="size-3.5" />
              Зберегти вигляд
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-2 p-3">
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <Input autoFocus value={name} maxLength={40} placeholder="Назва, напр. «Мої на погодженні»" onChange={(event) => setName(event.target.value)} />
              <Button type="submit" size="sm" className="w-full" disabled={busy || !name.trim()}>
                Зберегти поточні фільтри
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
