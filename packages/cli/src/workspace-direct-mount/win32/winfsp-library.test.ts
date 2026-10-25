import { describe, expect, it } from "vitest";

import { isWinFspArch, winFspLibraryFor } from "./winfsp-library";

describe("winFspLibraryFor — the DLL rclone loads, by architecture", () => {
  it("joins with backslashes whatever the host, and names the arm64 DLL a64 as WinFsp does", () => {
    const dir = "C:\\Program Files (x86)\\WinFsp";
    expect(winFspLibraryFor(dir, "x64")).toBe(`${dir}\\bin\\winfsp-x64.dll`);
    expect(winFspLibraryFor(dir, "arm64")).toBe(`${dir}\\bin\\winfsp-a64.dll`);
    expect(winFspLibraryFor(dir, "ia32")).toBe(`${dir}\\bin\\winfsp-x86.dll`);
  });

  it("does not double a trailing backslash the registry value may carry", () => {
    expect(winFspLibraryFor("C:\\WinFsp\\", "x64")).toBe("C:\\WinFsp\\bin\\winfsp-x64.dll");
  });

  it("admits only the three architectures Windows Node ships for", () => {
    expect(isWinFspArch("x64")).toBe(true);
    expect(isWinFspArch("arm64")).toBe(true);
    expect(isWinFspArch("ia32")).toBe(true);
    expect(isWinFspArch("ppc64")).toBe(false);
    expect(isWinFspArch("s390x")).toBe(false);
  });
});
