import { useMemo } from "react";
import { RefreshCw } from "lucide-react";

import { CardsSkeleton } from "@/components/app/CardsSkeleton";
import { IntegrationsTabs } from "@/components/app/IntegrationsTabs";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { usePageHeaderActions } from "@/components/app/usePageHeaderActions";
import { Button } from "@/components/ui/button";
import { formatAgo } from "@/lib/formatAgo";

import { useSupplierPoolSummary } from "@/features/suppliers/queries";
import { SupplierCard } from "@/features/suppliers/SupplierCard";
import { SupplierProductSearch } from "@/features/suppliers/SupplierProductSearch";
import { SUPPLIER_DEFINITIONS } from "@/features/suppliers/suppliersCatalog";
import { supplierStatus } from "@/features/suppliers/suppliersStatus";

/**
 * «Постачальники» — друга вкладка «Інтеграцій» (картка 259).
 *
 * Зверху — пошук по товарах усіх під'єднаних джерел, нижче — картки стану за
 * зразком сусідньої вкладки, унизу — черга на під'єднання.
 *
 * ТУЛБАР ВІДДАЄТЬСЯ В ШАПКУ, а не малюється в тілі: смуга з вкладками мусить
 * стояти на тому самому місці, що й у сервісів, і не з'їжджати вниз, поки
 * вантажиться зведення. Висоту макет резервує за `pageSurfaces` ще до першого
 * кадру сторінки.
 */
const CONNECTED = SUPPLIER_DEFINITIONS.filter((definition) => !definition.planned);
const PLANNED = SUPPLIER_DEFINITIONS.filter((definition) => definition.planned);

export default function SuppliersPage() {
  const summary = useSupplierPoolSummary();
  const bySlug = useMemo(
    () => new Map((summary.data ?? []).map((row) => [row.supplier_slug, row])),
    [summary.data]
  );
  const refreshedAgo = formatAgo(summary.dataUpdatedAt ? new Date(summary.dataUpdatedAt).toISOString() : null);

  usePageHeaderActions(
    <UnifiedPageToolbar
      topLeft={<IntegrationsTabs />}
      topRight={
        <div className="flex items-center gap-3">
          {refreshedAgo ? <span className="text-2xs text-muted-foreground">Оновлено {refreshedAgo}</span> : null}
          <Button variant="outline" size="sm" onClick={() => void summary.refetch()} loading={summary.isFetching}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Оновити
          </Button>
        </div>
      }
    />,
    [refreshedAgo, summary.isFetching]
  );

  return (
    <div className="pb-10">
      <SupplierProductSearch />

      {summary.isError ? (
        <p className="mt-6 text-sm text-destructive">
          Не вдалося прочитати стан пулу — картки нижче без чисел.{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => void summary.refetch()}>
            Спробувати ще
          </button>
        </p>
      ) : null}

      {/*
        Заголовок розділу стоїть НАЗОВНІ перевірки на завантаження, а картки
        всередині: доти на час читання чисел показувався напис «Читаємо стан
        пулу…» замість секції, тож заголовок і сітка з'являлись разом і зсували
        все, що нижче. Тепер рухаються самі картки, і рухаються в межах своєї ж
        сітки — каркас той самий `CardsSkeleton`, що малює форма сторінки.
      */}
      <section className="mt-6">
        <div className="mb-3">
          <h2 className="text-xs font-semibold text-foreground">Під'єднані</h2>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Товари лежать у пулі й оновлюються за розкладом; клік по картці — паспорт кабінету й товари.
          </p>
        </div>
        {summary.isPending ? (
          <CardsSkeleton count={CONNECTED.length} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {CONNECTED.map((definition) => (
              <SupplierCard
                key={definition.id}
                definition={definition}
                status={supplierStatus(definition, bySlug.get(definition.slug) ?? null, new Date(), {
                  unavailable: summary.isError,
                })}
              />
            ))}
          </div>
        )}
      </section>

      {PLANNED.length > 0 ? (
        <section className="mt-8">
          <div className="mb-3">
            <h2 className="text-xs font-semibold text-foreground">Плануємо підключити</h2>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Ще не під'єднано: що відомо про сайт і що заважає.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {PLANNED.map((definition) => (
              <SupplierCard key={definition.id} definition={definition} status={supplierStatus(definition, null)} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
