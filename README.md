# linkedin-pages-mcp

[![npm version](https://img.shields.io/npm/v/linkedin-pages-mcp.svg)](https://www.npmjs.com/package/linkedin-pages-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server for **LinkedIn organization (Company Page) analytics** via LinkedIn's [Community Management API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) — follower growth and demographics, page views, post/share engagement, and video stats, surfaced to your AI assistant for analysis the native dashboard can't do.

Built for [Claude Code](https://claude.ai/claude-code) and any MCP-compatible AI tool. Part of **[The SEO Engine](https://lanternrow.com)** toolkit by [Lantern Row](https://lanternrow.com).

## Scope & data policy

This server is intentionally **read-only and limited to aggregate Page reporting data** — the category LinkedIn permits storing for up to a year. It does **not** retrieve individual member-level data (who liked/commented and their profiles), which LinkedIn restricts to short-lived, in-app-only display and prohibits exporting. Keeping to aggregate Page metrics is both the compliant path and the genuinely useful one for trend analysis. There are no posting/write tools.

## Access requirements (important)

Unlike most MCPs, this needs an **approved LinkedIn developer app**:

1. A [LinkedIn developer app](https://www.linkedin.com/developers/) owned by a **registered business**, associated with and verified by your **Company Page**.
2. Approval for the **Community Management API** (Development tier to build, Standard tier for production — the latter requires a screencast demo).
3. A **Page admin** completes the 3-legged OAuth flow to produce an access token.

See LinkedIn's [app review process](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review). Organic Page analytics is a supported use case; there is no follower minimum or partner-status gate, but approval is a manual review.

## Configuration

```json
{
  "mcpServers": {
    "linkedin-pages": {
      "command": "npx",
      "args": ["-y", "linkedin-pages-mcp"],
      "env": {
        "LINKEDIN_ACCESS_TOKEN": "your_3legged_member_token",
        "LINKEDIN_CLIENT_ID": "your_app_client_id",
        "LINKEDIN_CLIENT_SECRET": "your_app_client_secret",
        "LINKEDIN_REFRESH_TOKEN": "your_refresh_token",
        "LINKEDIN_ORGANIZATION_ID": "1234567"
      }
    }
  }
}
```

`LINKEDIN_ACCESS_TOKEN` is the only hard requirement; the client id/secret/refresh trio enables automatic token refresh (access tokens last ~60 days).

## Tools

| Tool | Description |
|------|-------------|
| `check_connection` | Verify the token; list Company Pages you administer. |
| `list_organizations` | Company Pages the authenticated member can manage. |
| `get_organization` | Page profile + total follower count. |
| `get_follower_statistics` | Follower growth + demographic breakdowns (seniority, function, industry, size, geo). |
| `get_page_statistics` | Page views / unique visitors by section and device. |
| `get_share_statistics` | Organic post impressions, clicks, reactions, comments, shares, engagement rate. |
| `list_posts` | An organization's posts (content + metadata). |
| `refresh_token` | Mint a fresh access/refresh token pair to persist into your `.env`. |

Statistics tools accept an optional `start_ms`/`end_ms` time range with `DAY`/`WEEK`/`MONTH` granularity; omit the range for lifetime/aggregate figures.

## Notes

- **Versioned API:** requests send `Linkedin-Version` (default `202606`). LinkedIn sunsets versions roughly yearly — bump `LINKEDIN_VERSION` when migrating.
- **Security:** credentials come from environment variables only; the bearer token is never logged.

## License

MIT © [Lantern Row](https://lanternrow.com)
