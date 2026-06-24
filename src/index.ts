#!/usr/bin/env node

/**
 * LinkedIn Pages MCP Server
 *
 * Read-only access to LinkedIn organization (Company Page) analytics via the
 * Community Management API. Deliberately scoped to AGGREGATE Page reporting
 * data — the category LinkedIn permits storing for up to a year — and avoids
 * individual member-level data (which is cache-only and non-exportable under
 * LinkedIn's data-storage terms). No write/posting tools.
 *
 * Tools:
 *   check_connection        — verify token; list Pages you administer
 *   list_organizations      — Company Pages the authed member can manage
 *   get_organization        — Page profile + total follower count
 *   get_follower_statistics — follower growth + demographic breakdowns
 *   get_page_statistics     — page views / unique visitors (by section/device)
 *   get_share_statistics    — post/share impressions, clicks, engagement
 *   list_posts              — an organization's posts (content + metadata)
 *   refresh_token           — mint a fresh access/refresh token pair
 *
 * Part of The SEO Engine toolkit by Lantern Row. https://lanternrow.com
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getConfig, resolveOrgId } from "./config.js";
import { liGet, refreshTokens, encodeUrn, orgUrn, timeIntervals } from "./client.js";

const server = new McpServer({ name: "linkedin-pages-mcp", version: "1.0.0" });

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
}

const FINDER = { "X-RestLi-Method": "FINDER" };

// Shared schema fragment for time-bounded statistics queries.
const timeRangeShape = {
  start_ms: z.number().int().optional().describe("Range start, ms since epoch. Omit for a lifetime/aggregate query."),
  end_ms: z.number().int().optional().describe("Range end, ms since epoch. Omit for a lifetime/aggregate query."),
  granularity: z.enum(["DAY", "WEEK", "MONTH"]).default("DAY").describe("Time bucket size for time-bound queries."),
};

// ─── Connection / discovery ───────────────────────────────────────

server.tool(
  "check_connection",
  "Verify the LinkedIn API token works and list the Company Pages the authenticated member administers. Lightweight call to confirm credentials + access.",
  {},
  async () => {
    try {
      const cfg = getConfig();
      const res = await liGet<{ elements?: unknown[] }>(
        "/organizationAcls",
        "q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
        FINDER
      );
      return ok({
        connected: true,
        apiVersion: cfg.version,
        adminPageCount: res.elements?.length ?? 0,
        adminPages: res.elements ?? [],
      });
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "list_organizations",
  "List the Company Pages (organizations) the authenticated member can manage, with their URNs/ids. Use these ids with the analytics tools.",
  {},
  async () => {
    try {
      const res = await liGet<{ elements?: unknown[] }>(
        "/organizationAcls",
        "q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
        FINDER
      );
      return ok({ organizations: res.elements ?? [] });
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "get_organization",
  "Get a Company Page's profile (name, vanity, description) plus its total follower count.",
  { organization_id: z.string().optional().describe("Numeric Company Page id. Defaults to LINKEDIN_ORGANIZATION_ID.") },
  async (args) => {
    try {
      const id = resolveOrgId(args.organization_id);
      const profile = await liGet(`/organizations/${id}`);
      // networkSizes gives the live follower count (followerStatistics no longer returns totals).
      const size = await liGet(
        `/networkSizes/${encodeUrn(orgUrn(id))}`,
        "edgeType=CompanyFollowedByMember"
      ).catch(() => null);
      return ok({ profile, followerCount: size });
    } catch (err) {
      return fail(err);
    }
  }
);

// ─── Analytics ────────────────────────────────────────────────────

server.tool(
  "get_follower_statistics",
  "Follower analytics for a Company Page. Lifetime mode (omit start/end) returns demographic breakdowns by seniority, function, industry, company size, and geography. Time-bound mode returns organic/paid follower gains per bucket.",
  { organization_id: z.string().optional().describe("Numeric Company Page id. Defaults to LINKEDIN_ORGANIZATION_ID."), ...timeRangeShape },
  async (args) => {
    try {
      const urn = orgUrn(resolveOrgId(args.organization_id));
      let q = `q=organizationalEntity&organizationalEntity=${encodeUrn(urn)}`;
      const ti = timeIntervals(args.start_ms, args.end_ms, args.granularity);
      if (ti) q += `&timeIntervals=${ti}`;
      return ok(await liGet("/organizationalEntityFollowerStatistics", q));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "get_page_statistics",
  "Page view analytics for a Company Page: views and unique visitors, split by section (overview/careers/jobs/life) and device (desktop/mobile), plus visitor demographics. Lifetime or time-bound (DAY/MONTH).",
  { organization_id: z.string().optional().describe("Numeric Company Page id. Defaults to LINKEDIN_ORGANIZATION_ID."), ...timeRangeShape },
  async (args) => {
    try {
      const urn = orgUrn(resolveOrgId(args.organization_id));
      let q = `q=organization&organization=${encodeUrn(urn)}`;
      const ti = timeIntervals(args.start_ms, args.end_ms, args.granularity);
      if (ti) q += `&timeIntervals=${ti}`;
      return ok(await liGet("/organizationPageStatistics", q));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "get_share_statistics",
  "Organic post/share analytics for a Company Page: impressions, unique impressions, clicks, reactions, comments, shares, and engagement rate. Aggregate (omit start/end) or time-bound. Sponsored activity is excluded.",
  { organization_id: z.string().optional().describe("Numeric Company Page id. Defaults to LINKEDIN_ORGANIZATION_ID."), ...timeRangeShape },
  async (args) => {
    try {
      const urn = orgUrn(resolveOrgId(args.organization_id));
      let q = `q=organizationalEntity&organizationalEntity=${encodeUrn(urn)}`;
      const ti = timeIntervals(args.start_ms, args.end_ms, args.granularity);
      if (ti) q += `&timeIntervals=${ti}`;
      return ok(await liGet("/organizationalEntityShareStatistics", q));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "list_posts",
  "List an organization's posts (content + metadata: text, timestamps, lifecycle, distribution). Take a returned post id and pass it to per-post share statistics for engagement.",
  {
    organization_id: z.string().optional().describe("Numeric Company Page id. Defaults to LINKEDIN_ORGANIZATION_ID."),
    count: z.number().int().min(1).max(100).default(20).describe("Posts per page (max 100)."),
    sort_by: z.enum(["LAST_MODIFIED", "CREATED"]).default("LAST_MODIFIED"),
  },
  async (args) => {
    try {
      const urn = orgUrn(resolveOrgId(args.organization_id));
      const q = `q=author&author=${encodeUrn(urn)}&count=${args.count}&sortBy=${args.sort_by}`;
      return ok(await liGet("/posts", q, FINDER));
    } catch (err) {
      return fail(err);
    }
  }
);

// ─── Token utility ────────────────────────────────────────────────

server.tool(
  "refresh_token",
  "Mint a fresh LinkedIn access token (and refresh token) from the configured refresh credentials. Returns the new values to persist into your .env. Requires LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_REFRESH_TOKEN.",
  {},
  async () => {
    try {
      const data = await refreshTokens();
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  }
);

// ─── Start ────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LinkedIn Pages MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
