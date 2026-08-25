/**
 * WHOOP OAuth 2.0 — connecting a user's wearable so recovery/strain/sleep can
 * eventually inform the coach. This module only handles the auth round trip
 * (authorize URL, code-for-token exchange, refresh); pulling actual workout
 * data is a separate, later step once a connection exists.
 *
 * Endpoints confirmed via developer.whoop.com/docs/developing/oauth — WHOOP
 * uses a single URL for both the initial token exchange and refreshes.
 */
const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

/** Kept to the data the coach could plausibly use — see the playbook's wearable-sync entry. */
export const WHOOP_SCOPES = ['read:cycles', 'read:workout', 'read:recovery', 'read:sleep'];

export interface WhoopTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

function clientId(): string {
  const id = process.env.WHOOP_CLIENT_ID;
  if (!id) throw new Error('WHOOP_CLIENT_ID not set');
  return id;
}

function clientSecret(): string {
  const secret = process.env.WHOOP_CLIENT_SECRET;
  if (!secret) throw new Error('WHOOP_CLIENT_SECRET not set');
  return secret;
}

export function whoopConfigured(): boolean {
  return !!process.env.WHOOP_CLIENT_ID && !!process.env.WHOOP_CLIENT_SECRET;
}

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: WHOOP_SCOPES.join(' '),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function parseTokenResponse(res: Response): Promise<WhoopTokenResponse> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WHOOP token request failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
  };
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<WhoopTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId(),
      client_secret: clientSecret(),
    }),
  });
  return parseTokenResponse(res);
}

export async function refreshWhoopToken(refreshToken: string): Promise<WhoopTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      scope: WHOOP_SCOPES.join(' '),
    }),
  });
  return parseTokenResponse(res);
}
