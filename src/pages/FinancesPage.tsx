import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Banknote,
  CalendarClock,
  FileBarChart,
  Landmark,
  PiggyBank,
  Receipt,
  ScrollText,
  Settings2,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { normalizeJobRole } from "@/lib/permissions";
import { hasPayrollAccess } from "@/lib/moduleAccess";
import { FinanceSettings } from "@/features/finances/FinanceSettings";
import { FinanceSales } from "@/features/finances/FinanceSales";
import { FinanceExpenses } from "@/features/finances/FinanceExpenses";
import { FinanceMargin } from "@/features/finances/FinanceMargin";
import { FinancePayroll } from "@/features/finances/FinancePayroll";
import { FinanceTaxes } from "@/features/finances/FinanceTaxes";
import { FinanceCalendar } from "@/features/finances/FinanceCalendar";
import { FinanceReports } from "@/features/finances/FinanceReports";
import { FinanceAccountsView } from "@/features/finances/FinanceAccountsView";
import { FinanceReconciliation } from "@/features/finances/FinanceReconciliation";
import { FinanceDashboard } from "@/features/finances/FinanceDashboard";
import { findMissingMonthEntries } from "@/features/finances/monthClose";
import { useFinanceAccounts, useFinanceExpenses, useFinanceExpenseEntries } from "@/features/finances/queries";

type FinanceSectionId =
  | "dashboard"
  | "sales"
  | "expenses"
  | "payroll"
  | "taxes"
  | "calendar"
  | "accounts"
  | "margin"
  | "reconciliation"
  | "reports"
  | "settings";

type FinanceSection = {
  id: FinanceSectionId;
  label: string;
  icon: typeof Banknote;
  description: string;
};

const FINANCE_SECTIONS: FinanceSection[] = [
  { id: "dashboard", label: "Дашборд", icon: TrendingUp, description: "Фінансова картина по контурах: заробили, витратили, дебіторка, прибуток, маржа." },
  { id: "sales", label: "Реєстр продажів", icon: Receipt, description: "Рахунки клієнтам, оплати та документи реалізації (видаткові/акти)." },
  { id: "expenses", label: "Витрати", icon: PiggyBank, description: "Сталі (щомісячні) та змінні витрати, постачальники, розподіл на замовлення." },
  { id: "payroll", label: "Виплати команді", icon: Users, description: "Зарплати, ФОП-договори, місячні акти та статус виплат." },
  { id: "taxes", label: "Податки", icon: Landmark, description: "ПДВ (ТОВ) і ФОП (єдиний податок, ЄСВ, військовий збір)." },
  { id: "calendar", label: "Платіжний календар", icon: CalendarClock, description: "Що, кому й коли платити: вихідні платежі, податки, зарплати." },
  { id: "accounts", label: "Каси та рахунки", icon: Wallet, description: "Баланси по всіх гаманцях і контурах." },
  { id: "margin", label: "Маржа", icon: TrendingUp, description: "Планова та фактична маржа по кожному замовленню." },
  { id: "reconciliation", label: "Звірки", icon: ScrollText, description: "Генерація актів звірки з даних, експорт PDF/Excel, архів." },
  { id: "reports", label: "Звіти", icon: FileBarChart, description: "Продажі, дебіторка, кредиторка, прибуток, ПДВ, розбивки ФОП/ТОВ/канал." },
  { id: "settings", label: "Налаштування", icon: Settings2, description: "Юрособи, каси, статті витрат, шаблони документів, реквізити." },
];

const SECTION_IDS = FINANCE_SECTIONS.map((s) => s.id);
const DEFAULT_SECTION: FinanceSectionId = "dashboard";

// Групування для лівого сайдбара розділу. Порожня мітка = без заголовка групи.
const SECTION_GROUPS: { label: string | null; ids: FinanceSectionId[] }[] = [
  { label: null, ids: ["dashboard"] },
  { label: "Гроші", ids: ["sales", "accounts", "calendar"] },
  { label: "Витрати", ids: ["expenses", "payroll", "taxes"] },
  { label: "Аналітика", ids: ["margin", "reconciliation", "reports"] },
  { label: "Система", ids: ["settings"] },
];

const isSection = (value: string | null): value is FinanceSectionId =>
  Boolean(value) && (SECTION_IDS as string[]).includes(value!);

