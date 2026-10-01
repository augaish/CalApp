// Stand-in for src/lib/api.ts in Node tests: identity calls succeed quietly.
export const SERVER_URL = 'http://127.0.0.1:0';
let installId: string | null = null;
export function setInstallId(id: string | null) { installId = id; }
export function currentRef() { return installId; }
export async function linkInstall(_id: string) { return true; }
export async function identifyEmail(_email: string) {}
/** WHOOP summary through global fetch, so a test can answer it. */
export async function fetchWhoopSummary() {
  try {
    const res = await fetch(`${SERVER_URL}/api/whoop/summary`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
export function setAccessTokenProvider(_fn: (() => Promise<string | null>) | null) {}
