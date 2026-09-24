import { describe, expect, it } from "vitest";

import { rewriteManifestToVendoredTarball } from "./rewrite-manifest-dependency";

/**
 * This rewrites a CUSTOMER's own `package.json`, so the properties worth
 * pinning are as much about what it leaves alone as about what it changes.
 *
 * Each property gets its own `it`. A failing assertion throws, so it aborts the
 * rest of its block — an `it` asserting "the spec changed" above "the field did
 * not move" scores only the first arm against every mutant that moves both, and
 * the second is credited with a kill it never earned.
 */

const PKG = "@agent-nexus/apps-ui";
const VERSION = "0.8.4";
const SPEC = "file:vendor/agent-nexus-apps-ui-0.8.4.tgz";

function manifest(extra: Record<string, unknown>): string {
  return `${JSON.stringify({ name: "tom-app", version: "1.0.0", ...extra }, null, 2)}\n`;
}

/** The parsed result of a rewrite that must have succeeded. Throws if it did not. */
function rewritten(
  raw: string,
  options?: Parameters<typeof rewriteManifestToVendoredTarball>[3]
): Record<string, unknown> {
  const outcome = rewriteManifestToVendoredTarball(raw, PKG, VERSION, options);
  if (!outcome.ok) throw new Error(`expected a rewrite, got refusal: ${outcome.reason}`);
  return JSON.parse(outcome.content) as Record<string, unknown>;
}

function deps(parsed: Record<string, unknown>, field: string): Record<string, string> {
  return (parsed[field] ?? {}) as Record<string, string>;
}

describe("a dependency declared in `dependencies`", () => {
  const raw = manifest({ dependencies: { [PKG]: "^0.8.0", react: "^18.3.1" } });

  it("points at the vendored tarball", () => {
    expect(deps(rewritten(raw), "dependencies")[PKG]).toBe(SPEC);
  });

  it("leaves the sibling dependencies alone", () => {
    expect(deps(rewritten(raw), "dependencies").react).toBe("^18.3.1");
  });

  it("reports the field it wrote to", () => {
    const outcome = rewriteManifestToVendoredTarball(raw, PKG, VERSION);
    expect(outcome.ok && outcome.field).toBe("dependencies");
  });

  it("reports the spec that was there before", () => {
    const outcome = rewriteManifestToVendoredTarball(raw, PKG, VERSION);
    expect(outcome.ok && outcome.previousSpec).toBe("^0.8.0");
  });

  it("ends the file with a newline, as every package manager writes it", () => {
    const outcome = rewriteManifestToVendoredTarball(raw, PKG, VERSION);
    expect(outcome.ok && outcome.content.endsWith("}\n")).toBe(true);
  });
});

describe("a dependency declared in `devDependencies`", () => {
  const raw = manifest({
    dependencies: { react: "^18.3.1" },
    devDependencies: { [PKG]: "^0.8.0" }
  });

  it("is rewritten where it already is", () => {
    expect(deps(rewritten(raw), "devDependencies")[PKG]).toBe(SPEC);
  });

  // Moving it would change what a production install pulls, which is a
  // behaviour change this function has no mandate to make.
  it("is NOT copied into `dependencies`", () => {
    expect(deps(rewritten(raw), "dependencies")[PKG]).toBeUndefined();
  });

  it("reports `devDependencies` as the field", () => {
    const outcome = rewriteManifestToVendoredTarball(raw, PKG, VERSION);
    expect(outcome.ok && outcome.field).toBe("devDependencies");
  });
});

describe("a dependency the manifest does not declare", () => {
  const raw = manifest({ dependencies: { react: "^18.3.1" } });

  it("is added to `dependencies` when the caller asks for it", () => {
    expect(deps(rewritten(raw, { addWhenAbsent: true }), "dependencies")[PKG]).toBe(SPEC);
  });

  it("reports no previous spec, because there was none", () => {
    const outcome = rewriteManifestToVendoredTarball(raw, PKG, VERSION, { addWhenAbsent: true });
    expect(outcome.ok && outcome.previousSpec).toBeNull();
  });

  it("is refused when the caller did not ask for it", () => {
    expect(rewriteManifestToVendoredTarball(raw, PKG, VERSION).ok).toBe(false);
  });

  it("names the package in the refusal", () => {
    const outcome = rewriteManifestToVendoredTarball(raw, PKG, VERSION);
    expect(!outcome.ok && outcome.reason).toContain(PKG);
  });
});

