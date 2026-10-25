import { describe, expect, it } from "vitest";

import {
  elevateMsiRoad,
  ELEVATION_FAILED_EXIT,
  MSI_CHANGED_EXIT,
  WINFSP_LOG_ENV,
  WINFSP_MSI_ENV,
  WINFSP_SHA256_ENV
} from "./elevate-msi";

const ELEVATE_MSI_ROAD = elevateMsiRoad({});

describe("elevateMsiRoad — msiexec behind UAC, the paths in env, byte for byte", () => {
  it("runs PowerShell by its System32 address, with no profile, no prompt, and the one script", () => {
    expect(ELEVATE_MSI_ROAD.file).toBe(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    );
    expect(elevateMsiRoad({ SystemRoot: "D:\\WINDOWS" }).file).toBe(
      "D:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    );
    expect(ELEVATE_MSI_ROAD.args.slice(0, 5)).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command"
    ]);
    expect(ELEVATE_MSI_ROAD.args).toHaveLength(6);
  });

  it("the script is exactly: open the MSI shared for reading only, hash it through that handle, compare, then the ProcessStartInfo runas line with the Win32Exception caught by type", () => {
    expect(ELEVATE_MSI_ROAD.args[5]).toBe(
      "try { $f = [IO.File]::Open($env:NEXUS_WINFSP_MSI, 'Open', 'Read', 'Read'); " +
        "$h = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($f)).Replace('-', '').ToLowerInvariant() } " +
        "catch [IO.IOException], [UnauthorizedAccessException] { exit 3 } catch { exit 2 }; " +
        "if ($h -ne $env:NEXUS_WINFSP_SHA256) { exit 3 }; " +
        "$psi = New-Object System.Diagnostics.ProcessStartInfo ($env:SystemRoot + '\\System32\\msiexec.exe'), " +
        "('/i \"' + $env:NEXUS_WINFSP_MSI + '\" /qn /norestart /l*v \"' + $env:NEXUS_WINFSP_LOG + '\"'); " +
        "$psi.Verb = 'runas'; $psi.UseShellExecute = $true; " +
        "try { $p = [Diagnostics.Process]::Start($psi); $p.WaitForExit(); exit $p.ExitCode } " +
        "catch [ComponentModel.Win32Exception] { if ($_.Exception.NativeErrorCode -eq 1223) { exit 1223 }; exit 2 } " +
        "catch { exit 2 }"
    );
  });

  it("the hash is taken before msiexec starts, through a handle the script never releases: no other process can swap the file between the two", () => {
    const script = ELEVATE_MSI_ROAD.args[5];
    const opened = script.indexOf("[IO.File]::Open($env:NEXUS_WINFSP_MSI, 'Open', 'Read', 'Read')");
    const hashed = script.indexOf("ComputeHash($f)");
    const compared = script.indexOf("if ($h -ne $env:NEXUS_WINFSP_SHA256) { exit 3 }");
    const started = script.indexOf("[Diagnostics.Process]::Start($psi)");
    expect(opened).toBeGreaterThanOrEqual(0);
    expect(hashed).toBeGreaterThan(opened);
    expect(compared).toBeGreaterThan(hashed);
    expect(started).toBeGreaterThan(compared);
    // The handle is released by the process exiting, after msiexec: never by the script.
    expect(script).not.toMatch(/Dispose|\.Close\(/);
    // A hash the environment does not carry compares unequal, so the mount refuses rather than installs.
    expect(script).toContain(`{ exit ${String(MSI_CHANGED_EXIT)} } catch { exit 2 }; if`);
  });

  it("never goes through Start-Process, which rethrows the 1223 decline without its NativeErrorCode", () => {
    expect(ELEVATE_MSI_ROAD.args[5]).not.toContain("Start-Process");
  });

  it("reads the MSI, the log and the expected hash from three environment names, and never splices a path into the script", () => {
    expect(WINFSP_MSI_ENV).toBe("NEXUS_WINFSP_MSI");
    expect(WINFSP_LOG_ENV).toBe("NEXUS_WINFSP_LOG");
    expect(WINFSP_SHA256_ENV).toBe("NEXUS_WINFSP_SHA256");
    const script = ELEVATE_MSI_ROAD.args[5];
    expect(script).toContain(`$env:${WINFSP_MSI_ENV}`);
    expect(script).toContain(`$env:${WINFSP_LOG_ENV}`);
    expect(script).toContain(`$env:${WINFSP_SHA256_ENV}`);
    expect(script).not.toMatch(/[A-Z]:\\/);
    expect(script).not.toMatch(/[0-9a-f]{64}/);
    expect(ELEVATION_FAILED_EXIT).toBe(2);
    expect(MSI_CHANGED_EXIT).toBe(3);
  });
});
