import type { MountSession } from "./mount-session";

/**
 * How early the helper reports `Expiration` relative to the real `expiresAt`.
 *
 * The AWS SDK reruns `credential_process` on the first request AT OR AFTER the
 * reported instant and adds no margin of its own, so this lead is the whole
 * window in which an upload already in flight finishes on credentials that are
 * still valid. Five minutes is also the helper's own freshness test: a session
 * inside the lead is stale and re-minted, never served.
 */
export const EXPIRATION_LEAD_MS = 5 * 60 * 1000;

/** The one document `credential-process` prints: AWS's process-credentials shape. */
export interface ProcessCredentialsDocument {
  readonly Version: 1;
  readonly AccessKeyId: string;
  readonly SecretAccessKey: string;
  readonly SessionToken: string;
  /** ISO 8601 — `expiresAt` brought forward by {@link EXPIRATION_LEAD_MS}. */
  readonly Expiration: string;
}

/** The instant the helper tells the SDK the credential expires. */
export function reportedExpiration(session: Pick<MountSession, "expiresAt">): Date {
  return new Date(new Date(session.expiresAt).getTime() - EXPIRATION_LEAD_MS);
}

/** True while the session can still be served without a re-mint. */
export function isFresh(session: Pick<MountSession, "expiresAt">, now: Date): boolean {
  return reportedExpiration(session).getTime() > now.getTime();
}

/**
 * The document for a session that is still fresh, or null for one that is
 * not. Null rather than a document with a past `Expiration`: the SDK treats an
 * expired answer as already stale and reruns the helper on EVERY request, so
 * emitting one turns a Finder listing into a storm of helper processes.
 */
export function processCredentialsDocument(
  session: MountSession,
  now: Date
): ProcessCredentialsDocument | null {
  if (!isFresh(session, now)) return null;
  return {
    Version: 1,
    AccessKeyId: session.credentials.accessKeyId,
    SecretAccessKey: session.credentials.secretAccessKey,
    SessionToken: session.credentials.sessionToken,
    Expiration: reportedExpiration(session).toISOString()
  };
}
