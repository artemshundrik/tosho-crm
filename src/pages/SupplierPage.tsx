import { ChevronLeft, ExternalLink, KeyRound } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { EntityAvatar } from "@/components/app/avatar-kit";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/layout/routes";
import { faviconUrl } from "@/lib/brandFavicon";

import { contractorForSupplier, useSupplierContractors, useSupplierPoolSummary } from "@/features/suppliers/queries";
import { SupplierPassport } from "@/features/suppliers/SupplierPassport";
import { SupplierProducts } from "@/features/suppliers/SupplierProducts";
import { supplierById } from "@/features/suppliers/suppliersCatalog";
import {
  SUPPLIER_STATE_ICON,
  SUPPLIER_STATE_LABEL,
  SUPPLIER_STATE_TONE,
  supplierStatus,
} from "@/features/suppliers/suppliersStatus";

/**
 * Сторінка одного постачальника (картка 259): шапка, паспорт кабінету,
 * контакт із картки підрядника; товари — окремою секцією нижче. Окрема
 * адреса, а не шторка: під список товарів потрібна ширина.
 */
export default function SupplierPage() {
  const { id } = useParams<{ id: string }>();
  const definition = id ? supplierById(id) : null;
  const summary = useSupplierPoolSummary();
  const contractors = useSupplierContractors();

  if (!definition) {
    return (
      <div className="pb-10">
        <p className="mt-6 text-sm text-muted-foreground">Такого постачальника немає.</p>
        <Link to={ROUTES.suppliers} className="mt-2 inline-block text-sm underline underline-offset-2">
          До списку постачальників
        </Link>
      </div>
    );
  }

  const row = summary.data?.find((item) => item.supplier_slug === definition.slug) ?? null;
  const status = supplierStatus(definition, row, new Date(), { unavailable: summary.isError });
  const contractor = contractorForSupplier(definition, row, contractors.data);
  const StateIcon = SUPPLIER_STATE_ICON[status.state];

  return (
    <div className="pb-10">
      <Link
        to={ROUTES.suppliers}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Постачальники
      </Link>

      <header className="mt-3 flex flex-wrap items-start gap-4">
        <EntityAvatar src={faviconUrl(definition.slug)} name={definition.name} size={40} className="shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{definition.name}</h1>
            <Badge tone={SUPPLIER_STATE_TONE[status.state]} size="sm" className="gap-1">
              <StateIcon className="h-3 w-3" aria-hidden="true" />
              {SUPPLIER_STATE_LABEL[status.state]}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <a href={definition.siteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {definition.slug}
            </a>
            {" · "}
            {definition.sells}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={definition.siteUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Сайт
            </a>
          </Button>
          {definition.cabinetUrl ? (
            <Button asChild variant="outline" size="sm">
              <a href={definition.cabinetUrl} target="_blank" rel="noopener noreferrer">
                <KeyRound className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Кабінет
              </a>
            </Button>
          ) : null}
        </div>
      </header>

      {summary.isPending ? (
        <AppSectionLoader label="Читаємо стан пулу…" className="mt-6" />
      ) : (
        <div className="mt-6">
          <SupplierPassport definition={definition} status={status} contractor={contractor} />
        </div>
      )}

      {!definition.planned ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">Товари</h2>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Усе, що лежить у пулі від цього постачальника, — і те, чого немає в пошуку прорахунку.
          </p>
          <SupplierProducts definition={definition} className="mt-3" />
        </section>
      ) : null}
    </div>
  );
}
