import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { DELIVERY_TYPE_OPTIONS } from "@/features/quotes/quotes-page/config";
import {
  QuoteDeliveryFields,
  createEmptyQuoteDeliveryDetails,
  type QuoteDeliveryDetails,
} from "@/components/quotes/QuoteDeliveryFields";
import {
  appendDeliveryPointToParty,
  createEmptyCustomerDeliveryPoint,
  listPartyDeliveryPoints,
  npDeliveryTypeToPointType,
  splitContactName,
  type CustomerDeliveryPoint,
} from "@/lib/customerDeliveryPoints";
import { updateQuote } from "@/lib/toshoApi";
import { supabase } from "@/lib/supabaseClient";

export type OrderDeliverySnapshot = {
  deliveryType: string;
  deliveryDetails: QuoteDeliveryDetails;
};

/** quotes.delivery_details (jsonb) → типізований знімок форми. */
export const parseQuoteDeliveryDetails = (value: unknown): QuoteDeliveryDetails => {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const toStr = (entry: unknown) => (typeof entry === "string" ? entry : "");
  return {
    region: toStr(raw.region),
    city: toStr(raw.city),
    address: toStr(raw.address),
    street: toStr(raw.street),
    npDeliveryType: toStr(raw.npDeliveryType),
    payer: toStr(raw.payer),
    contactName: toStr(raw.contactName),
    contactPhone: toStr(raw.contactPhone),
    deliveryPointId: toStr(raw.deliveryPointId),
    npCityRef: toStr(raw.npCityRef),
    npWarehouseRef: toStr(raw.npWarehouseRef),
  };
};

type OrderDeliveryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  quoteId: string;
  /**
   * Замовлення без прорахунку: логістика живе на самому замовленні, бо рядка
   * в quotes для нього не існує. Тоді пишемо в tosho.orders за цим id.
   */
  orderId?: string | null;
  storeOnOrder?: boolean;
  partyType: "customer" | "lead";
  /** null — сторону не резолвлено (старі ліди): пікер збережених адрес недоступний. */
  partyId: string | null;
  initialDeliveryType: string;
  initialDetails: QuoteDeliveryDetails;
  onSaved: (snapshot: OrderDeliverySnapshot) => void;
};

/**
 * Зміна доставки на рівні замовлення. Пише в quotes.delivery_type /
 * delivery_details (замовлення читає доставку зі свого прорахунку), тож
 * прорахунок і замовлення завжди показують одне й те саме.
 */
