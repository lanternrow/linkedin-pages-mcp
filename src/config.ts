/**
 * LinkedIn Pages MCP configuration.
 *
 * Credentials are read from environment variables ONLY — never hard-coded,
 * never logged, never written to disk by this server.
 *
 * Required:
 *   LINKEDIN_ACCESS_TOKEN   — 3-legged member token (Page admin consented)
 *
 * Optional (enable automatic token refresh):
 *   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REFRESH_TOKEN
 *
 * Optional:
 *   LINKEDIN_ORGANIZATION_ID — default Company Page numeric id
 *   LINKEDIN_VERSION         — API version YYYYMM (defaults below)
 */

export interface LinkedInConfig {
  accessToken: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  defaultOrgId?: string;
  version: string;
}

// Latest known-good versioned API at build time. LinkedIn sunsets versions
// roughly yearly; override with LINKEDIN_VERSION when migrating.
const DEFAULT_VERSION = "202606";

let cached: LinkedInConfig | null = null;

export function getConfig(): LinkedInConfig {
  if (cached) return cached;

  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    throw new Error(
      "Missing required environment variable LINKEDIN_ACCESS_TOKEN. " +
        "Obtain it via the 3-legged OAuth flow with a Page-admin member, " +
        "and set it in the MCP server's env config."
    );
  }

  const version = process.env.LINKEDIN_VERSION?.trim() || DEFAULT_VERSION;
  if (!/^\d{6}$/.test(version)) {
    throw new Error(`LINKEDIN_VERSION must be in YYYYMM form (got "${version}").`);
  }

  cached = {
    accessToken,
    clientId: process.env.LINKEDIN_CLIENT_ID?.trim() || undefined,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET?.trim() || undefined,
    refreshToken: process.env.LINKEDIN_REFRESH_TOKEN?.trim() || undefined,
    defaultOrgId: process.env.LINKEDIN_ORGANIZATION_ID?.trim() || undefined,
    version,
  };
  return cached;
}

/** Resolve an org id from an explicit arg or the configured default. */
export function resolveOrgId(explicit?: string): string {
  const id = (explicit ?? getConfig().defaultOrgId ?? "").toString().trim();
  if (!id) {
    throw new Error(
      "No organization id provided and LINKEDIN_ORGANIZATION_ID is not set. " +
        "Pass an org id, or use list_organizations to find the Pages you administer."
    );
  }
  if (!/^\d+$/.test(id)) {
    throw new Error(`Organization id must be numeric (got "${id}").`);
  }
  return id;
}
