/** Дати в договорі, СП і рахунку: «23 жовтня 2026 р.» і кінець дії договору. */

export const formatContractDateParts = (value?: string | null) => {
  const source = value ? new Date(value) : new Date();
  const date = Number.isNaN(source.getTime()) ? new Date() : source;
  // Окремо { month: "long" } дає називний «жовтень»; родовий «жовтня» — лише разом із днем.
  const monthLabel =
    new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long" })
      .formatToParts(date)
      .find((part) => part.type === "month")?.value ?? "";
  return {
    day: String(date.getDate()).padStart(2, "0"),
    monthLabel,
    year: String(date.getFullYear()),
    city: "м. Київ",
  };
};

export const formatContractEndDate = (value?: string | null) => {
  const source = value ? new Date(value) : new Date();
  const date = Number.isNaN(source.getTime()) ? new Date() : source;
  date.setFullYear(date.getFullYear() + 1);
  return date.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};
