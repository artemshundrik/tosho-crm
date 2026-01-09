const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

function buildResponse(statusCode: number, body: string) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "text/html; charset=utf-8",
    },
    body,
  };
}

export const handler = async (event: any) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return buildResponse(405, "Method Not Allowed");
  }

  try {
    const payload = JSON.parse(event.body ?? "{}");
    const url = payload?.url;
    if (typeof url !== "string") {
      return buildResponse(400, "Missing url");
    }

    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "v9ky.in.ua") {
      return buildResponse(400, "Only https://v9ky.in.ua/ URLs are allowed");
    }

    const response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,*/*",
      },
    });

    if (!response.ok) {
      return buildResponse(
        response.status,
        `Failed to fetch ${parsed.toString()}: ${response.status} ${response.statusText}`,
      );
    }

    const html = await response.text();
    return buildResponse(200, html);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return buildResponse(500, message);
  }
};
