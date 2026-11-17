const baseUrl = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");

export type Connection = "checking" | "ready" | "database-unavailable" | "unavailable";

export async function checkConnection(signal: AbortSignal): Promise<Connection> {
  const response = await fetch(baseUrl + "/ready", { signal });
  const body: { status?: unknown; dependencies?: { database?: unknown } } = await response.json();
  if (response.ok && body.status === "ready" && body.dependencies?.database === "ok") return "ready";
  if (response.status === 503 && body.status === "not_ready" && body.dependencies?.database === "unavailable") {
    return "database-unavailable";
  }
  return "unavailable";
}
