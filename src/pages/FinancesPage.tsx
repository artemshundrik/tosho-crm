import { useCallback, useMemo } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SEGMENTED_TRIGGER } from "@/components/ui/controlStyles";
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

  // Маржа/собівартість і зарплати — лише топ-ролі (CEO + головбух).
  const visibleSections = useMemo(
    () =>
      canSeeSensitive
        ? FINANCE_SECTIONS
        : FINANCE_SECTIONS.filter((s) => s.id !== "margin" && s.id !== "payroll"),
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

  return (
    <div className="w-full pb-20 md:pb-0">
      <div className="mb-4 flex items-center gap-3">
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

      <Tabs value={activeSection} onValueChange={handleSectionChange}>
        <TabsList
          className={cn(
            "mb-5 flex h-auto w-full items-center justify-start gap-1 overflow-x-auto rounded-xl",
            "border border-border/50 bg-muted/40 p-1 shadow-inner",
            "[scrollbar-width:thin]"
          )}
        >
          {visibleSections.map((section) => {
            const Icon = section.icon;
            return (
              <TabsTrigger
                key={section.id}
                value={section.id}
                className={cn(
                  SEGMENTED_TRIGGER,
                  "h-9 flex-none shrink-0 gap-2 whitespace-nowrap px-3",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:shadow-md",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{section.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {visibleSections.map((section) => (
          <TabsContent key={section.id} value={section.id} className="mt-0">
            {section.id === "settings" ? (
              <FinanceSettings teamId={teamId} canSeeSensitive={canSeeSensitive} />
            ) : section.id === "sales" ? (
              <FinanceSales teamId={teamId} userId={userId} canSeeSensitive={canSeeSensitive} />
            ) : section.id === "expenses" ? (
              <FinanceExpenses teamId={teamId} userId={userId} canSeeSensitive={canSeeSensitive} />
            ) : section.id === "margin" ? (
              <FinanceMargin teamId={teamId} userId={userId} />
            ) : section.id === "payroll" ? (
              <FinancePayroll teamId={teamId} userId={userId} />
            ) : section.id === "taxes" ? (
              <FinanceTaxes teamId={teamId} />
            ) : section.id === "calendar" ? (
              <FinanceCalendar teamId={teamId} userId={userId} canSeeSensitive={canSeeSensitive} />
            ) : section.id === "reports" ? (
              <FinanceReports teamId={teamId} canSeeSensitive={canSeeSensitive} />
            ) : section.id === "accounts" ? (
              <FinanceAccountsView teamId={teamId} canSeeSensitive={canSeeSensitive} />
            ) : section.id === "reconciliation" ? (
              <FinanceReconciliation teamId={teamId} userId={userId} />
            ) : section.id === "dashboard" ? (
              <FinanceDashboard teamId={teamId} userId={userId} canSeeSensitive={canSeeSensitive} />
            ) : (
              <PlaceholderSection section={section} />
            )}
          </TabsContent>
        ))}
      </Tabs>
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
