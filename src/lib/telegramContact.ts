export const normalizeTelegramUsername = (value: string | null | undefined): string => {
  if (!value) return "";
  let next = value.trim();
  if (!next) return "";
  next = next.replace(/^https?:\/\/(?:www\.)?(?:t|telegram)\.me\//i, "");
  next = next.replace(/^(?:t|telegram)\.me\//i, "");
  next = next.replace(/^@+/, "");
  next = next.split(/[\s/?#]/, 1)[0] ?? "";
  return next;
};

export const formatTelegramHandle = (value: string | null | undefined): string => {
  const username = normalizeTelegramUsername(value);
  return username ? `@${username}` : "";
};

export const buildTelegramHref = (value: string | null | undefined): string | null => {
  const username = normalizeTelegramUsername(value);
  return username ? `https://t.me/${username}` : null;
};
