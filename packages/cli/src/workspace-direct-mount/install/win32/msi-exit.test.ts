import { describe, expect, it } from "vitest";

import { msiExitVerdict } from "./msi-exit";
import { WINFSP_PIN, winFspMsiUrl } from "./winfsp-pin";

const LOG = "C:\\Users\\jo\\.nexus-mcp\\downloads\\4242-winfsp.log";

describe("msiExitVerdict — every exit code msiexec and the road can answer with", () => {
  it("0 is the only ok", () => {
    expect(msiExitVerdict(0, LOG)).toEqual({ ok: true });
  });

  it("3010 and 1641 refuse with the restart sentence: the driver is on disk, not loaded", () => {
    for (const status of [3010, 1641]) {
      const verdict = msiExitVerdict(status, LOG);
      expect(verdict.ok).toBe(false);
      if (verdict.ok) return;
      expect(verdict.message).toContain("restart Windows, then mount again");
    }
  });

  it("1223 is the standard user's sentence: the pinned url, the full hash, and the word administrator", () => {
    const verdict = msiExitVerdict(1223, LOG);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.hint).toContain(winFspMsiUrl());
    expect(verdict.hint).toContain(WINFSP_PIN.sha256);
    expect(verdict.hint).toContain("administrator");
    expect(verdict.hint).toContain("the rclone half needs none");
  });

  it("2 is the road's own: the elevation request failed before msiexec ran", () => {
    const verdict = msiExitVerdict(2, LOG);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.message).toContain("before msiexec ran");
  });

  it("3 is the road's own: the MSI changed or could not be read back, msiexec never ran, no prompt and no log", () => {
    const verdict = msiExitVerdict(3, LOG);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.message).toContain("no longer matched its pinned sha256");
    expect(verdict.message).toContain("msiexec was not run");
    expect(verdict.hint).toContain("No administrator prompt appeared");
    expect(verdict.hint).toContain("no installer log");
    // msiexec never wrote one, so naming its path would send the person to a file that is not there.
    expect(verdict.hint).not.toContain(LOG);
    expect(verdict.hint).toContain("https://winfsp.dev");
  });

  it("1603 names the two causes, a newer WinFsp among them, and the log", () => {
    const verdict = msiExitVerdict(1603, LOG);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.message).toContain("NEWER WinFsp");
    expect(verdict.hint).toContain(LOG);
  });

  it.each([1603, 1638])(
    "%s never advises --no-install-deps (the same preflight refuses it) and names what the probe reads",
    (status) => {
      const verdict = msiExitVerdict(status, LOG);
      if (verdict.ok) throw new Error(`${String(status)} must refuse`);
      expect(verdict.message).not.toContain("--no-install-deps");
      expect(verdict.hint).not.toContain("--no-install-deps");
      expect(verdict.hint).toContain("HKLM\\SOFTWARE\\WOW6432Node\\WinFsp");
      expect(verdict.hint).toContain("HKLM\\SOFTWARE\\WinFsp on 32-bit Windows");
      expect(verdict.hint).toContain("InstallDir");
      expect(verdict.hint).toContain("bin\\winfsp-");
      expect(verdict.hint).toContain("https://winfsp.dev");
    }
  );

  it.each([3, 1602, 1618, 1619, 1625, 1638, 1234, null])("%s refuses, never ok", (status) => {
    expect(msiExitVerdict(status, LOG).ok).toBe(false);
  });

  it("1638 says a different version blocks the install, not where rclone looks", () => {
    const verdict = msiExitVerdict(1638, LOG);
    if (verdict.ok) throw new Error("1638 must refuse");
    expect(verdict.message).toContain("different version");
    expect(verdict.message).not.toContain("does not look");
  });
});
