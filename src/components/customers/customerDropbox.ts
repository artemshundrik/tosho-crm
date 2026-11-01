/**
 * Папка замовника в Dropbox: де вона лежить і як її відкрити.
 *
 * Посилання живе в колонках `dropbox_client_path` / `dropbox_shared_url`
 * замовника, а `localStorage` — запасна копія з часів, коли колонок ще не
 * було (`isMissingCustomerDropboxColumnsError`). Читачі: сторінка «Замовники»
 * (створити, привʼязати, відвʼязати) і панель замовника (лише показати).
 */

export type CustomerDropboxRow = {
  id: string;
  dropbox_client_path?: string | null;
  dropbox_shared_url?: string | null;
};

export type DropboxManageCreateClientResponse = {
  ok: boolean;
  clientPath?: string | null;
  clientSharedUrl?: string | null;
  sharedUrl?: string | null;
  error?: string | null;
};

export type CustomerDropboxLink = {
  clientPath: string;
  clientSharedUrl: string;
};

export type CustomerDropboxAction = "open" | "create" | "attach" | "detach";

export function getCustomerDropboxStorageKey(teamId: string) {
  return `customers-dropbox-links:${teamId}`;
}

export function readCustomerDropboxLinks(teamId: string): Record<string, CustomerDropboxLink> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(getCustomerDropboxStorageKey(teamId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CustomerDropboxLink>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeCustomerDropboxLinks(teamId: string, payload: Record<string, CustomerDropboxLink>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getCustomerDropboxStorageKey(teamId), JSON.stringify(payload));
  } catch {
    // ignore persistence issues
  }
}

export function normalizeCustomerDropboxPath(path: string) {
  return path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

export function buildCustomerDropboxClientPath(clientFolderName: string) {
  const normalizedFolderName = normalizeCustomerDropboxPath(clientFolderName);
  return `Tosho Team Folder/Замовники/${normalizedFolderName}`;
}

export function buildCustomerDropboxBrandPath(clientPath: string) {
  return `${normalizeCustomerDropboxPath(clientPath)}/Бренд`;
}

export function extractCustomerDropboxLinks(rows: CustomerDropboxRow[]) {
  const links: Record<string, CustomerDropboxLink> = {};
  rows.forEach((row) => {
    const clientPath = normalizeCustomerDropboxPath(row.dropbox_client_path ?? "");
    const sharedUrl = (row.dropbox_shared_url ?? "").trim();
    if (!row.id || !clientPath || !sharedUrl) return;
    links[row.id] = {
      clientPath,
      clientSharedUrl: sharedUrl,
    };
  });
  return links;
}

export function isMissingCustomerDropboxColumnsError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
        ? ((error as { message: string }).message)
        : "";
  return /column/i.test(message) && /dropbox_(client_path|brand_path|shared_url)/i.test(message);
}
