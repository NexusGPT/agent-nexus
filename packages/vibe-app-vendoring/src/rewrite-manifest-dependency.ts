import { asStringMap, isRecord, parseJson } from "./json-guards";
import { vendoredTarballSpec } from "./vendored-tarball-path";

/**
 * Re-points one dependency of a `package.json` at a tarball vendored inside the
 * app, so `npm install` resolves it from disk instead of asking a registry the
 * machine cannot authenticate to.
 *
 * Every other field is carried through untouched and in its original order:
 * this rewrites a customer's own manifest, so anything it does not have an
 * explicit reason to change, it must not change.
 */

/**
 * Every dependency field this reads, including the one it must NOT rewrite.
 * `peerDependencies` is here so a malformed one is still refused rather than
 * ignored — a peer range is a statement about the CONSUMER's tree, so a `file:`
 * spec there means nothing to npm and is never written.
 */
const READ_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies"
] as const;

type ManifestDependencies = Partial<Record<(typeof READ_FIELDS)[number], Record<string, string>>>;

/** The manifest fields a runtime dependency can legitimately be declared in. */
const REWRITABLE_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"] as const;

export type RewritableDependencyField = (typeof REWRITABLE_FIELDS)[number];

export interface RewriteManifestOptions {
  /**
   * Add the dependency when the manifest does not declare it at all, rather
   * than refusing. This is the "install this package into an app that does not
   * have it yet" case; the starter path leaves it off, because a starter whose
   * manifest lost its library dependency is a defect upstream, not something to
   * paper over.
   */
  readonly addWhenAbsent?: boolean;
  /**
   * Force `"private": true` and drop `publishConfig`. Used when instantiating a
   * template into an app, which must never be publishable. Left off when
   * rewriting a customer's existing manifest — their publishability is their
   * decision and silently flipping it is a surprise edit.
   */
  readonly makeUnpublishable?: boolean;
}

export type RewriteManifestOutcome =
  | {
      ok: true;
      content: string;
      /** Where the dependency now lives. */
      field: RewritableDependencyField;
      /** The spec that was there before, or `null` when this call added it. */
      previousSpec: string | null;
    }
  | { ok: false; reason: string };

/**
 * Points `packageName` at `file:vendor/<packed-name>-<version>.tgz`.
 *
 * The dependency is rewritten WHERE IT ALREADY IS — a library declared in
 * `devDependencies` stays a dev dependency — because moving it between fields
 * changes what a production install pulls, which is not this function's
 * decision to make. A `peerDependencies` entry is deliberately NOT rewritten:
 * a peer range is a statement about the CONSUMER's tree, and a `file:` spec
 * there means nothing to npm.
 *
 * Refuses rather than guesses when the same package is declared in more than
 * one rewritable field: npm's precedence between them is not something to
 * silently pick a side of, and the manifest is already ambiguous.
 */
export function rewriteManifestToVendoredTarball(
  raw: string,
  packageName: string,
  version: string,
  options: RewriteManifestOptions = {}
): RewriteManifestOutcome {
  const decoded = parseJson(raw);
  if (!decoded.ok) return { ok: false, reason: `package.json is not JSON: ${decoded.reason}` };
  const json = decoded.value;
  if (!isRecord(json)) return { ok: false, reason: "package.json is not a JSON object" };
  const manifest: ManifestDependencies = {};
  for (const field of READ_FIELDS) {
    if (json[field] === undefined) continue;
    const map = asStringMap(json[field]);
    if (map === null) {
      return { ok: false, reason: `package.json's ${field} is not a string-valued map` };
    }
    manifest[field] = map;
  }

  const declaredIn = REWRITABLE_FIELDS.filter(
    (field) => manifest[field]?.[packageName] !== undefined
  );
  if (declaredIn.length > 1) {
    return {
      ok: false,
      reason: `package.json declares ${packageName} in more than one place (${declaredIn.join(", ")})`
    };
  }

  const field = declaredIn[0];
  if (field === undefined && options.addWhenAbsent !== true) {
    return { ok: false, reason: `package.json does not depend on ${packageName}` };
  }

  const target: RewritableDependencyField = field ?? "dependencies";
  const previousSpec = field === undefined ? null : (manifest[field]?.[packageName] ?? null);
  const spec = vendoredTarballSpec(packageName, version);

  // 🔴 Rewritten over the RAW parsed object, never over the schema's output.
  // `.passthrough()` carries unknown keys through but emits the DECLARED ones
  // first, so building the result from `parsed.data` reorders a customer's
  // `package.json` — `name` and `version` end up below `dependencies`. Nothing
  // breaks, and the diff on their next commit is the whole file, which is how a
  // command that was supposed to change one line loses their trust. The schema
  // validates; the original object is what gets edited.
  const rewritten: Record<string, unknown> = json;
  rewritten[target] = { ...(manifest[target] ?? {}), [packageName]: spec };
  if (options.makeUnpublishable === true) {
    delete rewritten.publishConfig;
    rewritten.private = true;
  }
  return {
    ok: true,
    content: `${JSON.stringify(rewritten, null, 2)}\n`,
    field: target,
    previousSpec
  };
}
