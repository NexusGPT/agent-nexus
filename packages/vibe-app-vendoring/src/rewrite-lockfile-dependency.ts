import { createHash } from "node:crypto";

import { asStringMap, isRecord, parseJson } from "./json-guards";
import { vendoredTarballSpec } from "./vendored-tarball-path";

/**
 * Makes an npm lockfile agree with a tarball vendored inside the app.
 *
 * `npm ci` installs the lockfile and nothing else: it refuses a lockfile that
 * disagrees with `package.json`, and it verifies every entry against the
 * `integrity` recorded beside it. So re-pointing a manifest at
 * `file:vendor/…` without touching the lockfile leaves `npm ci` broken — which
 * is the failure that reaches a customer's OWN CI rather than their laptop, and
 * therefore the one nobody sees until it is expensive.
 */

/**
 * The lockfiles npm reads, in its own precedence order. The first one PRESENT
 * is the effective one and the rest are ignored, so a caller reconciling a tree
 * must not rewrite a shadowed file as though it mattered.
 */
export const NPM_LOCKFILE_NAMES = ["npm-shrinkwrap.json", "package-lock.json"] as const;

/** One installed entry. Only `version` is read; everything else is carried through. */
interface LockEntry {
  readonly version?: string;
}

/**
 * The half of a lockfile this module reads. `lockfileVersion` is REQUIRED —
 * its absence is what tells a malformed or non-lockfile JSON apart from a
 * lockfile with nothing in it.
 */
interface Lockfile {
  readonly lockfileVersion: number;
  readonly packages?: Record<string, LockEntry>;
  readonly dependencies?: Record<string, unknown>;
}

export type LockfileReadOutcome<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * A parsed lockfile alongside the RAW object it was parsed from.
 *
 * Both are needed, and for opposite reasons. The schema is what makes the read
 * safe. The raw object is what gets EDITED: `.passthrough()` emits declared
 * keys before unknown ones, so rebuilding from the schema's output reorders the
 * whole file — a one-line change that arrives as a whole-file diff.
 */
interface ParsedLockfile {
  readonly lock: Lockfile;
  readonly raw: Record<string, unknown>;
}

/** Why a lockfile could not be rewritten in place, in cases that are not defects. */
export type LockfileSkipReason =
  /** The lockfile has no entry for the package — there is nothing to re-point. */
  | { kind: "not-pinned" }
  /** The lockfile pins a DIFFERENT version than the one being vendored. */
  | { kind: "version-mismatch"; lockedVersion: string };

export type LockfileRewriteOutcome =
  | { ok: true; content: string; skipped?: undefined }
  | { ok: true; content: null; skipped: LockfileSkipReason }
  | { ok: false; reason: string };

function lockKey(packageName: string): string {
  return `node_modules/${packageName}`;
}

function parseLockfile(raw: string, packageName: string): LockfileReadOutcome<ParsedLockfile> {
  const decoded = parseJson(raw);
  if (!decoded.ok) return { ok: false, reason: `lockfile is not JSON: ${decoded.reason}` };
  const json = decoded.value;
  if (!isRecord(json) || typeof json.lockfileVersion !== "number") {
    return { ok: false, reason: "lockfile has no lockfileVersion" };
  }
  const packages: Record<string, LockEntry> = {};
  if (json.packages !== undefined) {
    if (!isRecord(json.packages))
      return { ok: false, reason: "lockfile's packages is not an object" };
    for (const [name, entry] of Object.entries(json.packages)) {
      if (!isRecord(entry)) return { ok: false, reason: `lockfile entry ${name} is not an object` };
      const version = entry.version;
      if (version !== undefined && typeof version !== "string") {
        return { ok: false, reason: `lockfile entry ${name} has a non-string version` };
      }
      packages[name] = { version };
    }
  }
  const legacy = isRecord(json.dependencies) ? json.dependencies : undefined;
  // The v1/v2 legacy tree records a local tarball differently; rewriting it
  // unmeasured would ship a lockfile npm may reject. Refused instead.
  if (legacy?.[packageName] !== undefined) {
    return {
      ok: false,
      reason: `lockfileVersion ${json.lockfileVersion} legacy "dependencies" tree pins ${packageName}; only the "packages" tree is rewritten`
    };
  }
  const lock: Lockfile = {
    lockfileVersion: json.lockfileVersion,
    ...(json.packages === undefined ? {} : { packages }),
    ...(legacy === undefined ? {} : { dependencies: legacy })
  };
  return { ok: true, value: { lock, raw: json } };
}

/**
 * The version a lockfile resolves for `packageName`, or null when it has no
 * entry for it. A bundle must vendor exactly this version: `npm ci` refuses a
 * lockfile whose entry does not satisfy the manifest.
 */