describe("a dependency declared in two fields at once", () => {
  const raw = manifest({
    dependencies: { [PKG]: "^0.8.0" },
    devDependencies: { [PKG]: "^0.7.0" }
  });

  it("is refused rather than resolved by guessing npm's precedence", () => {
    expect(rewriteManifestToVendoredTarball(raw, PKG, VERSION).ok).toBe(false);
  });

  it("names the first field it found the package in", () => {
    const outcome = rewriteManifestToVendoredTarball(raw, PKG, VERSION);
    expect(!outcome.ok && outcome.reason).toContain("dependencies");
  });

  it("names the second field too, so the reader can see both", () => {
    const outcome = rewriteManifestToVendoredTarball(raw, PKG, VERSION);
    expect(!outcome.ok && outcome.reason).toContain("devDependencies");
  });
});

describe("makeUnpublishable", () => {
  const raw = manifest({
    dependencies: { [PKG]: "^0.8.0" },
    publishConfig: { access: "public" }
  });

  it("marks the manifest private", () => {
    expect(rewritten(raw, { makeUnpublishable: true }).private).toBe(true);
  });

  it("drops publishConfig", () => {
    expect("publishConfig" in rewritten(raw, { makeUnpublishable: true })).toBe(false);
  });

  it("does NOT mark it private without the option", () => {
    expect("private" in rewritten(raw)).toBe(false);
  });

  it("does NOT drop publishConfig without the option", () => {
    expect(rewritten(raw).publishConfig).toEqual({ access: "public" });
  });
});

describe("fields this function has no reason to touch", () => {
  it("keeps the key order of the original manifest", () => {
    const raw = `${JSON.stringify(
      {
        name: "tom-app",
        private: true,
        scripts: { build: "vite build" },
        dependencies: { [PKG]: "^0.8.0" },
        engines: { node: ">=20" }
      },
      null,
      2
    )}\n`;

    expect(Object.keys(rewritten(raw))).toEqual([
      "name",
      "private",
      "scripts",
      "dependencies",
      "engines"
    ]);
  });

  it("carries an unrelated field through untouched", () => {
    const raw = manifest({
      dependencies: { [PKG]: "^0.8.0" },
      scripts: { build: "vite build" }
    });
    expect(rewritten(raw).scripts).toEqual({ build: "vite build" });
  });

  // A `file:` spec in `peerDependencies` means nothing to npm — a peer range is
  // a statement about the CONSUMER's tree, not about what gets installed here.
  it("does not rewrite a `peerDependencies` entry", () => {
    const raw = manifest({ peerDependencies: { [PKG]: "^0.8.0" } });
    expect(deps(rewritten(raw, { addWhenAbsent: true }), "peerDependencies")[PKG]).toBe("^0.8.0");
  });

  it("treats a package declared ONLY as a peer as absent, and adds a real dependency", () => {
    const raw = manifest({ peerDependencies: { [PKG]: "^0.8.0" } });
    expect(deps(rewritten(raw, { addWhenAbsent: true }), "dependencies")[PKG]).toBe(SPEC);
  });
});

describe("a manifest that is not usable", () => {
  it("refuses input that is not JSON", () => {
    expect(rewriteManifestToVendoredTarball("{ not json", PKG, VERSION).ok).toBe(false);
  });

  it("refuses a dependency map that is not string-valued", () => {
    const raw = manifest({ dependencies: { [PKG]: { version: "0.8.0" } } });
    expect(rewriteManifestToVendoredTarball(raw, PKG, VERSION).ok).toBe(false);
  });
});
