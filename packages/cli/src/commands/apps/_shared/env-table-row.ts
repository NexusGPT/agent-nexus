import { color } from "../../../output";
import {
  VIBE_ENV_VAR_SCOPES,
  type VibeAppCardBindingDto,
  type VibeAppEnvVarDto,
  type VibeEnvVarScope
} from "../../../vibe-wire-types";
import { formatTimestamp } from "./format-timestamp";
import { truncate } from "./truncate";

/**
 * One row of the merged environment table, whatever backs it.
 *
 * The table is merged rather than stacked because the app does not see two
 * lists: it sees ONE environment, and a name is held by exactly one entry. Two
 * sections would show a collision as two unrelated rows.
 */
export interface EnvTableRow {
  id: string;
  name: string;
  value: string;
  source: string;
  card: string;
  scope: VibeEnvVarScope;
  status: string;
  updatedAt: string;
}

/**
 * The status cell for a card-backed row, with the owner's remaining daily
 * quota folded in when there is a cap.
 *
 * An if-chain with a fallback rather than an exhaustive switch, for the same
 * version-skew reason spelled out on {@link formatDeployability}: this CLI
 * ships standalone to npm and is routinely pointed at a backend NEWER than
 * itself, which may name a state this build has never heard of. A switch the
 * compiler believes is exhaustive would return `undefined` and print it — and
 * an unknown state must never read as a working one.
 */
export function formatCardStatus(binding: VibeAppCardBindingDto): string {
  const quota =
    binding.quotaPerDay === null || binding.quotaRemaining === null
      ? ""
      : ` (${binding.quotaRemaining}/${binding.quotaPerDay})`;

  // The quota rides on `active` alone. On a paused or revoked card the
  // remaining allowance is not a budget anyone can spend, and printing it
  // beside "revoked" reads as though the card were still usable.
  if (binding.status === "ACTIVE") return color.green("active") + quota;
  if (binding.status === "PENDING_APPROVAL") return color.yellow("pending approval");
  if (binding.status === "PAUSED") return color.yellow("paused");
  if (binding.status === "REVOKED") return color.red("revoked");
  if (binding.status === "EXPIRED") return color.red("expired");
  return color.yellow("state this CLI does not understand");
}

/**
 * The source cell for a card-backed row. The projection is named only when it
 * is NOT `HANDLE`, because `HANDLE` is what the value column already shows: an
 * address the app resolves through the broker. Any other projection puts
 * something else in the variable, and the reader has to be told which.
 */
export function formatCardSource(binding: VibeAppCardBindingDto): string {
  return binding.projection === "HANDLE"
    ? "card"
    : `card (${binding.projection.toLowerCase().replace(/_/g, " ")})`;
}

export function toEnvVarRow(envVar: VibeAppEnvVarDto): EnvTableRow {
  return {
    // Full id, not shortenId: `env rm` takes the id and `env list` is the
    // only way to discover it, so the displayed id must be copy-pasteable.
    id: envVar.id,
    name: envVar.name,
    // Collapse newlines + truncate so a multiline or huge value never
    // breaks the table. Full value is available via --json.
    value: truncate(envVar.value.replace(/\s+/g, " "), 48),
    source: "variable",
    card: "—",
    scope: envVar.scope,
    status: "—",
    updatedAt: formatTimestamp(envVar.updatedAt)
  };
}

export function toCardBindingRow(binding: VibeAppCardBindingDto): EnvTableRow {
  return {
    id: binding.id,
    name: binding.name,
    // The handle in full, never truncated: it is the literal value the app
    // reads, and it is not a secret — see VibeAppCardBindingDto.handle.
    value: binding.handle,
    source: formatCardSource(binding),
    // Whose authority, then which attenuation of it. The credential first
    // because that is what the card's owner recognises as theirs.
    card: truncate(`${binding.credentialName} — ${binding.accessCardName}`, 36),
    scope: binding.scope,
    status: formatCardStatus(binding),
    updatedAt: formatTimestamp(binding.updatedAt)
  };
}

/**
 * Declaration order of {@link VIBE_ENV_VAR_SCOPES} — ALL, then PROD, then
 * STAGING, which is the order the deployer resolves in: ALL first, then the
 * environment-specific scope overwriting by name.
 *
 * A scope this build has never heard of yields -1 and sorts to the TOP, which
 * is the right direction for the same version-skew reason as the formatters
 * above: an unrecognised row must be conspicuous, never buried.
 */
export function scopeRank(scope: VibeEnvVarScope): number {
  return VIBE_ENV_VAR_SCOPES.indexOf(scope);
}
