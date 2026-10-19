import { createMcpHandler } from "mcp-handler";
import { timingSafeEqual } from "node:crypto";
import { registerSisuTools } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const mcp = createMcpHandler(
  (server) => {
    registerSisuTools(server);
  },
  { serverInfo: { name: "sisu", version: "1.0.0" } },
);

function keyMatches(given: string): boolean {
  const secret = process.env.MCP_SECRET || "";
  if (secret.length < 24) return false; // refuse to run with a weak/missing secret
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handler(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  if (!keyMatches(key)) return new Response("Not found", { status: 404 });
  return mcp(req);
}

export { handler as GET, handler as POST, handler as DELETE };
