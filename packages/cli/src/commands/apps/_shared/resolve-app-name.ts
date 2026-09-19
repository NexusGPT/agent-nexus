/**
 * Validate the app name client-side for a clear message before the request.
 * Mirrors VibeAppNameSchema (DNS-label: lowercase letter start, then
 * lowercase alnum + hyphen, ≤ 63). The server re-validates.
 */
export function resolveAppName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0 || name.length > 63 || !/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(
      `Invalid app name "${raw}". Must start with a lowercase letter and contain only lowercase letters, digits, and hyphens (≤ 63 chars).`
    );
  }
  return name;
}
