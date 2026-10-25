import { describe, expect, it } from "vitest";

import { powerShellExe, system32Exe } from "./win32-system-exe";

describe("system32Exe — a System32 program by full address, never by PATH", () => {
  it("joins under SystemRoot with backslashes whatever the host", () => {
    expect(system32Exe({ SystemRoot: "D:\\WINDOWS" }, "tar.exe")).toBe(
      "D:\\WINDOWS\\System32\\tar.exe"
    );
  });

  it("falls back to C:\\Windows when SystemRoot is unset or empty — never a relative address", () => {
    expect(system32Exe({}, "whoami.exe")).toBe("C:\\Windows\\System32\\whoami.exe");
    expect(system32Exe({ SystemRoot: "" }, "whoami.exe")).toBe("C:\\Windows\\System32\\whoami.exe");
  });

  it("refuses a SystemRoot that is not an absolute path rather than handing a relative address to a spawn", () => {
    expect(() => system32Exe({ SystemRoot: "Windows" }, "cmd.exe")).toThrow(
      "not an absolute address"
    );
  });

  it("names PowerShell by its fixed home under System32, never by the bare name", () => {
    expect(powerShellExe({})).toBe(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    );
    expect(powerShellExe({ SystemRoot: "D:\\WINDOWS" })).toBe(
      "D:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    );
  });
});
