// Minimal Sisu REST client. Docs: https://docs.sisu.co/docs/getting-started

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

function baseUrl(): string {
  return (process.env.SISU_BASE_URL || "https://api.sisu.co").replace(/\/+$/, "");
}

function authHeader(): string {
  const raw = (process.env.SISU_API_TOKEN || "").trim();
  if (raw) return raw.toLowerCase().startsWith("basic ") ? raw : `Basic ${raw}`;
  // Fallback: username + token, base64-encoded per RFC 7617
  const user = process.env.SISU_USERNAME;
  const pass = process.env.SISU_PASSWORD_TOKEN;
  if (user && pass) return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  throw new Error("Sisu credentials missing: set SISU_API_TOKEN in Vercel environment variables.");
}

export function defaultTeamId(v?: number): number {
  const id = v ?? (process.env.SISU_TEAM_ID ? Number(process.env.SISU_TEAM_ID) : undefined);
  if (!id) throw new Error("team_id is required (or set SISU_TEAM_ID in Vercel).");
  return id;
}

export function defaultAgentId(v?: number): number {
  const id = v ?? (process.env.SISU_AGENT_ID ? Number(process.env.SISU_AGENT_ID) : undefined);
  if (!id) throw new Error("agent_id is required (or set SISU_AGENT_ID in Vercel).");
  return id;
}

export async function sisu(
  method: HttpMethod,
  path: string,
  opts: { query?: Record<string, unknown>; body?: unknown } = {},
): Promise<unknown> {
  // Only allow calls to the Sisu API itself.
  let p = path.trim();
  if (/^https?:\/\//i.test(p)) throw new Error("Pass a path like /api/v1/team/info, not a full URL.");
  if (!p.startsWith("/")) p = "/" + p;
  if (!p.startsWith("/api/")) p = "/api" + p; // allow "/v1/..." shorthand
  if (p.includes("..")) throw new Error("Invalid path.");

  const url = new URL(baseUrl() + p);
  for (const [k, v] of Object.entries(opts.query || {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  // Sisu reports errors in the body via status_code (0 = success, negative = failure)
  const sc = (data as { status_code?: number } | null)?.status_code;
  if (!res.ok || (typeof sc === "number" && sc < 0)) {
    const msg = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`Sisu ${method} ${p} failed (HTTP ${res.status}): ${msg.slice(0, 2000)}`);
  }
  return data;
}
