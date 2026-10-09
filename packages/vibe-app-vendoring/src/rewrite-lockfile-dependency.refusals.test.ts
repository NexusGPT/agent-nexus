import { describe, expect, it } from "vitest";

import {
  KEY,
  lockfile,
  PKG,
  rewrite,
  rewrittenPackages,
  rootSpecFor,
  SPEC,
  VERSION
} from "./rewrite-lockfile-dependency.test-support";

// The code loops ROOT_DEPENDENCY_FIELDS, so a fixture that only ever declares
// the root dep in `dependencies` cannot tell a loop from a hardcoded field.
describe("the root dependency spec, wherever it is declared", () => {
  it("is re-pointed in `devDependencies`", () => {
    expect(rootSpecFor(lockfile({ rootField: "devDependencies" }), "devDependencies", PKG)).toBe(
      SPEC
    );
  });

  it("is re-pointed in `optionalDependencies`", () => {
    expect(
      rootSpecFor(lockfile({ rootField: "optionalDependencies" }), "optionalDependencies", PKG)
    ).toBe(SPEC);
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