export function lockedVersionOf(
  raw: string,
  packageName: string
): LockfileReadOutcome<string | null> {
  const lock = parseLockfile(raw, packageName);
  if (!lock.ok) return lock;
  return { ok: true, value: lock.value.lock.packages?.[lockKey(packageName)]?.version ?? null };
}

/**
 * The subresource-integrity string npm records for a tarball's bytes.
 *
 * Computed from the bytes that are actually written to `vendor/`, never copied
 * from a packument: the two agree only while the vendored file is the published
 * artifact byte-for-byte, and a lockfile carrying a digest for a DIFFERENT
 * artifact fails `npm ci` with a corruption error that points at the registry.
 */
export function sha512Integrity(bytes: Uint8Array): string {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

/** Every root-manifest field a lockfile's `packages[""]` entry can declare a dependency in. */
const ROOT_DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"] as const;

/**
 * Re-points the lockfile's entry for `packageName` at the vendored tarball: the
 * root manifest's dependency spec, and the installed entry's `resolved` and
 * `integrity`. `integrity` is the digest of the VENDORED bytes, so `npm ci`
 * verifies the file it actually installs rather than trusting a registry digest
 * for a different artifact.
 *
 * Returns `content: null` with a {@link LockfileSkipReason} — never a rewritten
 * lockfile — in the two cases where re-pointing one entry would produce a
 * lockfile that LIES:
 *
 *   - **not pinned.** There is no entry to re-point. The lockfile is already
 *     out of step with a manifest that depends on the package, and `npm ci`
 *     would refuse it whatever we did.
 *   - **version mismatch.** The lockfile pins another version, so vendoring
 *     this one changes the resolved tree — including the package's OWN
 *     transitive dependencies, which this function cannot re-resolve. Editing
 *     the one entry would leave a lockfile that installs cleanly and is wrong.
 *
 * Both are the caller's decision: a template being instantiated treats a
 * mismatch as a defect and refuses; a customer deliberately upgrading a library
 * runs `npm install`, which re-resolves the tree properly.
 *
 * Refuses outright when the lockfile holds a NESTED copy of the package: a
 * second tree position we would leave pointing at the registry, so the install
 * would still need credentials while every visible sign said it did not.
 */
export function rewriteLockfileToVendoredTarball(input: {
  raw: string;
  packageName: string;
  version: string;
  /** Subresource-integrity string for the vendored bytes (`sha512-…`). */
  integrity: string;
}): LockfileRewriteOutcome {
  const { raw, packageName, version, integrity } = input;
  const lock = parseLockfile(raw, packageName);
  if (!lock.ok) return lock;
  const { lock: parsed, raw: rawLock } = lock.value;
  const packages = parsed.packages ?? {};
  const key = lockKey(packageName);

  const entry = packages[key];
  if (entry?.version === undefined)
    return { ok: true, content: null, skipped: { kind: "not-pinned" } };
  if (entry.version !== version) {
    return {
      ok: true,
      content: null,
      skipped: { kind: "version-mismatch", lockedVersion: entry.version }
    };
  }
  const nested = Object.keys(packages).filter((name) => name !== key && name.endsWith(`/${key}`));
  if (nested.length > 0) {
    return {
      ok: false,
      reason: `lockfile holds nested copies of ${packageName}: ${nested.join(", ")}`
    };
  }

  const spec = vendoredTarballSpec(packageName, version);

  // 🔴 Every value written below is spread from the RAW tree, never from the
  // schema's output, for the reason `ParsedLockfile` states. The schema decided
  // WHETHER to rewrite and WHICH version is pinned; it must not decide what the
  // file looks like afterwards, or each touched entry comes back with its keys
  // re-ordered. The parsed tree is still what is READ, so an entry that is not
  // an object cannot reach the spread.
  const rawPackages = { ...(rawLock.packages as Record<string, unknown>) };

  const rawRoot = rawPackages[""];
  if (packages[""] !== undefined && isRecord(rawRoot)) {
    const rewrittenRoot = { ...rawRoot };
    for (const field of ROOT_DEPENDENCY_FIELDS) {
      const deps = asStringMap(rawRoot[field]);
      if (deps !== null && deps[packageName] !== undefined) {
        rewrittenRoot[field] = { ...deps, [packageName]: spec };
      }
    }
    rawPackages[""] = rewrittenRoot;
  }

  const rawEntry = rawPackages[key];
  rawPackages[key] = {
    ...(isRecord(rawEntry) ? rawEntry : entry),
    resolved: spec,
    integrity
  };

  rawLock.packages = rawPackages;
  return { ok: true, content: `${JSON.stringify(rawLock, null, 2)}\n` };
}
