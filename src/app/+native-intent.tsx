/**
 * A sign-in coming back from Google lands on calapp://auth-callback. The
 * browser sheet catches it, but Android also hands the link to the app — send
 * it nowhere in particular instead of to a "page not found".
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (path.includes('auth-callback')) return '/';
  return path;
}
