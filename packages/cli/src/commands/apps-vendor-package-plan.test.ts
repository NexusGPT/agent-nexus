import { describe, expect, it } from "vitest";

import { planVendoring } from "./apps/vendor-package/plan-vendoring";
import type { AppFiles, VendorPlan } from "./apps/vendor-package/vendor-plan";

/**
 * The plan over the shape this verb was written for: an app that ALREADY exists
 * on a customer's laptop, depending on the private package through the
 * registry, with a lockfile and a Dockerfile of its own.
 *
 * The three rewrites have to agree with each other and with the tarball
 * filename, and the only way to prove they do is to run them over a fixture and
 * read the result — which is exactly why this module is split from the command.
 *
 * `nextCommand` is the field that decides whether the customer's OWN CI
 * survives: `npm ci` on a lockfile this plan could not re-point fails there,
 * not here, and nothing at that point names this command as the cause.
 */

const PKG = "@agent-nexus/apps-ui";
const VERSION = "0.8.4";
const INTEGRITY = "sha512-VENDOREDBYTES";
const TARBALL = "agent-nexus-apps-ui-0.8.4.tgz";

const PACKAGE_JSON = `${JSON.stringify(
  {
    name: "toms-app",
    version: "1.0.0",
    dependencies: { [PKG]: "^0.8.0", react: "^18.3.1" }
  },
  null,
  2
)}\n`;

