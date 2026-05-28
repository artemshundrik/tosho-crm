import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Banknote, FileText, Package, Receipt, ScrollText, Wallet } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SEGMENTED_GROUP, SEGMENTED_TRIGGER } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";

const FINANCE_TABS = [
  {
    value: "invoices",
    label: "Рахунки",
    icon: Receipt,
    description:
      "Виставлення рахунків замовникам, відстеження оплат, прив'язка до замовлень.",
  },
  {
    value: "goods",
    label: "Видаткові накладні (товар)",
    icon: Package,
    description:
      "Документи на відвантаження товару. Облік позицій, кількостей, сум.",
  },
  {
    value: "acts",
    label: "Акти виконаних робіт (послуги)",
    icon: ScrollText,
    description:
      "Акти приймання-передачі за надані послуги (дизайн, доставка, інші роботи).",
  },
  {
    value: "reconciliation",
    label: "Звірка (акт)",
    icon: FileText,
    description:
      "Акти звірки взаєморозрахунків із замовниками: рахунки, оплати, залишок.",
  },
  {
    value: "expenses",
    label: "Витрати компанії",
    icon: Wallet,
    description:
      "Внутрішні витрати: оренда, ФОП, реклама, підрядники, інше. Облік + категорії.",
  },
] as const;

type FinanceTab = (typeof FINANCE_TABS)[number]["value"];

const FINANCE_TAB_VALUES = FINANCE_TABS.map((tab) => tab.value);
const DEFAULT_TAB: FinanceTab = "invoices";

const isFinanceTab = (value: string | null): value is FinanceTab =>
  Boolean(value) && (FINANCE_TAB_VALUES as readonly string[]).includes(value!);

export default function FinancesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: FinanceTab = useMemo(() => {
    const raw = searchParams.get("tab");
    return isFinanceTab(raw) ? raw : DEFAULT_TAB;
  }, [searchParams]);

  const handleTabChange = useCallback(
    (value: string) => {
      if (!isFinanceTab(value)) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === DEFAULT_TAB) next.delete("tab");
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
            Документообіг, оплати та внутрішні витрати компанії в одному місці.
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList
          className={cn(
            SEGMENTED_GROUP,
            "mb-5 flex w-full flex-wrap items-center justify-start gap-1 shadow-inner"
          )}
        >
          {FINANCE_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  SEGMENTED_TRIGGER,
                  "gap-2",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:shadow-md",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {FINANCE_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsContent key={tab.value} value={tab.value} className="mt-0">
              <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="text-base font-semibold text-foreground">{tab.label}</div>
                <div className="mx-auto mt-1.5 max-w-xl text-sm text-muted-foreground">
                  {tab.description}
                </div>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                  Розділ у розробці
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
