import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { stagePlatform } from "../../stage-platform";
import { resolveMountPath } from "./resolve-mount-path";

const pretendPlatform = stagePlatform();
afterEach(() => {
  delete process.env.OneDrive;
});

describe("resolveMountPath — the mount point, per platform", () => {
  it("on macOS and Linux: --at or the default, resolved, as always", () => {
    for (const platform of ["darwin", "linux"] as const) {
      pretendPlatform(platform);
      expect(resolveMountPath("ws", "/home/jo/nexus/acme/docs")).toBe(path.resolve("ws"));
      expect(resolveMountPath(undefined, "/home/jo/nexus/acme/docs")).toBe(
        "/home/jo/nexus/acme/docs"
      );
    }
  });

  it("on Windows a drive letter stays a drive letter — resolving it would give X:\\<cwd>", () => {
    pretendPlatform("win32");
    expect(resolveMountPath("x:\\", "/fallback")).toBe("X:");
  });

  it("on Windows the refused shapes throw invalid-input before any disk access", () => {
    pretendPlatform("win32");
    expect(() => resolveMountPath("*", "/fallback")).toThrow(/pick a drive letter/);
    expect(() => resolveMountPath("\\\\server\\share", "/fallback")).toThrow(/network path/);
  });

  it("on Windows a relative --at typed inside a network folder resolves to a UNC path, and is refused", () => {
    pretendPlatform("win32");
    const cwd = vi.spyOn(process, "cwd").mockReturnValue("\\\\server\\share\\team");
    try {
      expect(() => resolveMountPath("docs", "/fallback")).toThrow(/network path/);
    } finally {
      cwd.mockRestore();
    }
  });

  it("on Windows the DEFAULT folder gets the same reading as --at: a slug Windows reserves is refused", () => {
    pretendPlatform("win32");
    expect(() => resolveMountPath(undefined, "C:\\Users\\jo\\nexus\\acme\\con")).toThrow(
      /"con" is a name Windows reserves/
    );
    expect(() => resolveMountPath(undefined, "C:\\Users\\jo\\nexus\\acme\\docs.")).toThrow(
      /Windows reserves or silently rewrites/
    );
  });

  it("on Windows a DEFAULT folder inside OneDrive is refused too", () => {
    pretendPlatform("win32");
    process.env.OneDrive = path.resolve("/Users/jo/OneDrive");
    expect(() =>
      resolveMountPath(undefined, path.resolve("/Users/jo/OneDrive/nexus/acme/docs"))
    ).toThrow(/inside OneDrive/);
  });

  it("on Windows a default folder with ordinary names resolves as before", () => {
    pretendPlatform("win32");
    expect(resolveMountPath(undefined, path.resolve("/Users/jo/nexus/acme/docs"))).toBe(
      path.resolve("/Users/jo/nexus/acme/docs")
    );
  });

  it("on Windows a folder inside OneDrive is refused, naming OneDrive's root", () => {
    pretendPlatform("win32");
    process.env.OneDrive = path.resolve("/Users/jo/OneDrive");
    expect(() => resolveMountPath(path.resolve("/Users/jo/OneDrive/nexus"), "/fallback")).toThrow(
      /inside OneDrive/
    );
    expect(resolveMountPath(path.resolve("/Users/jo/nexus"), "/fallback")).toBe(
      path.resolve("/Users/jo/nexus")
    );
  });
});
