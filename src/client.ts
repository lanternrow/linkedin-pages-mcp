/**
 * LinkedIn REST API client (Community Management API).
 *
 * Base: https://api.linkedin.com/rest/  — JSON over HTTPS, Rest.li protocol 2.0.0.
 * Every request requires the versioned `Linkedin-Version: YYYYMM` header.
 *
 * Token model: 60-day access token + 365-day refresh token. If refresh
 * credentials are configured, a 401 triggers one automatic refresh + retry;
 * the new access token is held in memory for the rest of the process. Use the
 * refresh_token tool to mint a fresh pair to persist into your .env.
 *
 * SECURITY: the bearer token is never logged. Errors surface LinkedIn's
 * status + service error code/message, never the Authorization header.
 *
 * NOTE: This targets the documented API surface (li-lms-2026-06). It cannot be
 * exercised live until the app is approved for the Community Management API;
 * request shapes are built to spec and should be validated against a real token
 * once Development-tier access is granted.
 */

import { getConfig } from "./config.js";

const BASE = "https://api.linkedin.com/rest";
const OAUTH_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";

// In-memory access token, seeded from config; updated on refresh.
let liveToken: string | null = null;

function token(): string {
  return liveToken ?? getConfig().accessToken;
}

function baseHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${token()}`,
    "Linkedin-Version": getConfig().version,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

/** URL-encode a URN for safe inclusion in a Rest.li query value. */
export function encodeUrn(urn: string): string {
  return encodeURIComponent(urn);
}

/** Build an organization URN from a numeric id. */
export function orgUrn(id: string): string {
  return `urn:li:organization:${id}`;
}

/**
 * Build a Rest.li `timeIntervals` value, or return undefined for a lifetime query.
 * @param start ms since epoch
 * @param end   ms since epoch
 * @param granularity DAY | WEEK | MONTH
 */
export function timeIntervals(
  start?: number,
  end?: number,
  granularity: "DAY" | "WEEK" | "MONTH" = "DAY"
): string | undefined {
  if (start === undefined || end === undefined) return undefined;
  return `(timeRange:(start:${start},end:${end}),timeGranularityType:${granularity})`;
}

async function attemptRefresh(): Promise<boolean> {
  const cfg = getConfig();
  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) return false;

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cfg.refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) return false;
  liveToken = data.access_token;
  return true;
}

/**
 * GET a Community Management endpoint.
 * @param path  e.g. "/organizationalEntityShareStatistics"
 * @param query raw, already Rest.li-formatted query string (URNs pre-encoded)
 */
export async function liGet<T = unknown>(
  path: string,
  query = "",
  extraHeaders: Record<string, string> = {}
): Promise<T> {
  const url = `${BASE}${path}${query ? `?${query}` : ""}`;
  const headers = () => ({ ...baseHeaders(), ...extraHeaders });

  let res = await fetch(url, { method: "GET", headers: headers() });

  // One automatic refresh + retry on auth failure.
  if (res.status === 401 && (await attemptRefresh())) {
    res = await fetch(url, { method: "GET", headers: headers() });
  }

  const text = await res.text();
  if (!res.ok) {
    // LinkedIn returns JSON errors: { status, code, message, serviceErrorCode }
    let detail = text.slice(0, 500);
    try {
      const j = JSON.parse(text);
      detail = `${j.serviceErrorCode ?? j.code ?? ""} ${j.message ?? ""}`.trim() || detail;
    } catch {
      /* keep raw */
    }
    throw new Error(`LinkedIn API ${res.status} on ${path}: ${detail}`);
  }

  return (text ? JSON.parse(text) : {}) as T;
}

/** Exchange the refresh token for a fresh access+refresh pair (for persisting). */
export async function refreshTokens(): Promise<Record<string, unknown>> {
  const cfg = getConfig();
  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
    throw new Error(
      "Token refresh needs LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_REFRESH_TOKEN."
    );
  }
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cfg.refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token refresh failed ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text) as { access_token?: string };
  if (data.access_token) liveToken = data.access_token;
  return data;
}
