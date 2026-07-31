const API_BASE = typeof window !== "undefined" && window.location.hostname === "localhost" ? "http://localhost:8000" : "https://api.prodrank.app";

export async function api(path: string, options?: RequestInit) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error: ${res.status}`);
  }
  return res.json();
}