export function OrderDeliveryDialog({
  open,
  onOpenChange,
  teamId,
  quoteId,
  orderId = null,
  storeOnOrder = false,
  partyType,
  partyId,
  initialDeliveryType,
  initialDetails,
  onSaved,
}: OrderDeliveryDialogProps) {
  const [deliveryType, setDeliveryType] = React.useState(initialDeliveryType);
  const [details, setDetails] = React.useState<QuoteDeliveryDetails>(initialDetails);
  const [savedPoints, setSavedPoints] = React.useState<CustomerDeliveryPoint[]>([]);
  const [saveToCard, setSaveToCard] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDeliveryType(initialDeliveryType);
    setDetails(initialDetails);
    setSaveToCard(true);
  }, [open, initialDeliveryType, initialDetails]);

  React.useEffect(() => {
    if (!open || !partyId) {
      setSavedPoints([]);
      return;
    }
    let cancelled = false;
    listPartyDeliveryPoints({ teamId, partyType, partyId })
      .then((points) => {
        if (!cancelled) setSavedPoints(points);
      })
      .catch((error) => {
        console.warn("Failed to load party delivery points", error);
        if (!cancelled) setSavedPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, teamId, partyType, partyId]);

  const handleSave = async () => {
    const trim = (value?: string) => value?.trim() ?? "";
    if (deliveryType === "nova_poshta") {
      if (!trim(details.city)) {
        toast.error("Для Нової пошти заповніть місто");
        return;
      }
      if (!trim(details.npDeliveryType)) {
        toast.error("Для Нової пошти оберіть тип доставки");
        return;
      }
      if (details.npDeliveryType === "address" && !trim(details.street)) {
        toast.error("Для адресної доставки заповніть вулицю");
        return;
      }
    }
    if (deliveryType === "taxi" && (!trim(details.city) || !trim(details.address))) {
      toast.error("Для таксі / Uklon заповніть місто та адресу");
      return;
    }
    if (deliveryType === "cargo" && (!trim(details.city) || !trim(details.address))) {
      toast.error("Для вантажного перевезення заповніть місто та адресу");
      return;
    }

    const sanitized: QuoteDeliveryDetails = {
      ...createEmptyQuoteDeliveryDetails(),
      payer: trim(details.payer),
    };
    if (deliveryType === "nova_poshta") {
      sanitized.region = trim(details.region);
      sanitized.city = trim(details.city);
      sanitized.npDeliveryType = trim(details.npDeliveryType);
      sanitized.street = sanitized.npDeliveryType === "address" ? trim(details.street) : "";
      sanitized.address = sanitized.npDeliveryType === "address" ? "" : trim(details.address);
      sanitized.contactName = trim(details.contactName);
      sanitized.contactPhone = trim(details.contactPhone);
      sanitized.deliveryPointId = trim(details.deliveryPointId);
      sanitized.npCityRef = trim(details.npCityRef);
      sanitized.npWarehouseRef = trim(details.npWarehouseRef);
    }
    if (deliveryType === "taxi" || deliveryType === "cargo") {
      sanitized.region = deliveryType === "cargo" ? trim(details.region) : "";
      sanitized.city = trim(details.city);
      sanitized.address = trim(details.address);
    }

    setSaving(true);
    try {
      if (
        deliveryType === "nova_poshta" &&
        saveToCard &&
        !sanitized.deliveryPointId &&
        partyId &&
        (sanitized.city || sanitized.address || sanitized.street)
      ) {
        const pointType = npDeliveryTypeToPointType(sanitized.npDeliveryType);
        if (pointType) {
          try {
            sanitized.deliveryPointId = await appendDeliveryPointToParty({
              teamId,
              partyType,
              partyId,
              point: {
                ...createEmptyCustomerDeliveryPoint(),
                type: pointType,
                city: sanitized.city,
                address: pointType === "np_courier" ? sanitized.street : sanitized.address,
                contactFirstName: splitContactName(sanitized.contactName ?? "").first,
                contactLastName: splitContactName(sanitized.contactName ?? "").last,
                contactPhone: sanitized.contactPhone ?? "",
                npCityRef: sanitized.npCityRef || null,
                npWarehouseRef: sanitized.npWarehouseRef || null,
              },
            });
          } catch (saveError) {
            console.warn("Failed to save delivery point to party card", saveError);
            toast.warning("Адресу не вдалося зберегти в картку клієнта.");
          }
        }
      }

      if (storeOnOrder && orderId) {
        const deliveryPatch = { delivery_type: deliveryType || null, delivery_details: sanitized };
        const { error: orderError } = await supabase
          .schema("tosho")
          .from("orders")
          .update(deliveryPatch)
          .eq("id", orderId)
          .eq("team_id", teamId);
        if (orderError) throw orderError;
      } else {
        await updateQuote({
          quoteId,
          teamId,
          deliveryType: deliveryType || null,
          deliveryDetails: sanitized,
        });
      }
      onSaved({ deliveryType, deliveryDetails: sanitized });
      onOpenChange(false);
      toast.success("Доставку оновлено");
    } catch (error) {
      console.warn("Failed to update order delivery", error);
      toast.error("Не вдалося зберегти доставку. Спробуйте ще раз.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Доставка замовлення</DialogTitle>
          <DialogDescription>
            {storeOnOrder
              ? "Зберігається в самому замовленні — воно створене без прорахунку."
              : "Змінюється і в прорахунку — замовлення та прорахунок показують одну адресу."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Спосіб доставки</div>
            <Select
              value={deliveryType || undefined}
              onValueChange={(value) => {
                setDeliveryType(value);
                setDetails(createEmptyQuoteDeliveryDetails());
                setSaveToCard(true);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Оберіть спосіб доставки" />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {deliveryType ? (
            <QuoteDeliveryFields
              deliveryType={deliveryType}
              details={details}
              onChange={(patch) => setDetails((prev) => ({ ...prev, ...patch }))}
              savedPoints={savedPoints}
              saveToCard={saveToCard}
              onSaveToCardChange={setSaveToCard}
              canSaveToCard={Boolean(partyId)}
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Скасувати
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Зберегти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
