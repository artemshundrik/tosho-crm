export async function fetchTournamentHtml(url: string): Promise<string> {
  const response = await fetch("/api/fetch-v9ky-standings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to fetch HTML: ${response.status}`);
  }

  return response.text();
}