function lockfileRaw(pinned: string): string {
  return `${JSON.stringify(
    {
      name: "toms-app",
      lockfileVersion: 3,
      packages: {
        "": { name: "toms-app", dependencies: { [PKG]: "^0.8.0", react: "^18.3.1" } },
        [`node_modules/${PKG}`]: {
          version: pinned,
          resolved: `https://registry.npmjs.org/${PKG}/-/apps-ui-${pinned}.tgz`,
          integrity: "sha512-FROMTHEREGISTRY"
        }
      }
    },
    null,
    2
  )}\n`;
}

const DOCKERFILE = [
  "FROM node:20-alpine",
  "WORKDIR /app",
  "COPY package.json package-lock.json ./",
  "RUN npm ci",
  "COPY . .",
  'CMD ["node", "server.js"]'
].join("\n");

function files(overrides: Partial<AppFiles> = {}): AppFiles {
  return {
    packageJson: PACKAGE_JSON,
    lockfile: { name: "package-lock.json", raw: lockfileRaw(VERSION) },
    dockerfile: DOCKERFILE,
    vendorEntries: [],
    ...overrides
  };
}

function plan(overrides: Partial<AppFiles> = {}, version = VERSION): VendorPlan {
  const outcome = planVendoring({
    files: files(overrides),
    packageName: PKG,
    version,
    integrity: INTEGRITY
  });
  if (!outcome.ok) throw new Error(`expected a plan, got refusal: ${outcome.reason}`);
  return outcome.plan;
}

/** The warning about a given file, so an arm is anchored on it rather than on
 * the whole joined warning text — where any line carrying the words satisfies it. */
function warningAbout(p: VendorPlan, needle: string): string {
  const found = p.warnings.filter((w) => w.includes(needle));
  if (found.length !== 1) {
    throw new Error(
      `expected exactly 1 warning mentioning ${needle}, got ${found.length}: ${JSON.stringify(p.warnings)}`
    );
  }
  return found[0] ?? "";
}

describe("an existing app whose lockfile already pins the version being vendored", () => {
  it("writes exactly three files", () => {
    expect(plan().writes.map((w) => w.path)).toEqual([
      "package.json",
      "package-lock.json",
      "Dockerfile"
    ]);
  });

  it("leaves the customer consistent with `npm ci`", () => {
    expect(plan().nextCommand).toBe("npm ci");
  });

  it("warns about nothing", () => {
    expect(plan().warnings).toEqual([]);
  });

  it("removes nothing, because vendor/ is empty", () => {
    expect(plan().removals).toEqual([]);
  });

  it("points package.json at the vendored tarball", () => {
    const manifest = JSON.parse(
      plan().writes.find((w) => w.path === "package.json")?.content ?? "{}"
    ) as { dependencies: Record<string, string> };
    expect(manifest.dependencies[PKG]).toBe(`file:vendor/${TARBALL}`);
  });

  it("points the lockfile's installed entry at the same tarball", () => {
    const lock = JSON.parse(
      plan().writes.find((w) => w.path === "package-lock.json")?.content ?? "{}"
    ) as { packages: Record<string, { resolved?: string }> };
    expect(lock.packages[`node_modules/${PKG}`]?.resolved).toBe(`file:vendor/${TARBALL}`);
  });

  it("records the vendored bytes' integrity in the lockfile", () => {
    const lock = JSON.parse(
      plan().writes.find((w) => w.path === "package-lock.json")?.content ?? "{}"
    ) as { packages: Record<string, { integrity?: string }> };
    expect(lock.packages[`node_modules/${PKG}`]?.integrity).toBe(INTEGRITY);
  });

  it("makes the Dockerfile copy vendor/ before its install", () => {
    expect(plan().writes.find((w) => w.path === "Dockerfile")?.content).toBe(
      [
        "FROM node:20-alpine",
        "WORKDIR /app",
        "COPY package.json package-lock.json ./",
        "COPY vendor/ ./vendor/",
        "RUN npm ci",
        "COPY . .",
        'CMD ["node", "server.js"]'
      ].join("\n")
    );
  });
});

describe("an UPGRADE — the lockfile pins an older version than the one being vendored", () => {
  const upgrade = { lockfile: { name: "package-lock.json", raw: lockfileRaw("0.8.3") } };

  // Re-pointing one entry cannot re-resolve that package's own transitive
  // dependencies, so a rewritten lockfile here would install cleanly and be wrong.
  it("does NOT write the lockfile", () => {
    expect(plan(upgrade).writes.map((w) => w.path)).toEqual(["package.json", "Dockerfile"]);
  });

  it("tells the customer to run `npm install`, which re-resolves the tree", () => {
    expect(plan(upgrade).nextCommand).toBe("npm install");
  });

  it("names the version the lockfile pins", () => {
    expect(warningAbout(plan(upgrade), "package-lock.json")).toContain("0.8.3");
  });

  it("names the version being vendored", () => {
    expect(warningAbout(plan(upgrade), "package-lock.json")).toContain(VERSION);
  });

  describe("with the superseded tarball still sitting in vendor/", () => {
    const withLitter = {
      ...upgrade,
      vendorEntries: ["agent-nexus-apps-ui-0.8.3.tgz", "other-1.0.0.tgz", TARBALL]
    };

    it("removes the superseded tarball of the SAME package", () => {
      expect(plan(withLitter).removals).toContain("vendor/agent-nexus-apps-ui-0.8.3.tgz");
    });

    // Another package's tarball in vendor/ is somebody else's dependency.
    it("leaves an unrelated package's tarball alone", () => {
      expect(plan(withLitter).removals).not.toContain("vendor/other-1.0.0.tgz");
    });

    it("does not remove the tarball it is about to write", () => {
      expect(plan(withLitter).removals).not.toContain(`vendor/${TARBALL}`);
    });

    it("removes nothing else", () => {
      expect(plan(withLitter).removals).toEqual(["vendor/agent-nexus-apps-ui-0.8.3.tgz"]);
    });
  });
});

describe("an app with no Dockerfile", () => {
  const noDockerfile = { dockerfile: null };

  it("writes only the manifest and the lockfile", () => {
    expect(plan(noDockerfile).writes.map((w) => w.path)).toEqual([
      "package.json",
      "package-lock.json"
    ]);
  });

  // The platform generates one, and a generated build copies the manifests and
  // nothing else — so the install succeeds here and the server-side build does not.
  it("warns that the generated build will not copy vendor/", () => {
    expect(warningAbout(plan(noDockerfile), "vendor/")).toContain("generates one at build time");
  });

  it("still leaves the customer on `npm ci`", () => {
    expect(plan(noDockerfile).nextCommand).toBe("npm ci");
  });
});

describe("an app with no lockfile", () => {
  const noLockfile = { lockfile: null };

  it("writes only the manifest and the Dockerfile", () => {
    expect(plan(noLockfile).writes.map((w) => w.path)).toEqual(["package.json", "Dockerfile"]);
  });

  it("tells the customer to run `npm install`", () => {
    expect(plan(noLockfile).nextCommand).toBe("npm install");
  });

  it("warns that a build running `npm ci` needs one", () => {
    expect(warningAbout(plan(noLockfile), "No lockfile")).toContain("package-lock.json");
  });
});

describe("a lockfile with no entry for the package", () => {
  const unpinned = {
    lockfile: {
      name: "package-lock.json",
      raw: `${JSON.stringify({ name: "toms-app", lockfileVersion: 3, packages: { "": {} } }, null, 2)}\n`
    }
  };

  it("leaves the lockfile alone", () => {
    expect(plan(unpinned).writes.map((w) => w.path)).toEqual(["package.json", "Dockerfile"]);
  });

  it("tells the customer to run `npm install`", () => {
    expect(plan(unpinned).nextCommand).toBe("npm install");
  });

  it("says the lockfile has no entry to re-point", () => {
    expect(warningAbout(plan(unpinned), "package-lock.json")).toContain("has no entry for");
  });
});

describe("a Dockerfile that already copies the whole build context", () => {
  const wholeContext = {
    dockerfile: ["FROM node:20", "COPY . .", "RUN npm ci"].join("\n")
  };

  it("is not rewritten", () => {
    expect(plan(wholeContext).writes.map((w) => w.path)).toEqual([
      "package.json",
      "package-lock.json"
    ]);
  });

  it("produces no warning, because nothing is wrong with it", () => {
    expect(plan(wholeContext).warnings).toEqual([]);
  });
});

describe("a Dockerfile with no recognised install step", () => {
  const noInstall = {
    dockerfile: ["FROM node:20", "COPY . .", 'CMD ["node", "server.js"]'].join("\n")
  };

  it("is not rewritten", () => {
    expect(plan(noInstall).writes.map((w) => w.path)).toEqual([
      "package.json",
      "package-lock.json"
    ]);
  });

  it("warns that nothing was added to it", () => {
    expect(warningAbout(plan(noInstall), "no recognised dependency-install step")).toContain(
      "vendor/"
    );
  });
});

describe("a manifest the plan cannot rewrite", () => {
  it("refuses, rather than writing two files and half a plan", () => {
    const outcome = planVendoring({
      files: files({ packageJson: "{ not json" }),
      packageName: PKG,
      version: VERSION,
      integrity: INTEGRITY
    });
    expect(outcome.ok).toBe(false);
  });

  it("refuses when the lockfile holds a nested copy of the package", () => {
    const raw = lockfileRaw(VERSION).replace(
      `"node_modules/${PKG}"`,
      `"node_modules/other/node_modules/${PKG}": { "version": "0.7.0" },\n    "node_modules/${PKG}"`
    );
    const outcome = planVendoring({
      files: files({ lockfile: { name: "package-lock.json", raw } }),
      packageName: PKG,
      version: VERSION,
      integrity: INTEGRITY
    });
    expect(outcome.ok).toBe(false);
  });
});
