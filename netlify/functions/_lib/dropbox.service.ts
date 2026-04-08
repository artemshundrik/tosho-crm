const DROPBOX_API_BASE_URL = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT_API_BASE_URL = "https://content.dropboxapi.com/2";
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const CLIENTS_ROOT_PATH = "/Tosho Team Folder/Замовники";

type DropboxTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

type DropboxListFolderEntry = {
  ".tag": string;
  id?: string;
  name?: string;
  path_display?: string;
  path_lower?: string;
};

type DropboxListFolderResult = {
  entries: DropboxListFolderEntry[];
  cursor?: string;
  has_more?: boolean;
};

type DropboxSharedLinkMetadata = {
  url: string;
  id?: string;
  name?: string;
  path_lower?: string;
};

type DropboxMetadata = {
  ".tag": string;
  id?: string;
  name?: string;
  path_display?: string;
  path_lower?: string;
};

type DropboxApiError = Error & {
  status?: number;
  details?: unknown;
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;
let cachedRootNamespaceId: string | null = null;

function requireEnv(name: "DROPBOX_APP_KEY" | "DROPBOX_APP_SECRET" | "DROPBOX_REFRESH_TOKEN") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function toDropboxError(message: string, status?: number, details?: unknown): DropboxApiError {
  const error = new Error(message) as DropboxApiError;
  error.status = status;
  error.details = details;
  return error;
}

function normalizeDropboxPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("Dropbox path is required");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function joinDropboxPath(...parts: string[]) {
  return normalizeDropboxPath(parts.map((part) => part.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/"));
}

function normalizeDropboxName(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[<>:"|?*\u0000-\u001f]/g, " ")
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return normalized || fallback;
}

function isPathConflictError(error: unknown) {
  return error instanceof Error && error.message.includes("path/conflict");
}

function isTooManyWriteOperationsError(error: unknown) {
  return error instanceof Error && error.message.includes("too_many_write_operations");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshAccessToken() {
  const appKey = requireEnv("DROPBOX_APP_KEY");
  const appSecret = requireEnv("DROPBOX_APP_SECRET");
  const refreshToken = requireEnv("DROPBOX_REFRESH_TOKEN");

  const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: appKey,
      client_secret: appSecret,
    }),
  });

  const payload = (await response.json().catch(() => null)) as DropboxTokenResponse | { error_description?: string } | null;
  if (!response.ok || !payload || !("access_token" in payload)) {
    throw toDropboxError(
      `Dropbox token refresh failed${typeof payload?.error_description === "string" ? `: ${payload.error_description}` : ""}`,
      response.status,
      payload
    );
  }

  cachedAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };

  return cachedAccessToken.value;
}

async function getAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now()) {
    return cachedAccessToken.value;
  }
  return await refreshAccessToken();
}

async function getRootNamespaceId() {
  if (cachedRootNamespaceId) return cachedRootNamespaceId;

  const accessToken = await getAccessToken();
  const response = await fetch(`${DROPBOX_API_BASE_URL}/users/get_current_account`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "null",
  });

  const payload = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { root_info?: { root_namespace_id?: string } })
    | { error_summary?: string }
    | null;

  if (!response.ok || !payload || !("root_info" in payload) || !payload.root_info?.root_namespace_id) {
    throw toDropboxError(
      `Dropbox request failed for /users/get_current_account${typeof payload === "object" && payload && "error_summary" in payload && typeof payload.error_summary === "string" ? `: ${payload.error_summary}` : ""}`,
      response.status,
      payload
    );
  }

  cachedRootNamespaceId = payload.root_info.root_namespace_id;
  return cachedRootNamespaceId;
}

