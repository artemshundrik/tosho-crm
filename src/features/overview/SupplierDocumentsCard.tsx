import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { toneSubtleClass, toneTextClass } from "@/lib/statusTones";
import type { PendingReceipts } from "@/features/orders/orderPurchaseQueries";

/**
 * «Документи постачальників» на головній: що ще не прийшло від постачальників
 * і де бухгалтерія позначила «закупок немає».
 *
 * ЧИСТА РОЗМІТКА. Дані й «зараз» приходять ззовні, тож правила показу
 * (групи, поріг у 8 днів, порожній стан) перевіряються тестом без мережі;
 * завантаження живе в `useSupplierDocuments`. Сум тут немає свідомо: RPC їх не
 * віддає, бо картку бачить і склад.
 */

/** Рахунок старший за цей поріг (у днях) підсвічується й піднімає групу вгору. */
const STALE_AFTER_DAYS = 8;

const JOB_ROLES_WITH_CARD = ["seo", "pm", "logistics", "head_of_logistics", "head_of_production"];

/** Хто бачить картку: проджект, склад, начальник виробництва, СЕО й власник. */
export function canSeeSupplierDocumentsCard(accessRole: string | null | undefined, jobRole: string | null | undefined) {
  if ((accessRole ?? "").trim().toLowerCase() === "owner") return true;
  return JOB_ROLES_WITH_CARD.includes((jobRole ?? "").trim().toLowerCase());
}

/** Календарні дні від дати рахунку (`YYYY-MM-DD`, без поясу) до `now`. */
function daysSince(isoDate: string, now: Date): number {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return 0;
  const invoice = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today - invoice) / 86_400_000));
}

const formatShortDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
};

type PendingRow = PendingReceipts["pending"][number] & { days: number };

type SupplierGroup = { supplierName: string; rows: PendingRow[]; stale: boolean };

function groupBySupplier(pending: PendingReceipts["pending"], now: Date): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>();
  for (const item of pending) {
    const name = item.supplierName.trim() || "Без назви";
    const group = groups.get(name) ?? { supplierName: name, rows: [], stale: false };
    const row = { ...item, days: daysSince(item.supplierInvoiceDate, now) };
    group.rows.push(row);
    if (row.days >= STALE_AFTER_DAYS) group.stale = true;
    groups.set(name, group);
  }
  const list = [...groups.values()];
  for (const group of list) {
    // Найстаріший рахунок першим; ISO-дати порівнюються як рядки.
    group.rows.sort((a, b) => a.supplierInvoiceDate.localeCompare(b.supplierInvoiceDate));
  }
  return list.sort(
    (a, b) => Number(b.stale) - Number(a.stale) || a.supplierName.localeCompare(b.supplierName, "uk")
  );
}

const orderHref = (orderId: string) => `/orders/production/${orderId}`;

const rowLinkClass =
  "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted/50";

function SectionTitle({ children, count }: { children: string; count: number }) {
  return (
    <div className="mt-3 flex items-baseline justify-between gap-2 first:mt-2.5">
      <h4 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h4>
      <span className="figure text-2xs text-muted-foreground">{count}</span>
    </div>
  );
}

export function SupplierDocumentsCard({
  data,
  now,
  className,
}: {
  data: PendingReceipts;
  now: Date;
  className?: string;
}) {
  if (data.pending.length === 0 && data.noneOrders.length === 0) return null;

  const groups = groupBySupplier(data.pending, now);

  return (
    <section className={cn("rounded-xl border border-border/40 bg-card p-4", className)}>
      <h3 className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">Документи постачальників</h3>
      <p className="mt-0.5 text-2xs leading-snug text-muted-foreground/80">
        Що ще не прийшло від постачальників по відкритих замовленнях.
      </p>

      {groups.length > 0 ? (
        <>
          <SectionTitle count={data.pending.length}>Чекають документів</SectionTitle>
          <div className="mt-1 space-y-2">
            {groups.map((group) => (
              <div key={group.supplierName} role="group" aria-label={group.supplierName}>
                <div className="px-2 pt-1 text-xs font-medium text-foreground">{group.supplierName}</div>
                {group.rows.map((row) => {
                  const isStale = row.days >= STALE_AFTER_DAYS;
                  return (
                    <Link
                      key={row.purchaseId}
                      to={orderHref(row.orderId)}
                      data-tone={isStale ? "warning" : undefined}
                      className={cn(rowLinkClass, isStale && toneSubtleClass.warning)}
                    >
                      <span className="figure font-medium text-foreground">{row.orderNumber}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.description}</span>
                      {row.supplierInvoiceNumber ? (
                        <span className="text-2xs text-muted-foreground">№ {row.supplierInvoiceNumber}</span>
                      ) : null}
                      <span className={cn("figure text-2xs", isStale ? toneTextClass.warning : "text-muted-foreground")}>
                        {row.days} дн.
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {data.noneOrders.length > 0 ? (
        <>
          <SectionTitle count={data.noneOrders.length}>Без закупок</SectionTitle>
          <div className="mt-1">
            {data.noneOrders.map((order) => {
              const when = formatShortDate(order.markedAt);
              const who = [order.markedByName, when].filter(Boolean).join(", ");
              return (
                <Link key={order.orderId} to={orderHref(order.orderId)} className={rowLinkClass}>
                  <span className="figure font-medium text-foreground">{order.orderNumber}</span>
                  {who ? <span className="min-w-0 flex-1 truncate text-muted-foreground">{who}</span> : null}
                </Link>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
