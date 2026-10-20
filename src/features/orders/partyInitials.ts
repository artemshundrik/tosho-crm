/** Ініціали замовника чи менеджера для аватарки: перша й остання літери, «?» — коли імені немає. */
export const partyInitials = (value?: string | null) => {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
};
