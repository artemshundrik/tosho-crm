import * as React from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Search } from "@/components/icons/appIcons";

import { Input } from "@/components/ui/input";
import { normalizeMethodName } from "@/lib/catalogMethodName";
import { matchesMethodQuery } from "@/lib/methodNameSearch";
import { cn } from "@/lib/utils";

import { getErrorMessage } from "./config";
import type { DirectoryMethodOption, KindMethodOption, MethodDirectorySource } from "./useKindImprintOptions";

/**
 * «Інші методи…» — будь-який метод компанії, якого вид ще не має (REQ-292).
 *
 * ОКРЕМИЙ ЕКРАН ПАНЕЛІ, А НЕ ХВІСТ СПИСКУ. Довідник — три десятки назв, а
 * панель нанесення заввишки менша за триста пікселів: дописані в кінець, вони
 * відсували б пошук за край, і шукати довелося б прокруткою. Тому «Інші
 * методи…» відкриває власний екран — пошук угорі, з фокусом, і «назад».
 *
 * ТЕ, ЩО ВИД УЖЕ МАЄ, ТУТ НЕ ДУБЛЮЄТЬСЯ — АЛЕ ПОШУК ЙОГО ЗНАХОДИТЬ. Чипи
 * методів у смузі обрізаються, коли їм тісно, тож «ДТФ» можуть шукати серед
 * інших, хоч він уже є у виду. Тоді він виходить окремою групою «Уже є у
 * виду» над довідником і ставиться одразу, без запису в каталог.
 *
 * НОВИХ НАЗВ ТУТ НЕ ЗАВОДЯТЬ, і підказка внизу каже, де це робиться.
 */
export function OtherMethodsPanel({
  directory,
  kindMethods,
  onPicked,
  onBack,
  inRail = false,
}: {
  directory: MethodDirectorySource;
  /** Методи виду: серед «інших» їх немає, але пошук їх знаходить. */
  kindMethods: readonly KindMethodOption[];
  /** Метод тепер у виду (або вже був) — його можна ставити в позицію. */
  onPicked: (method: KindMethodOption) => void;
  /** Назад до методів виду. Не задано — назад нема куди (у виду методів немає). */
  onBack?: () => void;
  /** Рейка вікна з ескізом: без власного заголовка, рядки з відступом під галочку. */
  inRail?: boolean;
}) {
  const { entries, failed, request, attach } = directory;
  const [query, setQuery] = React.useState("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!entries) request();
  }, [entries, request]);

  const taken = new Set(kindMethods.map((method) => normalizeMethodName(method.name)));
  const searching = query.trim().length > 0;
  const found = (entries ?? []).filter(
    (entry) => !taken.has(normalizeMethodName(entry.name)) && matchesMethodQuery(entry.name, query)
  );
  const own = searching ? kindMethods.filter((method) => matchesMethodQuery(method.name, query)) : [];

  /**
   * Спершу метод стає методом ВИДУ, і лише тоді — нанесенням позиції. Не
   * вдалося прив'язати — у смугу не йде нічого: пара з методом, якого вид не
   * має, була б саме тією брехнею, від якої береже `catalog_methods.kind_id`.
   */
  const pick = async (entry: DirectoryMethodOption) => {
    if (pendingId) return;
    setPendingId(entry.id);
    let method: KindMethodOption;
    try {
      method = await attach(entry);
    } catch (error) {
      setPendingId(null);
      toast.error(`Не вдалося додати метод «${entry.name}»`, {
        description: getErrorMessage(error, "Спробуйте ще раз"),
      });
      return;
    }
    setPendingId(null);
    onPicked(method);
  };

  const pickFirst = () => {
    if (!searching || pendingId) return;
    if (own[0]) onPicked(own[0]);
    else if (found[0]) void pick(found[0]);
  };

  const rowClass = (highlighted: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60",
      highlighted && "bg-muted/60"
    );
  const railIndent = inRail ? <span aria-hidden className="h-3.5 w-3.5 shrink-0" /> : null;

  return (
    <div>
      {inRail ? null : (
        <div className="flex items-center gap-1 pb-1">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Назад до методів виду"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <span
            className={cn(
              "text-3xs font-semibold uppercase tracking-wider text-muted-foreground",
              !onBack && "px-2 pt-1"
            )}
          >
            Інші методи
          </span>
        </div>
      )}

      <div className="relative mb-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          controlSize="sm"
          value={query}
          autoFocus
          aria-label="Пошук методу"
          placeholder="Пошук методу"
          className="rounded-full pl-8 text-sm"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            pickFirst();
          }}
        />
      </div>

      <div className="max-h-56 overflow-y-auto">
        {entries === null ? (
          failed ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Довідник методів не завантажився.{" "}
              <button
                type="button"
                onClick={request}
                className="font-medium text-foreground underline underline-offset-2"
              >
                Спробувати ще
              </button>
            </p>
          ) : (
            <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              Завантажую довідник…
            </p>
          )
        ) : (
          <>
            {own.length > 0 ? (
              <>
                <GroupHeading>Уже є у виду</GroupHeading>
                <div role="listbox" aria-label="Уже є у виду">
                  {own.map((method, index) => (
                    <button
                      key={method.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      disabled={Boolean(pendingId)}
                      title={method.name}
                      onClick={() => onPicked(method)}
                      className={rowClass(index === 0)}
                    >
                      {railIndent}
                      <span className="min-w-0 flex-1 truncate">{method.name}</span>
                    </button>
                  ))}
                </div>
                {found.length > 0 ? <GroupHeading>З довідника</GroupHeading> : null}
              </>
            ) : null}
            {found.length > 0 ? (
              <div role="listbox" aria-label="Методи з довідника">
                {found.map((entry, index) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    aria-busy={pendingId === entry.id}
                    disabled={Boolean(pendingId)}
                    title={entry.name}
                    onClick={() => void pick(entry)}
                    className={rowClass(searching && own.length === 0 && index === 0)}
                  >
                    {railIndent}
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    {pendingId === entry.id ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : own.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {searching ? "Такого методу в довіднику немає" : "Усі методи довідника вже є в цього виду"}
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* Свідомо без поля «додати свій»: дублі назв уже двічі чистили руками. */}
      <p className="mt-1 border-t border-border/60 px-2 pb-0.5 pt-1.5 text-2xs leading-snug text-muted-foreground">
        Немає в списку? Нову назву додають у Каталозі.
      </p>
    </div>
  );
}

/** Вхід у «Інші методи…» під списком методів виду (поповер нанесення). */
export function OtherMethodsEntry({ onOpen }: { onOpen: () => void }) {
  return (
    <>
      <div className="my-1 h-px bg-border/60" />
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      >
        <span className="min-w-0 flex-1 truncate">Інші методи…</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
      </button>
    </>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-1.5 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}
