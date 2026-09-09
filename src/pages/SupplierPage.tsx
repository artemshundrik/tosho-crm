import { Link, useParams } from "react-router-dom";

import { ROUTES } from "@/layout/routes";
import { supplierById } from "@/features/suppliers/suppliersCatalog";

/** Сторінка одного постачальника (картка 259). Каркас; паспорт і товари — далі. */
export default function SupplierPage() {
  const { id } = useParams<{ id: string }>();
  const definition = id ? supplierById(id) : null;

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

  return (
    <div className="pb-10">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">{definition.name}</h1>
      <p className="mt-1 text-xs text-muted-foreground">{definition.sells}</p>
    </div>
  );
}
