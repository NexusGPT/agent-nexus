import { describe, expect, it } from "vitest";

import { win32CommandLineScript } from "./win32-command-line";

describe("win32CommandLineScript — the pid is the only spliced value", () => {
  it("asks CIM for exactly that pid's command line, and its image name when Windows withholds the line", () => {
    expect(win32CommandLineScript(4242)).toBe(
      "$p = Get-CimInstance Win32_Process -Filter 'ProcessId = 4242'; " +
        "if ($p.CommandLine) { $p.CommandLine } elseif ($p) { $p.Name }"
    );
  });

  it("refuses anything that is not a whole, non-negative number before it reaches a shell", () => {
    expect(() => win32CommandLineScript(4242.5)).toThrow("not a pid: 4242.5");
    expect(() => win32CommandLineScript(-1)).toThrow("not a pid: -1");
    expect(() => win32CommandLineScript(Number.NaN)).toThrow("not a pid: NaN");
  });
});