export default function FinancesPage() {
  const { teamId, userId, permissions, accessRole, jobRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // CEO (owner) + головбух (chief_accountant) — топ-ролі, бачать чутливі канали й маржу.
  const canSeeSensitive = useMemo(
    () => permissions.isSuperAdmin || normalizeJobRole(jobRole) === "chief_accountant",
    [permissions.isSuperAdmin, jobRole]
  );

  /**
   * Виплати команді — власник і CEO, більше ніхто (рішення CEO 26.08.2026).
   *
   * Бухгалтери мають Фінанси цілком, але зарплати колег — ні. База тримає той
   * самий рубіж: політики `tosho.payroll_entries` і `tosho.finance_payout_meta`
   * питають `tosho.has_payroll_access`. Доти вкладку показували всім фін-ролям,
   * і бухгалтер відкривав порожню таблицю замість чесного «не для вас».
   */
  const canSeePayroll = useMemo(
    () => hasPayrollAccess(accessRole, jobRole),
    [accessRole, jobRole]
  );

  // Маржа/собівартість — лише топ-ролі (CEO + головбух).
  const visibleSections = useMemo(
    () =>
      FINANCE_SECTIONS.filter(
        (s) => (s.id !== "margin" || canSeeSensitive) && (s.id !== "payroll" || canSeePayroll)
      ),
    [canSeeSensitive, canSeePayroll]
  );

  const activeSection: FinanceSectionId = useMemo(() => {
    const raw = searchParams.get("tab");
    const candidate = isSection(raw) ? raw : DEFAULT_SECTION;
    return visibleSections.some((s) => s.id === candidate) ? candidate : DEFAULT_SECTION;
  }, [searchParams, visibleSections]);

  const handleSectionChange = useCallback(
    (value: string) => {
      if (!isSection(value)) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === DEFAULT_SECTION) next.delete("tab");
          else next.set("tab", value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Два панелі (нав + контент) заповнюють простір під тулбаром рівно до низу вікна —
  // висоту рахуємо від фактичного top контейнера, як у майстер-детейл Співробітників.
  const panesRef = useRef<HTMLDivElement | null>(null);
  const [panesTop, setPanesTop] = useState<number | null>(null);
  useEffect(() => {
    const el = panesRef.current;
    if (!el) return;
    const update = () => setPanesTop(Math.round(el.getBoundingClientRect().top));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [activeSection]);

  // Шапки «Фінанси / Облік коштів…» тут свідомо НЕМАЄ: розділ уже названий у
  // бредкрамбі топбара й у лівому сайдбарі, а смуга з описом лише з'їдала ~90px
  // висоти. Контент (липкий бар місяця + bento) починається одразу під топбаром.

  // Групи розділів для сайдбара — з фактично доступних розділів (маржа може бути прихована).
  const sectionGroups = useMemo(() => {
    const byId = new Map(visibleSections.map((s) => [s.id, s]));
    return SECTION_GROUPS.map((group) => ({
      label: group.label,
      sections: group.ids.map((id) => byId.get(id)).filter(Boolean) as FinanceSection[],
    })).filter((group) => group.sections.length > 0);
  }, [visibleSections]);

  const activeSectionMeta = visibleSections.find((section) => section.id === activeSection);

  // Мітка «не внесено» на підпункті «Витрати»: журнальні витрати (комуналка,
  // вода, прибирання) не мають дати списання, тож про них просто забувають.
  // Ті самі queryKey, що й усередині FinanceExpenses — React Query дедуплікує,
  // зайвого запиту немає.
  const expensesQuery = useFinanceExpenses(teamId);
  const entriesQuery = useFinanceExpenseEntries(teamId);
  const accountsQuery = useFinanceAccounts(teamId);
  const missingThisMonth = useMemo(() => {
    // Чутливі каси ховаємо тим самим правилом, що й сам список витрат — інакше
    // лічильник видавав би існування рядка, якого людина не бачить.
    const sensitiveAccounts = new Set(
      (accountsQuery.data ?? []).filter((a) => a.isSensitive).map((a) => a.id)
    );
    const visible = canSeeSensitive
      ? expensesQuery.data ?? []
      : (expensesQuery.data ?? []).filter((e) => !e.accountId || !sensitiveAccounts.has(e.accountId));
    // Завжди про ПОТОЧНИЙ місяць, а не про той, що відкритий у Витратах: мітка в
    // навігації відповідає на «що не зроблено зараз», а не «що в місяці, який гортаю».
    const monthKey = new Date().toISOString().slice(0, 7);
    return findMissingMonthEntries(visible, entriesQuery.data ?? new Map(), monthKey).size;
  }, [expensesQuery.data, entriesQuery.data, accountsQuery.data, canSeeSensitive]);
  // На самій вкладці Витрат мітку не дублюємо — там уже бейдж на кожному рядку
  // і лічильник у заголовку секції. Два сигнали про один факт читаються як шум.
  const expensesBadge = activeSection === "expenses" ? 0 : missingThisMonth;

  const activeContent = (
    <>
      {activeSection === "settings" ? (
        <FinanceSettings teamId={teamId} canSeeSensitive={canSeeSensitive} />
      ) : activeSection === "sales" ? (
        <FinanceSales teamId={teamId} userId={userId} canSeeSensitive={canSeeSensitive} />
      ) : activeSection === "expenses" ? (
        <FinanceExpenses teamId={teamId} userId={userId} canSeeSensitive={canSeeSensitive} />
      ) : activeSection === "margin" ? (
        <FinanceMargin teamId={teamId} userId={userId} />
      ) : activeSection === "payroll" ? (
        <FinancePayroll teamId={teamId} userId={userId} />
      ) : activeSection === "taxes" ? (
        <FinanceTaxes teamId={teamId} />
      ) : activeSection === "calendar" ? (
        <FinanceCalendar teamId={teamId} userId={userId} />
      ) : activeSection === "reports" ? (
        <FinanceReports teamId={teamId} canSeeSensitive={canSeeSensitive} />
      ) : activeSection === "accounts" ? (
        <FinanceAccountsView teamId={teamId} canSeeSensitive={canSeeSensitive} />
      ) : activeSection === "reconciliation" ? (
        <FinanceReconciliation teamId={teamId} userId={userId} />
      ) : activeSection === "dashboard" ? (
        <FinanceDashboard teamId={teamId} userId={userId} canSeeSensitive={canSeeSensitive} />
      ) : activeSectionMeta ? (
        <PlaceholderSection section={activeSectionMeta} />
      ) : null}
    </>
  );

  return (
    <div className="w-full">
        {/* Мобільний перемикач — горизонтальні пілюлі; сайдбар ховаємо на вузьких. */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-border/60 px-4 py-3 lg:hidden [scrollbar-width:thin]">
          {visibleSections.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => handleSectionChange(section.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {section.label}
              </button>
            );
          })}
        </div>

        {/* Майстер-детейл впритул до країв: нав-рейка з роздільником + панель контенту,
            обидві заповнюють висоту до низу вікна й скролять незалежно (як Співробітники). */}
        <div
          ref={panesRef}
          className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)]"
          style={panesTop != null ? ({ ["--fin-panes-h" as string]: `calc(100dvh - ${panesTop}px)` }) : undefined}
        >
          <aside className="hidden border-r border-border/60 lg:block lg:h-[var(--fin-panes-h,auto)] lg:overflow-y-auto">
            <nav className="flex flex-col gap-0.5 p-3">
              {sectionGroups.map((group) => (
                <div key={group.label ?? "main"} className="flex flex-col gap-0.5">
                  {group.label ? (
                    <div className="px-3 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {group.label}
                    </div>
                  ) : null}
                  {group.sections.map((section) => {
                    const Icon = section.icon;
                    const active = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => handleSectionChange(section.id)}
                        aria-current={active ? "page" : undefined}
                        title={section.description}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            active ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground"
                          )}
                        />
                        <span className="truncate">{section.label}</span>
                        {section.id === "expenses" && expensesBadge > 0 ? (
                          <span
                            title={`${expensesBadge} журнальних витрат ще без запису за цей місяць`}
                            className="ml-auto shrink-0 rounded-full bg-warning-soft px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-warning-foreground"
                          >
                            {expensesBadge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 px-4 pb-20 pt-4 md:pb-8 lg:h-[var(--fin-panes-h,auto)] lg:overflow-y-auto lg:p-6">
            {activeContent}
          </div>
        </div>
    </div>
  );
}

function PlaceholderSection({ section }: { section: FinanceSection }) {
  const Icon = section.icon;
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="text-base font-semibold text-foreground">{section.label}</div>
      <div className="mx-auto mt-1.5 max-w-xl text-sm text-muted-foreground">{section.description}</div>
      <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs text-muted-foreground">
        Розділ у розробці
      </div>
    </div>
  );
}
