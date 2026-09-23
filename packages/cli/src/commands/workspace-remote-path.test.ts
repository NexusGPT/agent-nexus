import { describe, expect, it } from "vitest";

import { schemaPathRefusal } from "../workspace-path-rules.conformance";
import { remotePathRefusal } from "./workspace-remote-path";

/**
 * The restatement and the schema are two copies of one rule set. This table
 * runs both: every row the schema refuses, the restatement refuses with the
 * schema's own first message; every row the schema accepts, the restatement
 * accepts. A rule added to one and not the other reds here.
 */

const REFUSED: readonly string[] = [
  "",
  "a".repeat(1025),
  "docs/a\0b.md",
  "docs\\a.md",
  "/docs/a.md",
  "docs//a.md",
  "docs/../a.md",
  "../a.md",
  "docs/./a.md",
  `docs/${"b".repeat(256)}.md`
];

const ACCEPTED: readonly string[] = [
  "a.md",
  "docs/reports/q3.md",
  "docs/",
  "ré sum+é?.md",
  // 1024 characters, no segment over 255: the length cap alone does not bite.
  `${`${"a".repeat(200)}/`.repeat(4)}${"a".repeat(220)}`,
  `docs/${"b".repeat(255)}`,
  "...three-dots",
  "dots.in.name.tar.gz"
];

describe("remotePathRefusal — the server's path rules, restated for the CLI", () => {
  it.each(REFUSED)("refuses %j with the schema's own first message", (path) => {
    const expected = schemaPathRefusal(path);
    expect(expected).not.toBeNull();
    expect(remotePathRefusal(path)).toBe(expected);
  });

  it.each(ACCEPTED)("accepts %j exactly when the schema does", (path) => {
    expect(schemaPathRefusal(path)).toBeNull();
    expect(remotePathRefusal(path)).toBeNull();
  });
});
