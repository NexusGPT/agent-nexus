import type { VibeGitCredentialParts } from "./credential-parts";

/**
 * One line in git-credential-store format, scoped to the host so the helper
 * never offers this token to any other origin.
 *
 * Returns `null` when `cloneUrlBase` is not a parseable https URL — the caller
 * must surface that rather than clone unauthenticated and fail confusingly.
 */
export function composeCredentialLine(credentials: VibeGitCredentialParts): string | null {
  let host: string;
  try {
    host = new URL(credentials.cloneUrlBase).host;
  } catch {
    return null;
  }
  if (!host) return null;
  const user = encodeURIComponent(credentials.username);
  const token = encodeURIComponent(credentials.pushToken);
  return `https://${user}:${token}@${host}\n`;
}
