import { createEmptyCustomerDeliveryPoint, type CustomerDeliveryPoint } from "@/lib/customerDeliveryPoints";
import { DeliveryPointsSection } from "../DeliveryPointsSection";

/** Адреси доставки сторінки замовника: правка списку з однією основною. */
export function DeliveryEditor(props: {
  points: CustomerDeliveryPoint[];
  defaultEdrpou?: string;
  onChange: (points: CustomerDeliveryPoint[]) => void;
}) {
  const { points, onChange } = props;
  return (
    <DeliveryPointsSection
      points={points}
      defaultEdrpou={props.defaultEdrpou}
      onAdd={() => onChange([...points, { ...createEmptyCustomerDeliveryPoint(), isDefault: points.length === 0 }])}
      onRemove={(index) => {
        const next = points.filter((_, at) => at !== index);
        // Прибрали основну — основною стає перша з решти.
        if (next.length > 0 && !next.some((point) => point.isDefault)) next[0] = { ...next[0], isDefault: true };
        onChange(next);
      }}
      onUpdate={(index, patch) => onChange(points.map((point, at) => (at === index ? { ...point, ...patch } : point)))}
      onSetDefault={(index) => onChange(points.map((point, at) => ({ ...point, isDefault: at === index })))}
    />
  );
}
