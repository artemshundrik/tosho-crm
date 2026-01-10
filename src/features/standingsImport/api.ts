async function requestHtml(endpoint: string, url: string) {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });
}

export async function fetchTournamentHtml(url: string): Promise<string> {
  const primaryEndpoint = import.meta.env.PROD
    ? "/.netlify/functions/fetch-v9ky-standings"
    : "/api/fetch-v9ky-standings";
  const fallbackEndpoint =
    primaryEndpoint === "/api/fetch-v9ky-standings"
      ? "/.netlify/functions/fetch-v9ky-standings"
      : "/api/fetch-v9ky-standings";

  let response = await requestHtml(primaryEndpoint, url);
  if (response.status === 404) {
    response = await requestHtml(fallbackEndpoint, url);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to fetch HTML: ${response.status}`);
  }

  return response.text();
}
