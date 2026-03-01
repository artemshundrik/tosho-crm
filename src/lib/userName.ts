type UserNameSource = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
  fallback?: string;
};

export type UserNameMetadata = {
  first_name?: unknown;
  last_name?: unknown;
  full_name?: unknown;
};

function normalizePart(value?: string | null) {
  return (value ?? "").trim();
}

function emailAlias(email?: string | null) {
  const local = (email ?? "").split("@")[0] ?? "";
  return local.trim();
}

export function splitFullName(fullName?: string | null): { firstName: string; lastName: string } {
  const normalized = normalizePart(fullName);
  if (!normalized) return { firstName: "", lastName: "" };
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function toFullName(firstName?: string | null, lastName?: string | null) {
  const first = normalizePart(firstName);
  const last = normalizePart(lastName);
  return [first, last].filter(Boolean).join(" ").trim();
}

export function formatUserShortName(source: UserNameSource) {
  const first = normalizePart(source.firstName);
  const last = normalizePart(source.lastName);
  const fallback = source.fallback?.trim() || "Користувач";

  if (first && last) {
    return `${first} ${last[0].toUpperCase()}.`;
  }
  if (first) return first;

  const { firstName: firstFromFull, lastName: lastFromFull } = splitFullName(source.fullName);
  if (firstFromFull && lastFromFull) {
    return `${firstFromFull} ${lastFromFull[0].toUpperCase()}.`;
  }
  if (firstFromFull) return firstFromFull;

  const alias = emailAlias(source.email);
  if (alias) return alias;
  return fallback;
}

export function buildUserNameFromMetadata(meta: UserNameMetadata | null | undefined, email?: string | null) {
  const firstName = typeof meta?.first_name === "string" ? meta.first_name : "";
  const lastName = typeof meta?.last_name === "string" ? meta.last_name : "";
  const fullName = typeof meta?.full_name === "string" ? meta.full_name : "";

  const resolvedFullName = toFullName(firstName, lastName) || normalizePart(fullName);
  const derived = splitFullName(resolvedFullName);
  const resolvedFirstName = normalizePart(firstName) || derived.firstName;
  const resolvedLastName = normalizePart(lastName) || derived.lastName;
  const displayName = formatUserShortName({
    firstName: resolvedFirstName,
    lastName: resolvedLastName,
    fullName: resolvedFullName,
    email,
  });

  return {
    firstName: resolvedFirstName,
    lastName: resolvedLastName,
    fullName: resolvedFullName,
    displayName,
  };
}

export function getInitialsFromName(name?: string | null, email?: string | null) {
  const normalized = normalizePart(name);
  if (normalized) {
    const parts = normalized.split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part[0]).join("");
    if (initials) return initials.toUpperCase();
    return normalized.slice(0, 2).toUpperCase();
  }
  const alias = emailAlias(email);
  if (alias) return alias.slice(0, 2).toUpperCase();
  return "U";
}
