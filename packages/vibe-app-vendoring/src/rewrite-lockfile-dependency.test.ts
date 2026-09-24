import { describe, expect, it } from "vitest";

import {
  lockedVersionOf,
  NPM_LOCKFILE_NAMES,
  rewriteLockfileToVendoredTarball,
  sha512Integrity
} from "./rewrite-lockfile-dependency";

/**
 * `npm ci` installs the lockfile and NOTHING else — it refuses one that
 * disagrees with `package.json` and it verifies every entry against the
 * `integrity` beside it. So the properties here are the ones that decide
 * whether a customer's own CI survives the rewrite, which is the half nobody
 * sees on a laptop.
 *
 * One property per `it`, because a mutant that moves `resolved` usually moves
 * `integrity` too and a block reports one verdict for both.
 */

const PKG = "@agent-nexus/apps-ui";
const KEY = `node_modules/${PKG}`;
const VERSION = "0.8.4";
const SPEC = "file:vendor/agent-nexus-apps-ui-0.8.4.tgz";
const INTEGRITY = "sha512-VENDOREDBYTES";

interface LockEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
  [key: string]: unknown;
}

function lockfile(options: {
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

function rewrittenPackages(raw: string): Record<string, LockEntry> {
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
  return (JSON.parse(outcome.content) as { packages: Record<string, LockEntry> }).packages;
}

function rewrite(raw: string, version = VERSION) {
  return rewriteLockfileToVendoredTarball({
    raw,
    packageName: PKG,
    version,
    integrity: INTEGRITY
  });
}

describe("NPM_LOCKFILE_NAMES", () => {
  // npm reads the first one PRESENT and ignores the rest; a caller rewriting a
  // shadowed file would produce a tree where nothing it wrote is ever read.
  it("puts the shrinkwrap first, which is npm's own precedence", () => {
    expect(NPM_LOCKFILE_NAMES[0]).toBe("npm-shrinkwrap.json");
  });

  it("puts package-lock.json second", () => {
    expect(NPM_LOCKFILE_NAMES[1]).toBe("package-lock.json");
  });
});

describe("lockedVersionOf", () => {
  it("reads the version the lockfile pins", () => {
    const outcome = lockedVersionOf(lockfile({}), PKG);
    expect(outcome.ok && outcome.value).toBe(VERSION);
  });

  it("returns null when the lockfile has no entry for the package", () => {
    const outcome = lockedVersionOf(lockfile({ pinned: null }), PKG);
    expect(outcome.ok && outcome.value).toBeNull();
  });

  it("refuses a lockfile that is not JSON", () => {
    expect(lockedVersionOf("{ not json", PKG).ok).toBe(false);
  });

  it("refuses a lockfile with no lockfileVersion", () => {
    expect(lockedVersionOf(JSON.stringify({ packages: {} }), PKG).ok).toBe(false);
  });
});

describe("sha512Integrity", () => {
  // The expected values are derived with `openssl dgst -sha512 -binary | base64`,
  // NOT with node's crypto — an assertion computed the same way as the subject
  // is an assertion about itself.
  it("is the base64 sha-512 of the bytes, prefixed the way npm spells it", () => {
    expect(sha512Integrity(new TextEncoder().encode("vendored tarball bytes"))).toBe(
      "sha512-czpL+P2/4aW4NIruwnq0ofb96TZX/FiE3/7yMNsALKjPrVJfHkLSDRyXYJiGmP/1UQTDJm/+T7kAjoNEyD880Q=="
    );
  });

  it("digests empty input rather than special-casing it", () => {
    expect(sha512Integrity(new Uint8Array())).toBe(
      "sha512-z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg=="
    );
  });

  it("changes when a single byte changes", () => {
    const a = sha512Integrity(new TextEncoder().encode("vendored tarball bytes"));
    const b = sha512Integrity(new TextEncoder().encode("vendored tarball byteS"));
    expect(a).not.toBe(b);
  });
});

describe("rewriting a lockfile that pins the version being vendored", () => {
  const raw = lockfile({});

  it("points the installed entry's `resolved` at the vendored tarball", () => {
    expect(rewrittenPackages(raw)[KEY]?.resolved).toBe(SPEC);
  });

  it("records the integrity of the VENDORED bytes, not the registry's", () => {
    expect(rewrittenPackages(raw)[KEY]?.integrity).toBe(INTEGRITY);
  });

  it("keeps the rest of the installed entry", () => {
    expect(rewrittenPackages(raw)[KEY]?.license).toBe("MIT");
  });

  it("re-points the ROOT dependency spec, which `npm ci` compares against package.json", () => {
    const root = rewrittenPackages(raw)[""] as { dependencies: Record<string, string> };
    expect(root.dependencies[PKG]).toBe(SPEC);
  });

  it("leaves the root's sibling specs alone", () => {
    const root = rewrittenPackages(raw)[""] as { dependencies: Record<string, string> };
    expect(root.dependencies.react).toBe("^18.3.1");
  });

  it("leaves an unrelated installed entry alone", () => {
    expect(rewrittenPackages(raw)["node_modules/react"]?.integrity).toBe("sha512-react");
  });

  it("ends the file with a newline", () => {
    const outcome = rewrite(raw);
    expect(outcome.ok && outcome.content?.endsWith("}\n")).toBe(true);
  });
});

/**
 * A lockfile whose key order does NOT match the schema's declaration order —
 * the only shape that can tell "rewrote the raw tree" from "rebuilt from the
 * parsed output". A rebuild emits declared keys first, so it reorders a
 * customer's file and turns a two-value change into a whole-file diff.
 */
const AWKWARD_ORDER = `${JSON.stringify(
  {
    name: "tom-app",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "tom-app", dependencies: { [PKG]: "^0.8.0" } },
      [KEY]: {
        resolved: "https://registry.npmjs.org/x",
        integrity: "sha512-FROMTHEREGISTRY",
        license: "MIT",
        version: VERSION
      }
    }
  },
  null,
  2
)}\n`;

describe("the customer's own key order", () => {
  it("is preserved at the top level", () => {
    const outcome = rewrite(AWKWARD_ORDER);
    const parsed = outcome.ok && outcome.content !== null ? JSON.parse(outcome.content) : {};
    expect(Object.keys(parsed as object)).toEqual([
      "name",
      "lockfileVersion",
      "requires",
      "packages"
    ]);
  });

  it("is preserved inside the entry that was rewritten", () => {
    expect(Object.keys(rewrittenPackages(AWKWARD_ORDER)[KEY] ?? {})).toEqual([
      "resolved",
      "integrity",
      "license",
      "version"
    ]);
  });
});

// The code loops ROOT_DEPENDENCY_FIELDS, so a fixture that only ever declares
// the root dep in `dependencies` cannot tell a loop from a hardcoded field.
describe("the root dependency spec, wherever it is declared", () => {
  it("is re-pointed in `devDependencies`", () => {
    const root = rewrittenPackages(lockfile({ rootField: "devDependencies" }))[""] as {
      devDependencies: Record<string, string>;
    };
    expect(root.devDependencies[PKG]).toBe(SPEC);
  });

  it("is re-pointed in `optionalDependencies`", () => {
    const root = rewrittenPackages(lockfile({ rootField: "optionalDependencies" }))[""] as {
      optionalDependencies: Record<string, string>;
    };
    expect(root.optionalDependencies[PKG]).toBe(SPEC);
  });

  it("does not invent a `dependencies` map when the dep was a devDependency", () => {
    expect(rewrittenPackages(lockfile({ rootField: "devDependencies" }))[""]?.dependencies).toBe(
      undefined
    );
  });
});

describe("a lockfile with no entry for the package", () => {
  const outcome = rewrite(lockfile({ pinned: null }));

  it("is skipped rather than rewritten", () => {
    expect(outcome.ok && outcome.content).toBeNull();
  });

  it("says it is not pinned", () => {
    expect(outcome.ok && outcome.skipped?.kind).toBe("not-pinned");
  });
});

describe("a lockfile pinning a different version", () => {
  const outcome = rewrite(lockfile({ pinned: "0.8.3" }));

  it("is skipped rather than rewritten", () => {
    expect(outcome.ok && outcome.content).toBeNull();
  });

  it("says the versions disagree", () => {
    expect(outcome.ok && outcome.skipped?.kind).toBe("version-mismatch");
  });

  it("carries the version the lockfile actually pins, so the caller can name it", () => {
    expect(
      outcome.ok && outcome.skipped?.kind === "version-mismatch" && outcome.skipped.lockedVersion
    ).toBe("0.8.3");
  });
});

describe("a lockfile holding a nested copy of the package", () => {
  // A second tree position left pointing at the registry means the install still
  // needs a credential while every visible sign says it does not.
  const raw = lockfile({ pinned: VERSION }).replace(
    '"node_modules/react": {',
    `"node_modules/some-dep/${KEY}": { "version": "0.7.0" },\n    "node_modules/react": {`
  );

  it("is refused outright, not skipped", () => {
    expect(rewrite(raw).ok).toBe(false);
  });

  it("names the nested position", () => {
    const outcome = rewrite(raw);
    expect(!outcome.ok && outcome.reason).toContain(`node_modules/some-dep/${KEY}`);
  });
});

describe("a legacy v1/v2 `dependencies` tree", () => {
  const raw = JSON.stringify({
    lockfileVersion: 2,
    dependencies: { [PKG]: { version: VERSION, resolved: "https://registry.npmjs.org/x" } },
    packages: { "": {}, [KEY]: { version: VERSION } }
  });

  it("is refused, because the legacy shape records a local tarball differently", () => {
    expect(rewrite(raw).ok).toBe(false);
  });

  it("names the package it refused over", () => {
    const outcome = rewrite(raw);
    expect(!outcome.ok && outcome.reason).toContain(PKG);
  });
});

describe("a lockfile that cannot be read", () => {
  it("refuses input that is not JSON", () => {
    expect(rewrite("{ not json").ok).toBe(false);
  });

  it("refuses a lockfile with no lockfileVersion", () => {
    expect(rewrite(JSON.stringify({ packages: { [KEY]: { version: VERSION } } })).ok).toBe(false);
  });
});
