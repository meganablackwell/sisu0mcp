# Sisu MCP Connector for Claude

A small MCP server that connects Claude to your Sisu account through the Sisu REST API. It runs free on Vercel, so you don't need Sunburst.

## What Claude can do

| Area | Tools |
|---|---|
| Team | `sisu_ping`, `sisu_get_team`, `sisu_list_agents`, `sisu_get_markets` |
| Transactions | `sisu_search_transactions`, `sisu_find_transaction_by_email`, `sisu_get_transaction`, `sisu_get_agent_transactions_by_status`, `sisu_create_transaction`, `sisu_update_transaction`, `sisu_get_transaction_comments`, `sisu_add_transaction_comment`, `sisu_get_transaction_commission` |
| Contacts | `sisu_search_contacts` |
| Activities | `sisu_get_activities`, `sisu_get_activity_types`, `sisu_log_activity` |
| Stats | `sisu_get_agent_stats`, `sisu_get_team_stats`, `sisu_get_agent_goals`, `sisu_get_lead_sources` |
| Tasks | `sisu_get_tasks`, `sisu_create_task` |
| Anything else | `sisu_api_request`, which calls any endpoint in https://docs.sisu.co/reference |

## Setup

### 1. Get your Sisu API token
1. Go to **https://my.sisu.co/admin/api-credentials**. You need admin access.
2. Generate credentials, then copy the **Authorization token**. That's the value that goes after `Authorization: Basic`.

### 2. Put the code on GitHub
1. Go to **https://github.com/new**.
2. Name the repo `sisu-mcp` and set it to **Private**. Leave the README box unchecked. Click **Create repository**.
3. On the next page, click **uploading an existing file**.
4. Unzip `sisu-mcp.zip` on your computer. Open the `sisu-mcp` folder, select **everything inside it**, and drag it all into the GitHub page. Include the `app` and `lib` folders, and drag the files themselves, not the outer folder.
5. Click **Commit changes**.

### 3. Deploy on Vercel
1. Go to **https://vercel.com/new**. Sign in with GitHub, and allow Vercel to see the `sisu-mcp` repo.
2. Click **Import** next to `sisu-mcp`. Vercel detects the framework as Next.js automatically.
3. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `SISU_API_TOKEN` | Your token from step 1 |
   | `MCP_SECRET` | A long random password, at least 24 characters |
   | `SISU_TEAM_ID` | *(optional)* Your Sisu team ID |
   | `SISU_AGENT_ID` | *(optional)* Your Sisu agent ID |

4. Click **Deploy**. When it finishes, copy your domain, for example `sisu-mcp-abc.vercel.app`.

### 4. Add it to Claude
1. In Claude, go to **Settings → Connectors**. In the app, this may be **Customize → Connectors**.
2. Click **Add custom connector**.
3. Set the name to **Sisu**.
4. Set the URL to `https://YOUR-DOMAIN.vercel.app/api/YOUR_MCP_SECRET/mcp`.
5. Click **Add**, and leave the OAuth fields blank.
6. In a chat, click **+ → Connectors** and turn on **Sisu**. Then try: *"Ping Sisu"*, then *"List my team's agents."*

If you don't know your team or agent ID, ask Claude to run `sisu_list_agents` or `sisu_get_team`, then add the IDs to Vercel as `SISU_TEAM_ID` and `SISU_AGENT_ID`. After changing environment variables, go to **Deployments → ⋯ → Redeploy**.

## Security notes
- **Your connector URL works like a password.** Anyone who has it can read and change your Sisu data, so don't share it. To revoke access, change `MCP_SECRET` in Vercel and redeploy.
- If `MCP_SECRET` is missing or shorter than 24 characters, the server refuses every request.
- Your Sisu token is stored only in Vercel's encrypted environment variables. It never goes into GitHub.

## Testing safely
To try the connector against Sisu's staging copy first, set `SISU_BASE_URL=https://staging.sisu.co`.
