import { z } from "zod";
import { sisu, defaultTeamId, defaultAgentId, type HttpMethod } from "./sisu";

// Loose type for the server object handed to us by mcp-handler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Server = any;

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
});
const run = (fn: () => Promise<unknown>) => fn().then(ok, fail);

const teamId = z.number().int().optional().describe("Sisu team ID (defaults to SISU_TEAM_ID)");
const agentId = z.number().int().optional().describe("Sisu agent ID (defaults to SISU_AGENT_ID)");
const dateStr = z.string().describe("Date as YYYY-MM-DD");

const READ = { readOnlyHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

export function registerSisuTools(server: Server) {
  // ---------- General ----------
  server.registerTool(
    "sisu_ping",
    { title: "Ping Sisu", description: "Check the connection and credentials to the Sisu API.", inputSchema: z.object({}), annotations: READ },
    () => run(() => sisu("GET", "/api/v1/ping-test")),
  );

  // ---------- Team / agents ----------
  server.registerTool(
    "sisu_get_team",
    { title: "Get team", description: "Team details: name, settings, royalty cap, associated orgs.", inputSchema: z.object({ team_id: teamId }), annotations: READ },
    ({ team_id }: { team_id?: number }) => run(() => sisu("GET", "/api/v1/team/info", { query: { team_id: defaultTeamId(team_id) } })),
  );

  server.registerTool(
    "sisu_list_agents",
    { title: "List agents", description: "List the agents on a team (IDs, names, emails). Use this to find agent_id values.", inputSchema: z.object({ team_id: teamId }), annotations: READ },
    ({ team_id }: { team_id?: number }) =>
      run(() => {
        const t = team_id ?? (process.env.SISU_TEAM_ID ? Number(process.env.SISU_TEAM_ID) : undefined);
        return t ? sisu("GET", `/api/v1/team/get-team-agents/${t}`) : sisu("GET", "/api/v1/team/get-team-agents");
      }),
  );

  server.registerTool(
    "sisu_get_markets",
    { title: "Get markets", description: "List markets (market_id is needed for activity tools).", inputSchema: z.object({}), annotations: READ },
    () => run(() => sisu("GET", "/api/v1/get-markets")),
  );

  // ---------- Transactions ----------
  server.registerTool(
    "sisu_search_transactions",
    {
      title: "Search transactions",
      description:
        "Search/paginate team transactions (clients/deals) via POST /api/v2/team/get-team-clients. Pass a Sisu 'filter' object for advanced filtering, or a saved_filter ID from the Sisu UI.",
      inputSchema: z.object({
        team_id: teamId,
        agent_id: agentId.describe("Agent the search runs as (usually an admin); defaults to SISU_AGENT_ID"),
        saved_filter: z.number().int().optional(),
        filter: z.record(z.string(), z.unknown()).optional().describe("Sisu filter object"),
        include_agent_info: z.boolean().optional(),
        include_totals: z.boolean().optional(),
        lighter: z.boolean().optional().describe("Return lighter records"),
      }),
      annotations: READ,
    },
    (a: Record<string, unknown> & { team_id?: number; agent_id?: number }) =>
      run(() =>
        sisu("POST", "/api/v2/team/get-team-clients", {
          body: { ...a, team_id: defaultTeamId(a.team_id), agent_id: a.agent_id ?? (process.env.SISU_AGENT_ID ? Number(process.env.SISU_AGENT_ID) : undefined) },
        }),
      ),
  );

  server.registerTool(
    "sisu_find_transaction_by_email",
    {
      title: "Find transaction by email",
      description: "Find a transaction by the client's email address.",
      inputSchema: z.object({ email: z.string(), created_after: z.string().optional(), updated_after: z.string().optional(), case_sensitive: z.boolean().optional() }),
      annotations: READ,
    },
    (a: Record<string, unknown>) => run(() => sisu("POST", "/api/v1/client/find-client", { body: a })),
  );

  server.registerTool(
    "sisu_get_transaction",
    { title: "Get transaction", description: "Get full details of one transaction by ID.", inputSchema: z.object({ transaction_id: z.number().int() }), annotations: READ },
    ({ transaction_id }: { transaction_id: number }) => run(() => sisu("GET", `/api/v1/client/edit-client/${transaction_id}`)),
  );

  server.registerTool(
    "sisu_get_agent_transactions_by_status",
    {
      title: "Get agent transactions by status",
      description: "List an agent's transactions with a given status/stage value as Sisu defines it.",
      inputSchema: z.object({ agent_id: agentId, status: z.string() }),
      annotations: READ,
    },
    ({ agent_id, status }: { agent_id?: number; status: string }) =>
      run(() => sisu("GET", `/api/v1/agent/get-clients/${defaultAgentId(agent_id)}/${encodeURIComponent(status)}`)),
  );

  const txnFields = z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    type_id: z.enum(["s", "b"]).optional().describe("'s' seller/listing, 'b' buyer"),
    email: z.string().optional(),
    mobile_phone: z.string().optional(),
    address_1: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    trans_amt: z.number().optional().describe("Sale price"),
    commission_rate: z.number().optional(),
    gross_commission_amt: z.number().optional(),
    commission_amt: z.number().optional(),
    lead_type_id: z.number().int().optional(),
    agent_id: z.number().int().optional(),
    appt_dt: z.string().optional(),
    appt_set_dt: z.string().optional(),
    signed_dt: z.string().optional(),
    uc_dt: z.string().optional().describe("Under contract date"),
    closed_dt: z.string().optional(),
    lead_dt: z.string().optional(),
    status: z.enum(["N", "D"]).optional().describe("'N' normal, 'D' archived"),
    extra: z.record(z.string(), z.unknown()).optional().describe("Any other Sisu transaction fields"),
  });

  server.registerTool(
    "sisu_update_transaction",
    {
      title: "Update transaction",
      description:
        "Update a transaction. Sisu requires first_name, last_name and type_id on update, so fetch the transaction first and include them.",
      inputSchema: txnFields.extend({ transaction_id: z.number().int() }),
      annotations: WRITE,
    },
    ({ transaction_id, extra, ...rest }: { transaction_id: number; extra?: Record<string, unknown> }) =>
      run(() => sisu("PUT", `/api/v1/client/edit-client/${transaction_id}`, { body: { ...rest, ...(extra || {}) } })),
  );

  server.registerTool(
    "sisu_create_transaction",
    {
      title: "Create transaction",
      description: "Create a new transaction (client/deal) for an agent. Requires first_name, last_name, type_id.",
      inputSchema: txnFields.extend({ first_name: z.string(), last_name: z.string(), type_id: z.enum(["s", "b"]), for_agent_id: agentId }),
      annotations: WRITE,
    },
    ({ for_agent_id, extra, ...rest }: { for_agent_id?: number; extra?: Record<string, unknown> }) =>
      run(() => sisu("POST", `/api/v1/client/edit-client/${defaultAgentId(for_agent_id)}`, { body: { ...rest, ...(extra || {}) } })),
  );

  server.registerTool(
    "sisu_get_transaction_comments",
    { title: "Get transaction comments", description: "Read notes/comments on a transaction.", inputSchema: z.object({ transaction_id: z.number().int() }), annotations: READ },
    ({ transaction_id }: { transaction_id: number }) => run(() => sisu("GET", `/api/v1/client/${transaction_id}/comments`)),
  );

  server.registerTool(
    "sisu_add_transaction_comment",
    {
      title: "Add transaction comment",
      description: "Add a note/comment to a transaction.",
      inputSchema: z.object({ transaction_id: z.number().int(), comment: z.string(), agent_id: agentId }),
      annotations: WRITE,
    },
    ({ transaction_id, comment, agent_id }: { transaction_id: number; comment: string; agent_id?: number }) =>
      run(() =>
        sisu("POST", `/api/v1/client/${transaction_id}/comments`, {
          body: { comment_value: comment, client_id: transaction_id, agent_id: defaultAgentId(agent_id) },
        }),
      ),
  );

  server.registerTool(
    "sisu_get_transaction_commission",
    { title: "Get transaction commission", description: "Commission info for a transaction.", inputSchema: z.object({ transaction_id: z.number().int() }), annotations: READ },
    ({ transaction_id }: { transaction_id: number }) => run(() => sisu("GET", `/api/v1/client/commission-info/${transaction_id}`)),
  );

  // ---------- Contacts ----------
  server.registerTool(
    "sisu_search_contacts",
    {
      title: "Search contacts",
      description: "Search contacts by name, email, phone, city, agent, etc.",
      inputSchema: z.object({
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        email: z.string().optional(),
        mobile_phone: z.string().optional(),
        city: z.string().optional(),
        agent_id: z.number().int().optional(),
        contact_id: z.number().int().optional(),
        status: z.enum(["N", "D"]).optional(),
        page: z.number().int().optional(),
        per_page: z.number().int().max(1000).optional(),
      }),
      annotations: READ,
    },
    (q: Record<string, unknown>) => run(() => sisu("GET", "/api/v1/contact", { query: q })),
  );

  // ---------- Activities ----------
  server.registerTool(
    "sisu_get_activities",
    {
      title: "Get agent activities",
      description: "Get an agent's tracked activities (calls, appointments, etc.) for a market.",
      inputSchema: z.object({ agent_id: agentId, market_id: z.number().int() }),
      annotations: READ,
    },
    ({ agent_id, market_id }: { agent_id?: number; market_id: number }) =>
      run(() => sisu("GET", `/api/v1/agent/activity/${defaultAgentId(agent_id)}/${market_id}`)),
  );

  server.registerTool(
    "sisu_get_activity_types",
    { title: "Get team activity types", description: "List the team's activity types (the activity_type codes to log against).", inputSchema: z.object({ team_id: teamId }), annotations: READ },
    ({ team_id }: { team_id?: number }) => run(() => sisu("GET", `/api/v1/team/activity-types/${defaultTeamId(team_id)}`)),
  );

  server.registerTool(
    "sisu_log_activity",
    {
      title: "Log activity",
      description: "Add to an agent's activity counter (e.g. log 25 calls today). Get activity_type codes from sisu_get_activity_types.",
      inputSchema: z.object({
        agent_id: agentId,
        market_id: z.number().int(),
        activity_type: z.string(),
        counter: z.union([z.number(), z.string()]).describe("Amount to add, or a duration like '01:30:00'"),
        date: z.string().describe("YYYY-MM-DD, or 'today' / 'yesterday'"),
      }),
      annotations: WRITE,
    },
    ({ agent_id, market_id, ...rest }: { agent_id?: number; market_id: number }) =>
      run(() => sisu("POST", `/api/v1/agent/addto-activity/${defaultAgentId(agent_id)}/${market_id}`, { body: { market_id, ...rest } })),
  );

  // ---------- Stats / goals / leaderboard ----------
  server.registerTool(
    "sisu_get_agent_stats",
    {
      title: "Get agent stats",
      description: "Production, GCI, appointments, lead source ROI, etc. for one agent over a date range.",
      inputSchema: z.object({
        team_id: teamId,
        agent_id: agentId,
        method: z.enum([
          "activity", "all_production_counts", "all_production_counts_by_agent", "production_lost", "average_trans_amt",
          "average_dom", "average_dom_by_type", "gci", "average_commission_percent", "average_gci_and_commission",
          "appointments", "dashboard", "days_tracked", "last_active", "consecutive_days", "team_income", "expenses",
          "team_production", "lead_source_roi", "price_change", "lead_source_roi_by_lead_source", "lead_sources",
          "team_agent_lead_sources", "commissions",
        ]),
        start_date: dateStr,
        end_date: dateStr,
        is_isa: z.boolean().optional(),
      }),
      annotations: READ,
    },
    ({ team_id, agent_id, ...body }: { team_id?: number; agent_id?: number }) =>
      run(() => sisu("POST", `/api/v1/team/get-stats/${defaultTeamId(team_id)}/${defaultAgentId(agent_id)}`, { body })),
  );

  server.registerTool(
    "sisu_get_team_stats",
    {
      title: "Get team stats",
      description: "Team-wide stats over a date range. Uses the same 'method' values as sisu_get_agent_stats.",
      inputSchema: z.object({ team_id: teamId, method: z.string(), start_date: dateStr, end_date: dateStr, extra: z.record(z.string(), z.unknown()).optional() }),
      annotations: READ,
    },
    ({ team_id, extra, ...body }: { team_id?: number; extra?: Record<string, unknown> }) =>
      run(() => sisu("POST", `/api/v1/team/get-stats/${defaultTeamId(team_id)}`, { body: { ...body, ...(extra || {}) } })),
  );

  server.registerTool(
    "sisu_get_agent_goals",
    {
      title: "Get agent goals",
      description: "An agent's goals for a given year and month.",
      inputSchema: z.object({ agent_id: agentId, year: z.number().int(), month: z.number().int().min(1).max(12) }),
      annotations: READ,
    },
    ({ agent_id, year, month }: { agent_id?: number; year: number; month: number }) =>
      run(() => sisu("GET", `/api/v1/agent/goals/${defaultAgentId(agent_id)}/${year}/${month}`)),
  );

  server.registerTool(
    "sisu_get_lead_sources",
    { title: "Get lead sources", description: "List the team's lead sources.", inputSchema: z.object({ team_id: teamId }), annotations: READ },
    ({ team_id }: { team_id?: number }) => run(() => sisu("GET", `/api/v1/team/lead-sources/${defaultTeamId(team_id)}`)),
  );

  // ---------- Tasks ----------
  server.registerTool(
    "sisu_get_tasks",
    { title: "Get transaction tasks", description: "List tasks for a transaction (client).", inputSchema: z.object({ client_id: z.number().int().describe("Transaction ID") }), annotations: READ },
    ({ client_id }: { client_id: number }) => run(() => sisu("GET", `/api/v1/tasks/${client_id}`)),
  );

  server.registerTool(
    "sisu_create_task",
    {
      title: "Create task",
      description: "Create a task on a transaction.",
      inputSchema: z.object({
        client_id: z.number().int().describe("Transaction ID"),
        name: z.string(),
        dscr: z.string().optional().describe("Description"),
        due_dt: z.string().optional().describe("YYYY-MM-DD"),
        agent_id: agentId,
        assigned_to_agent_id: z.number().int().optional(),
        task_type: z.string().optional(),
      }),
      annotations: WRITE,
    },
    ({ agent_id, ...rest }: { agent_id?: number }) =>
      run(() => sisu("POST", "/api/v1/transactions/task/add-task", { body: { ...rest, agent_id: defaultAgentId(agent_id) } })),
  );

  // ---------- Escape hatch: any endpoint ----------
  server.registerTool(
    "sisu_api_request",
    {
      title: "Raw Sisu API request",
      description:
        "Call ANY Sisu API endpoint directly (see https://docs.sisu.co/reference). Path like '/api/v1/team/vendor'. Use this for endpoints without a dedicated tool. Confirm with the user before DELETE requests.",
      inputSchema: z.object({
        method: z.enum(["GET", "POST", "PUT", "DELETE"]),
        path: z.string(),
        query: z.record(z.string(), z.unknown()).optional(),
        body: z.unknown().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    ({ method, path, query, body }: { method: HttpMethod; path: string; query?: Record<string, unknown>; body?: unknown }) =>
      run(() => sisu(method, path, { query, body })),
  );
}
