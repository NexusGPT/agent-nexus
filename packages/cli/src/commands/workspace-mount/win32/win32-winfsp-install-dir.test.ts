import { describe, expect, it } from "vitest";

import { WINFSP_INSTALL_DIR_SCRIPT, winFspInstallDirFrom } from "./win32-winfsp-install-dir";

describe("winFspInstallDirFrom — the registry read's three answers", () => {
  it("trims the directory PowerShell printed, CRLF and all", () => {
    expect(winFspInstallDirFrom("C:\\Program Files (x86)\\WinFsp\\\r\n")).toEqual({
      dir: "C:\\Program Files (x86)\\WinFsp\\"
    });
  });

  it("reads an absent key as null: the script ran and printed nothing", () => {
    expect(winFspInstallDirFrom("")).toBeNull();
    expect(winFspInstallDirFrom("\r\n")).toBeNull();
  });

  it("reads a PowerShell that could not run, or ran and failed, as unknown — never as absent", () => {
    // A missing key never fails the script (SilentlyContinue), so a failed read is PowerShell's own trouble.
    expect(winFspInstallDirFrom(null)).toBe("unknown");
  });

  it("asks the WOW6432Node key first, then the native key 32-bit Windows writes, in one script that exits 0 on a missing key by construction", () => {
    expect(WINFSP_INSTALL_DIR_SCRIPT).toBe(
      "(Get-ItemProperty -ErrorAction SilentlyContinue " +
        "'HKLM:\\SOFTWARE\\WOW6432Node\\WinFsp','HKLM:\\SOFTWARE\\WinFsp' | Select-Object -First 1).InstallDir; " +
        "exit 0"
    );
  });
});
