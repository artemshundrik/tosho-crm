/** Помилки PostgREST, коли в базі ще немає таблиць або колонок замовлень. */
export const isMissingOrdersRelationMessage = (message?: string | null) => {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("relation") &&
    (normalized.includes("orders") || normalized.includes("order_items"))
  );
};

export const isMissingOrdersColumnMessage = (message?: string | null) => {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("column") || normalized.includes("schema cache") || normalized.includes("could not find");
};
