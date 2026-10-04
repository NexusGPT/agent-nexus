import type { VibeGitCredentialParts } from "./credential-parts";

/**
 * One line in git-credential-store format, scoped to the host so the helper
 * never offers this token to any other origin.
 *
 * Returns `null` when `cloneUrl` is not a parseable https URL — the caller must
 * surface that rather than clone unauthenticated and fail confusingly.
 */
export function composeCredentialLine(credentials: VibeGitCredentialParts): string | null {
  let url: URL;
  try {
    url = new URL(credentials.cloneUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.host) return null;
  const user = encodeURIComponent(credentials.username);
  const token = encodeURIComponent(credentials.pushToken);
  return `https://${user}:${token}@${url.host}\n`;
}
