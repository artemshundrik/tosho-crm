import { useCallback, useMemo, useState, type ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { FinanceToolbarProvider } from "@/features/finances/financeToolbar";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { normalizeJobRole } from "@/lib/permissions";
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

const isSection = (value: string | null): value is FinanceSectionId =>
  Boolean(value) && (SECTION_IDS as string[]).includes(value!);

export default function FinancesPage() {
  const { teamId, userId, permissions, jobRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // CEO (owner) + головбух (chief_accountant) — топ-ролі, бачать чутливі канали й маржу.
  const canSeeSensitive = useMemo(
    () => permissions.isSuperAdmin || normalizeJobRole(jobRole) === "chief_accountant",
    [permissions.isSuperAdmin, jobRole]
  );

  // Маржа/собівартість — лише топ-ролі (CEO + головбух).
  // Виплати команди — доступні всім фін-ролям (SEO/бухгалтери теж бачать).
  const visibleSections = useMemo(
    () =>
      canSeeSensitive
        ? FINANCE_SECTIONS
        : FINANCE_SECTIONS.filter((s) => s.id !== "margin"),
    [canSeeSensitive]
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

  // Дії активного розділу, які він публікує в шапку сторінки.
  const [sectionActions, setSectionActions] = useState<ReactNode>(null);

  // Перемикач розділів — сегментована стрічка в нижньому ряду тулбара (там, де в
  // інших сторінок фільтри). Загортається в кілька рядів замість горизонтального
  // скролу: 11 розділів інакше обрізаються біля правого краю.
  const sectionSwitcher = useMemo(
    () => (
      <div className={cn(SEGMENTED_GROUP_SM, "h-auto w-full flex-wrap justify-start gap-0.5")}>
        {visibleSections.map((section) => (
          <Button
            key={section.id}
            type="button"
            variant="segmented"
            size="xs"
            aria-pressed={activeSection === section.id}
            onClick={() => handleSectionChange(section.id)}
            title={section.description}
            className={cn(SEGMENTED_TRIGGER_SM, "flex-none whitespace-nowrap px-2.5")}
          >
            {section.label}
          </Button>
        ))}
      </div>
    ),
    [activeSection, handleSectionChange, visibleSections]
  );

  // Тулбар малюється слотом шапки AppLayout (usePageHeaderActions), як на всіх
  // list-сторінках — а не інлайном у боді. Конвенція: docs/CODEX_PROJECT_GUIDE.md.
  const headerActions = useMemo(
    () => (
      <UnifiedPageToolbar
        topLeft={
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
              <Banknote className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-lg font-semibold text-foreground">Фінанси</div>
              <div className="text-sm text-muted-foreground">
                Облік коштів по контурах: ТОВ, ФОПи, готівка, крипта.
              </div>
            </div>
          </div>
        }
        topRight={sectionActions}
        filters={sectionSwitcher}
      />
    ),
    [sectionActions, sectionSwitcher]
  );

  usePageHeaderActions(headerActions, [headerActions]);

  const activeSectionMeta = visibleSections.find((section) => section.id === activeSection);

  return (
    // Корінь сторінки — pb-20 md:pb-0, тож на десктопі нижній відступ винен собі
    // сам розділ, інакше останній рядок лягає впритул до краю вікна.
    <div className="w-full pb-20 md:pb-8">
      <FinanceToolbarProvider onActionsChange={setSectionActions}>
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
      </FinanceToolbarProvider>
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
