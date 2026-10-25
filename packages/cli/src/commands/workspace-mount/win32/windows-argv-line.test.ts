import { describe, expect, it } from "vitest";

import { windowsArgvLine } from "./windows-argv-line";

describe("windowsArgvLine — the C runtime reads it back as the same arguments", () => {
  it.each([
    [
      ["mount", "nxws:", "C:\\Users\\me\\nexus\\acme\\ws"],
      "mount nxws: C:\\Users\\me\\nexus\\acme\\ws"
    ],
    [["--volname", "General Context (Acme)"], '--volname "General Context (Acme)"'],
    [["--volname", "General Context (Acme’s)"], '--volname "General Context (Acme’s)"'],
    [["C:\\Users\\Jo Blo\\x"], '"C:\\Users\\Jo Blo\\x"'],
    [['say "hi"'], '"say \\"hi\\""'],
    [['back\\\\"slash'], '"back\\\\\\\\\\"slash"'],
    [["trail\\ ends\\"], '"trail\\ ends\\\\"'],
    [[""], '""'],
    [["tab\there"], '"tab\there"']
  ])("%j → %s", (args, line) => {
    expect(windowsArgvLine(args)).toBe(line);
  });
});
