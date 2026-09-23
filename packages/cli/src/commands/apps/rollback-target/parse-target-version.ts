/**
 * Read a `--to-version` value.
 *
 * Accepts a leading `v` because every surface in this CLI PRINTS the version
 * that way — `apps deployments list` renders a `Version` column of `v7`, and
 * `apps rollback` reports `v3 → v2`. Refusing the exact string the product just
 * showed the operator is a footgun with no upside, so `7` and `v7` are the same
 * argument.
 *
 * Returns `null` rather than throwing so the caller refuses through the one
 * error funnel with the rest of them; a throw here would land in the generic
 * `handleError` catch and print a less specific document.
 */
export function parseTargetVersion(raw: string): number | null {
  const trimmed = raw.trim();
  // Anchored, and digits only after an optional `v`: `parseInt` would read
  // "7abc" as 7 and "1e3" as 1, turning a typo into a silent wrong target.
  if (!/^v?\d+$/i.test(trimmed)) return null;

  const version = Number(trimmed.replace(/^v/i, ""));
  // Version numbers start at 1 — `deploymentSeq` is bumped BEFORE it is
  // stamped, so no row ever carries 0. `Number.isSafeInteger` rejects a value
  // long enough to lose precision, which would otherwise compare equal to a
  // different version.
  if (!Number.isSafeInteger(version) || version < 1) return null;

  return version;
}