async function dropboxApiRequest<T>(
  path: string,
  body: Record<string, unknown> | null,
  options?: { content?: boolean; usePathRoot?: boolean }
) {
  const accessToken = await getAccessToken();
  const baseUrl = options?.content ? DROPBOX_CONTENT_API_BASE_URL : DROPBOX_API_BASE_URL;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  if (options?.usePathRoot) {
    const rootNamespaceId = await getRootNamespaceId();
    headers["Dropbox-API-Path-Root"] = JSON.stringify({
      ".tag": "root",
      root: rootNamespaceId,
    });
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: body === null ? "null" : JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as T | { error_summary?: string } | null;
  if (!response.ok) {
    throw toDropboxError(
      `Dropbox request failed for ${path}${typeof payload === "object" && payload && "error_summary" in payload && typeof payload.error_summary === "string" ? `: ${payload.error_summary}` : ""}`,
      response.status,
      payload
    );
  }

  return payload as T;
}

async function dropboxContentUpload<T>(path: string, body: ArrayBuffer | Uint8Array | Buffer, apiArg: Record<string, unknown>) {
  const accessToken = await getAccessToken();
  const rootNamespaceId = await getRootNamespaceId();
  const response = await fetch(`${DROPBOX_CONTENT_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Arg": JSON.stringify(apiArg),
      "Dropbox-API-Path-Root": JSON.stringify({
        ".tag": "root",
        root: rootNamespaceId,
      }),
      "Content-Type": "application/octet-stream",
    },
    body,
  });

  const payload = (await response.json().catch(() => null)) as T | { error_summary?: string } | null;
  if (!response.ok) {
    throw toDropboxError(
      `Dropbox request failed for ${path}${typeof payload === "object" && payload && "error_summary" in payload && typeof payload.error_summary === "string" ? `: ${payload.error_summary}` : ""}`,
      response.status,
      payload
    );
  }

  return payload as T;
}

async function getCurrentAccount() {
  return await dropboxApiRequest<Record<string, unknown>>("/users/get_current_account", null);
}

async function listFolder(dropboxPath: string) {
  const normalizedPath = normalizeDropboxPath(dropboxPath);
  return await dropboxApiRequest<DropboxListFolderResult>("/files/list_folder", {
    path: normalizedPath,
    recursive: false,
    include_deleted: false,
    include_has_explicit_shared_members: false,
    include_mounted_folders: true,
    include_non_downloadable_files: true,
  }, {
    usePathRoot: true,
  });
}

async function listFolderBySharedLink(sharedUrl: string, path = "") {
  const trimmedUrl = sharedUrl.trim();
  if (!trimmedUrl) throw new Error("Dropbox shared URL is required");
  return await dropboxApiRequest<DropboxListFolderResult>("/files/list_folder", {
    path,
    shared_link: {
      url: trimmedUrl,
    },
    recursive: false,
    include_deleted: false,
    include_mounted_folders: true,
    include_non_downloadable_files: true,
  });
}

async function createFolder(dropboxPath: string) {
  const normalizedPath = normalizeDropboxPath(dropboxPath);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await dropboxApiRequest<{ metadata: DropboxMetadata }>("/files/create_folder_v2", {
        path: normalizedPath,
        autorename: false,
      }, {
        usePathRoot: true,
      });
    } catch (error) {
      if (isPathConflictError(error)) {
        const existing = await listFolder(normalizedPath).catch(() => null);
        return {
          metadata: {
            ".tag": "folder",
            path_display: normalizedPath,
            path_lower: normalizedPath.toLowerCase(),
            name: normalizedPath.split("/").pop() ?? normalizedPath,
            id: existing?.entries?.[0]?.id,
          },
        };
      }

      if (isTooManyWriteOperationsError(error) && attempt < 3) {
        await sleep(250 * (attempt + 1));
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Не вдалося створити Dropbox-папку: ${normalizedPath}`);
}

async function createClientFolder(clientName: string) {
  const safeClientName = normalizeDropboxName(clientName, "Client");
  const clientPath = joinDropboxPath(CLIENTS_ROOT_PATH, safeClientName);
  const brandPath = joinDropboxPath(clientPath, "Бренд");
  const projectsPath = joinDropboxPath(clientPath, "Проєкти");

  await createFolder(clientPath);
  await createFolder(brandPath);
  await createFolder(projectsPath);

  return {
    clientName: safeClientName,
    clientPath,
    brandPath,
    projectsPath,
  };
}

async function createProjectFolder(clientPath: string, projectName: string) {
  const normalizedClientPath = normalizeDropboxPath(clientPath);
  const safeProjectName = normalizeDropboxName(projectName, "Project");
  const projectPath = joinDropboxPath(normalizedClientPath, "Проєкти", safeProjectName);
  await createFolder(projectPath);
  return {
    projectName: safeProjectName,
    projectPath,
  };
}

async function createSharedLink(dropboxPath: string) {
  const normalizedPath = normalizeDropboxPath(dropboxPath);
  return await dropboxApiRequest<DropboxSharedLinkMetadata>("/sharing/create_shared_link_with_settings", {
    path: normalizedPath,
    settings: {
      requested_visibility: "public",
      audience: "public",
      access: "viewer",
    },
  }, {
    usePathRoot: true,
  });
}

async function getExistingSharedLink(dropboxPath: string) {
  const normalizedPath = normalizeDropboxPath(dropboxPath);
  const result = await dropboxApiRequest<{ links?: DropboxSharedLinkMetadata[] }>("/sharing/list_shared_links", {
    path: normalizedPath,
    direct_only: true,
  }, {
    usePathRoot: true,
  });
  return Array.isArray(result.links) ? result.links[0] ?? null : null;
}

async function getOrCreateSharedLink(dropboxPath: string) {
  const existing = await getExistingSharedLink(dropboxPath);
  if (existing) return existing;
  return await createSharedLink(dropboxPath);
}

async function uploadFile(buffer: ArrayBuffer | Uint8Array | Buffer, dropboxPath: string) {
  const normalizedPath = normalizeDropboxPath(dropboxPath);
  return await dropboxContentUpload<DropboxMetadata>("/files/upload", buffer, {
    path: normalizedPath,
    mode: "add",
    autorename: true,
    mute: true,
    strict_conflict: false,
  });
}

async function deleteFile(dropboxPath: string) {
  const normalizedPath = normalizeDropboxPath(dropboxPath);
  return await dropboxApiRequest<{ metadata?: DropboxMetadata }>("/files/delete_v2", {
    path: normalizedPath,
  }, {
    usePathRoot: true,
  });
}

export const dropboxService = {
  connectAccount: getCurrentAccount,
  refreshAccessToken,
  getCurrentAccount,
  createFolder,
  createClientFolder,
  createProjectFolder,
  listFolder,
  listFolderBySharedLink,
  uploadFile,
  deleteFile,
  createSharedLink,
  getOrCreateSharedLink,
  normalizeDropboxName,
  joinDropboxPath,
};
