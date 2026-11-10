import { Briefcase, Package, Plus } from "@/components/icons/appIcons";
import { cn } from "@/lib/utils";

/** Послуги, які замовляють найчастіше: клік додає рядок із готовою назвою. */
export const QUICK_SERVICES = ["Розробка дизайну", "Адаптація макета", "Фотозйомка", "Доставка"] as const;

const chipClass =
  "inline-flex h-7 items-center gap-1 rounded-full border border-line-strong px-2.5 text-xs text-foreground transition-colors hover:bg-tint disabled:pointer-events-none disabled:opacity-50";

export function ManualOrderQuickServices({
  onAdd,
  disabled,
  label = "Послуга одним кліком:",
  className,
}: {
  onAdd: (name: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {QUICK_SERVICES.map((name) => (
        <button key={name} type="button" className={chipClass} disabled={disabled} onClick={() => onAdd(name)}>
          <Plus className="h-3 w-3" aria-hidden /> {name}
        </button>
      ))}
    </div>
  );
}

/** Порожнє вікно: одразу видно, що замовляють не лише товар. */
export function ManualOrderEmptyStart({
  onProduct,
  onService,
  disabled,
}: {
  onProduct: () => void;
  onService: () => void;
  disabled?: boolean;
}) {
  const cardClass =
    "flex flex-col items-start gap-2 rounded-xl border border-line bg-card p-4 text-left transition-colors hover:border-line-strong hover:bg-tint disabled:pointer-events-none disabled:opacity-50";
  return (
    <div className="flex flex-1 flex-col justify-center gap-3 py-6">
      <p className="text-center text-sm font-medium">Що замовляють?</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" className={cardClass} disabled={disabled} onClick={onProduct}>
          <span className="grid h-9 w-9 place-items-center rounded-md border border-line">
            <Package className="h-4.5 w-4.5" aria-hidden />
          </span>
          <span className="text-sm font-semibold">Товар</span>
          <span className="text-xs text-muted-foreground">
            Посилання, каталог або назва. Фото, артикул і закупка підтягнуться самі.
          </span>
        </button>
        <button type="button" className={cardClass} disabled={disabled} onClick={onService}>
          <span className="grid h-9 w-9 place-items-center rounded-md border tone-icon-box-info">
            <Briefcase className="h-4.5 w-4.5" aria-hidden />
          </span>
          <span className="text-sm font-semibold">Послуга</span>
          <span className="text-xs text-muted-foreground">
            Дизайн, фотозйомка, адаптація макета. Без товару, закривається актом.
          </span>
        </button>
      </div>
    </div>
  );
}

/** Які документи вийдуть із замовлення лише на послуги. */
export function ManualOrderServiceDocuments({ cashless }: { cashless: boolean }) {
  const docs = cashless ? ["Рахунок", "СП · дизайн-послуги", "Акт"] : [];
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      {docs.length > 0 ? (
        <>
          Документи:
          {docs.map((doc) => (
            <span key={doc} className="rounded-full bg-muted px-2 py-0.5 text-foreground">
              {doc}
            </span>
          ))}
        </>
      ) : (
        "Лише послуги: без виробництва й доставки"
      )}
    </div>
  );
}
