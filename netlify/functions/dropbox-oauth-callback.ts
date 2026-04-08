type HttpEvent = {
  httpMethod?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
};

function htmlResponse(statusCode: number, body: string) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod !== "GET") {
    return htmlResponse(405, "<h1>Method Not Allowed</h1>");
  }

  const code = event.queryStringParameters?.code?.trim() ?? "";
  const error = event.queryStringParameters?.error?.trim() ?? "";
  const errorDescription = event.queryStringParameters?.error_description?.trim() ?? "";

  if (error) {
    return htmlResponse(
      400,
      `<!doctype html>
      <html lang="en">
        <body style="font-family: sans-serif; padding: 24px;">
          <h1>Dropbox OAuth error</h1>
          <p><strong>${escapeHtml(error)}</strong></p>
          <p>${escapeHtml(errorDescription || "No description provided.")}</p>
        </body>
      </html>`
    );
  }

  if (!code) {
    return htmlResponse(
      400,
      `<!doctype html>
      <html lang="en">
        <body style="font-family: sans-serif; padding: 24px;">
          <h1>Missing OAuth code</h1>
          <p>Repeat the Dropbox authorization flow and allow access.</p>
        </body>
      </html>`
    );
  }

  return htmlResponse(
    200,
    `<!doctype html>
    <html lang="en">
      <body style="font-family: sans-serif; padding: 24px;">
        <h1>Dropbox OAuth code received</h1>
        <p>Copy this code and send it here:</p>
        <pre style="padding: 12px; background: #f5f5f5; border-radius: 8px; white-space: pre-wrap;">${escapeHtml(code)}</pre>
      </body>
    </html>`
  );
};
