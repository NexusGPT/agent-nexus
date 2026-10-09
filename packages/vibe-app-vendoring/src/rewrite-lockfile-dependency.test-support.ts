/** The vendored package, a lockfile builder, and the rewrite every lockfile test drives. */

import { rewriteLockfileToVendoredTarball } from "./rewrite-lockfile-dependency";

export const PKG = "@agent-nexus/apps-ui";
export const KEY = `node_modules/${PKG}`;
export const VERSION = "0.8.4";
export const SPEC = "file:vendor/agent-nexus-apps-ui-0.8.4.tgz";
export const INTEGRITY = "sha512-VENDOREDBYTES";

/** One `packages` entry of a rewritten lockfile, read without trusting its shape. */
type LockEntry = Readonly<Record<string, unknown>>;

/** A JSON object, as opposed to an array, a primitive or null. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function lockfile(options: {
  rootField?: "dependencies" | "devDependencies" | "optionalDependencies";
  pinned?: string | null;
}): string {
  const { rootField = "dependencies", pinned = VERSION } = options;
  return `${JSON.stringify(
    {
      name: "tom-app",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "tom-app",
          version: "1.0.0",
          [rootField]: { [PKG]: "^0.8.0", react: "^18.3.1" }
        },
        ...(pinned === null
          ? {}
          : {
              [KEY]: {
                version: pinned,
                resolved: `https://registry.npmjs.org/${PKG}/-/apps-ui-${pinned}.tgz`,
                integrity: "sha512-FROMTHEREGISTRY",
                license: "MIT"
              }
            }),
        "node_modules/react": { version: "18.3.1", integrity: "sha512-react" }
      }
    },
    null,
    2
  )}\n`;
}

export function rewrittenPackages(raw: string): Record<string, LockEntry> {
  const outcome = rewriteLockfileToVendoredTarball({
    raw,
    packageName: PKG,
    version: VERSION,
    integrity: INTEGRITY
  });
  if (!outcome.ok) throw new Error(`expected a rewrite, got refusal: ${outcome.reason}`);
  if (outcome.content === null) {
    throw new Error(`expected a rewrite, got skip: ${outcome.skipped.kind}`);
  }
  const parsed: unknown = JSON.parse(outcome.content);
  const packages = isRecord(parsed) ? parsed["packages"] : undefined;
  if (!isRecord(packages)) throw new Error("expected a rewrite carrying a `packages` map");
  return Object.fromEntries(
    Object.entries(packages).filter((entry): entry is [string, LockEntry] => isRecord(entry[1]))
  );
}

/** One spec the rewritten ROOT entry declares under `field`, or undefined. */
export function rootSpecFor(
  raw: string,
  field: "dependencies" | "devDependencies" | "optionalDependencies",
  name: string
): unknown {
  const declared = rewrittenPackages(raw)[""]?.[field];
  return isRecord(declared) ? declared[name] : undefined;
}

export function rewrite(raw: string, version = VERSION) {
  return rewriteLockfileToVendoredTarball({
    raw,
    packageName: PKG,
    version,
    integrity: INTEGRITY
  });
}
