import { describe, expect, it } from "vitest";

import {
  VENDOR_DIRECTORY,
  vendoredTarballFilename,
  vendoredTarballPath,
  vendoredTarballSpec
} from "./vendored-tarball-path";

/**
 * The basename here is npm's OWN convention, not ours: `npm pack
 * @agent-nexus/apps-ui` writes `agent-nexus-apps-ui-0.8.4.tgz`. That matters
 * because the server serves a registry tarball under this name and the CLI
 * writes it under this name, and a lockfile's `resolved` points at it — three
 * places that agree only while the spelling is pinned.
 *
 * The scoped case is asserted as one exact string rather than as "contains no
 * `@`" plus "contains no `/`": a substring arm over a short string is satisfied
 * by any longer sibling, and there are two transformations here that a single
 * reading cannot tell apart.
 */
describe("vendoredTarballFilename", () => {
  it("packs a scoped name to npm's own tarball basename", () => {
    expect(vendoredTarballFilename("@agent-nexus/apps-ui", "0.8.4")).toBe(
      "agent-nexus-apps-ui-0.8.4.tgz"
    );
  });

  it("leaves an unscoped name alone", () => {
    expect(vendoredTarballFilename("lodash", "4.17.21")).toBe("lodash-4.17.21.tgz");
  });

  it("flattens every separator of a deeper scoped name, not just the first", () => {
    // npm has no such name today; this pins that the `/` replace is global,
    // which is the half a single-scope fixture cannot distinguish.
    expect(vendoredTarballFilename("@a/b/c", "1.0.0")).toBe("a-b-c-1.0.0.tgz");
  });

  it("keeps a prerelease version verbatim", () => {
    expect(vendoredTarballFilename("@agent-nexus/apps-ui", "0.9.0-rc.1")).toBe(
      "agent-nexus-apps-ui-0.9.0-rc.1.tgz"
    );
  });
});

describe("vendoredTarballPath", () => {
  it("sits the tarball in the vendor directory", () => {
    expect(vendoredTarballPath("@agent-nexus/apps-ui", "0.8.4")).toBe(
      "vendor/agent-nexus-apps-ui-0.8.4.tgz"
    );
  });

  it("uses the exported directory constant, so one edit moves every consumer", () => {
    expect(vendoredTarballPath("lodash", "1.0.0").startsWith(`${VENDOR_DIRECTORY}/`)).toBe(true);
  });
});

describe("vendoredTarballSpec", () => {
  it("is the `file:` spec npm resolves to the vendored path", () => {
    expect(vendoredTarballSpec("@agent-nexus/apps-ui", "0.8.4")).toBe(
      "file:vendor/agent-nexus-apps-ui-0.8.4.tgz"
    );
  });

  it("is exactly `file:` prepended to the path, never a second spelling of it", () => {
    const name = "@agent-nexus/apps-ui";
    expect(vendoredTarballSpec(name, "0.8.4")).toBe(`file:${vendoredTarballPath(name, "0.8.4")}`);
  });
});
