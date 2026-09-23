import { isRecord } from "./is-record";
import { isMountAccess } from "./mount-access";
import { isMountId } from "./mount-id";
import type { MountSession, NotifiedAt } from "./mount-session";
import { isRefreshFailureReason } from "./refresh-failure-table";
import { REFRESH_OUTCOMES, type RefreshOutcome, type RefreshRecord } from "./refresh-record";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A pin is a string with something in it: `""` reads as unset downstream. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isRefreshRecord(value: unknown): value is RefreshRecord {
  if (!isRecord(value) || !isString(value.at)) return false;
  if (value.outcome === "ok") return value.reason === undefined;
  return value.outcome === "failed" && isRefreshFailureReason(value.reason);
}

function isOptionalRefreshRecord(value: unknown): value is RefreshRecord | undefined {
  return value === undefined || isRefreshRecord(value);
}

function isRefreshOutcome(value: string): value is RefreshOutcome {
  return REFRESH_OUTCOMES.some((outcome) => outcome === value);
}

function isOptionalNotifiedAt(value: unknown): value is NotifiedAt | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([outcome, at]) => isRefreshOutcome(outcome) && isString(at));
}

/**
 * A structural check rather than a schema parse: the CLI ships with commander
 * as its only runtime dependency, so Zod is not available to it. Every field
 * is tested, and a file failing any one of them is `malformed` rather than a
 * crash — a truncated write is the ordinary way that happens.
 */
export function isMountSession(value: unknown): value is MountSession {
  if (!isRecord(value) || value.version !== 1) return false;
  if (!isString(value.mountId) || !isMountId(value.mountId)) return false;
  if (!isNonEmptyString(value.profile) || !isNonEmptyString(value.baseUrl)) return false;
  if (!isNonEmptyString(value.orgId)) return false;
  const workspace = value.workspace;
  if (!isRecord(workspace)) return false;
  if (!isString(workspace.id) || !isString(workspace.slug)) return false;
  if (typeof workspace.shared !== "boolean") return false;
  if (!isMountAccess(value.access) || !isNonEmptyString(value.volumeName)) return false;
  const credentials = value.credentials;
  if (!isRecord(credentials)) return false;
  if (!isString(credentials.accessKeyId) || !isString(credentials.secretAccessKey)) return false;
  if (!isString(credentials.sessionToken)) return false;
  if (!isString(value.expiresAt) || !isString(value.mintedAt)) return false;
  return isOptionalRefreshRecord(value.lastRefresh) && isOptionalNotifiedAt(value.lastNotified);
}
