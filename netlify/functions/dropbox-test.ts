import { dropboxService } from "./_lib/dropbox.service";

type HttpEvent = {
  httpMethod?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod && event.httpMethod !== "GET") return jsonResponse(405, { error: "Method Not Allowed" });

  const requestedPath = event.queryStringParameters?.path?.trim() || "Tosho Team Folder/Замовники/LG";
  const sharedUrl = process.env.VITE_DROPBOX_TEST_SHARED_URL?.trim() || "";

  try {
    const account = await dropboxService.getCurrentAccount();

    let pathFolder: Awaited<ReturnType<typeof dropboxService.listFolder>> | null = null;
    let pathSharedLink: string | null = null;
    let pathError: string | null = null;

    try {
      const [folder, sharedLink] = await Promise.all([
        dropboxService.listFolder(requestedPath),
        dropboxService.getOrCreateSharedLink(requestedPath),
      ]);
      pathFolder = folder;
      pathSharedLink = sharedLink.url;
    } catch (error) {
      pathError = error instanceof Error ? error.message : "Path-based Dropbox access failed";
    }

    const sharedFolder = sharedUrl ? await dropboxService.listFolderBySharedLink(sharedUrl) : null;

    return jsonResponse(200, {
      ok: true,
      requestedPath,
      pathAccess: {
        ok: !!pathFolder,
        error: pathError,
        sharedLink: pathSharedLink,
        entries: pathFolder?.entries.map((entry) => ({
          tag: entry[".tag"] ?? null,
          id: entry.id ?? null,
          name: entry.name ?? null,
          path_display: entry.path_display ?? null,
        })) ?? [],
      },
      account: {
        account_id: account.account_id,
        email: account.email,
        name: typeof account.name === "object" && account.name ? (account.name as { display_name?: string }).display_name ?? null : null,
      },
      sharedLinkAccess: {
        url: sharedUrl || null,
        entries: sharedFolder?.entries.map((entry) => ({
          tag: entry[".tag"] ?? null,
          id: entry.id ?? null,
          name: entry.name ?? null,
          path_display: entry.path_display ?? null,
        })) ?? [],
        has_more: sharedFolder?.has_more ?? false,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      requestedPath,
      error: error instanceof Error ? error.message : "Unknown Dropbox error",
      status: typeof error === "object" && error && "status" in error ? (error as { status?: number }).status ?? null : null,
      details: typeof error === "object" && error && "details" in error ? (error as { details?: unknown }).details ?? null : null,
    });
  }
};
