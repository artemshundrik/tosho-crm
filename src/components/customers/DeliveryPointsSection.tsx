import * as React from "react";
import { MapPin, PlusCircle, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DELIVERY_POINT_TYPE_ICONS,
  DELIVERY_POINT_TYPE_OPTIONS,
  DELIVERY_RECIPIENT_TYPE_OPTIONS,
  type CustomerDeliveryPoint,
  type CustomerDeliveryPointType,
  type DeliveryRecipientType,
} from "@/lib/customerDeliveryPoints";
import { NpCityCombobox, NpWarehouseCombobox } from "@/components/customers/NovaPoshtaControls";

type DeliveryPointsSectionProps = {
  points: CustomerDeliveryPoint[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<CustomerDeliveryPoint>) => void;
  onSetDefault: (index: number) => void;
  /** ЄДРПОУ замовника — підказка/дефолт для організації-отримувача. */
  defaultEdrpou?: string;
};

const isAddressType = (type: CustomerDeliveryPointType) => type === "np_courier" || type === "other";

/**
 * «Логістика» в картці замовника/ліда: повторювані адреси доставки
 * (відділення/поштомат НП, адресна доставка) з контактною особою на кожній.
 * Спільний для CustomerDialog і LeadDialog. Поки що ручне введення; коли
 * підключимо НП API, місто/відділення стануть автокомплітом із довідника.
 */
export function DeliveryPointsSection({
  points,
  onAdd,
  onRemove,
  onUpdate,
  onSetDefault,
  defaultEdrpou,
}: DeliveryPointsSectionProps) {
  return (
    <section className="rounded-xl border border-border/50 bg-card/40 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-border/40 pb-2.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Адреси доставки
        </h4>
        <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={onAdd}>
          <PlusCircle className="mr-1 h-4 w-4" />
          Додати адресу
        </Button>
      </div>

      <div className="space-y-3">
        {points.length === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 bg-background/30 px-4 py-6 text-center transition-colors hover:border-border hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <MapPin className="h-5 w-5 text-muted-foreground/70" />
            <span className="text-sm text-muted-foreground">
              Ще немає адрес доставки. Додайте відділення Нової Пошти або адресу.
            </span>
          </button>
        ) : (
          points.map((point, index) => {
            const TypeIcon = DELIVERY_POINT_TYPE_ICONS[point.type];
            return (
              <div key={point.id} className="space-y-3 rounded-lg border border-border/50 bg-background/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <TypeIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Адреса {index + 1}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-8 gap-1 px-2 text-xs",
                        point.isDefault ? "text-foreground" : "text-muted-foreground"
                      )}
                      aria-pressed={point.isDefault}
                      onClick={() => onSetDefault(index)}
                    >
                      <Star className={cn("h-3.5 w-3.5", point.isDefault && "fill-amber-400 text-amber-400")} />
                      {point.isDefault ? "Основна" : "Зробити основною"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Видалити адресу ${index + 1}`}
                      onClick={() => onRemove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Тип доставки</Label>
                    <Select
                      value={point.type}
                      onValueChange={(value) => onUpdate(index, { type: value as CustomerDeliveryPointType })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DELIVERY_POINT_TYPE_OPTIONS.map((option) => {
                          const OptionIcon = DELIVERY_POINT_TYPE_ICONS[option.value];
                          return (
                            <SelectItem key={option.value} value={option.value}>
                              <span className="inline-flex items-center gap-1.5">
                                <OptionIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                {option.label}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Місто / населений пункт</Label>
                    <NpCityCombobox
                      city={point.city}
                      onCityChange={(city) => onUpdate(index, { city, npCityRef: null, npWarehouseRef: null })}
                      onSelect={(settlement) =>
                        onUpdate(index, {
                          city: settlement.present,
                          npCityRef: settlement.ref,
                          address: "",
                          npWarehouseRef: null,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>{isAddressType(point.type) ? "Адреса" : "Відділення / поштомат"}</Label>
                  {point.type === "np_branch" || point.type === "np_postomat" ? (
                    <NpWarehouseCombobox
                      cityRef={point.npCityRef ?? ""}
                      postomat={point.type === "np_postomat"}
                      value={point.address}
                      onValueChange={(address) => onUpdate(index, { address, npWarehouseRef: null })}
                      onSelect={(warehouse) =>
                        onUpdate(index, { address: warehouse.description, npWarehouseRef: warehouse.ref })
                      }
                    />
                  ) : (
                    <Input
                      value={point.address}
                      onChange={(e) => onUpdate(index, { address: e.target.value })}
                      placeholder="Вулиця, будинок, квартира/офіс"
                      className="h-9"
                    />
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Отримувач</Label>
                    <Select
                      value={point.recipientType}
                      onValueChange={(value) =>
                        onUpdate(index, { recipientType: value as DeliveryRecipientType })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DELIVERY_RECIPIENT_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {point.recipientType === "organization" ? (
                    <div className="grid gap-2">
                      <Label>ЄДРПОУ отримувача</Label>
                      <Input
                        value={point.recipientEdrpou || defaultEdrpou || ""}
                        onChange={(e) => onUpdate(index, { recipientEdrpou: e.target.value })}
                        placeholder="8 цифр"
                        inputMode="numeric"
                        className="h-9"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>{point.recipientType === "organization" ? "Ім'я контактної особи" : "Ім'я отримувача"}</Label>
                    <Input
                      value={point.contactFirstName}
                      onChange={(e) => onUpdate(index, { contactFirstName: e.target.value })}
                      placeholder="Іван"
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Прізвище</Label>
                    <Input
                      value={point.contactLastName}
                      onChange={(e) => onUpdate(index, { contactLastName: e.target.value })}
                      placeholder="Петренко"
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Телефон</Label>
                    <Input
                      value={point.contactPhone}
                      onChange={(e) => onUpdate(index, { contactPhone: e.target.value })}
                      placeholder="+380..."
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Коментар</Label>
                  <AutoTextarea
                    value={point.comment}
                    onChange={(e) => onUpdate(index, { comment: e.target.value })}
                    placeholder="Напр. дзвонити за годину до відправки"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
