import { describe, expect, it } from "vitest";

import { hostPlatform, hostRefusesStage, stagePlatform } from "./stage-platform";

describe("hostRefusesStage — which staged rows a host cannot run", () => {
  it("a Windows host refuses a macOS or Linux stage and takes a win32 one", () => {
    expect(hostRefusesStage("win32", "darwin")).toBe("stages darwin; this host is Windows");
    expect(hostRefusesStage("win32", "linux")).toBe("stages linux; this host is Windows");
    expect(hostRefusesStage("win32", "win32")).toBeNull();
  });

  it("a POSIX host takes every stage", () => {
    for (const staged of ["darwin", "linux", "win32"] as const) {
      expect(hostRefusesStage("darwin", staged)).toBeNull();
      expect(hostRefusesStage("linux", staged)).toBeNull();
    }
  });
});

describe("stagePlatform — stages for one case and puts the host's own back after it", () => {
  const pretendPlatform = stagePlatform();

  it("the case sees the platform it staged", () => {
    // win32 is the one stage every host takes (see hostRefusesStage).
    pretendPlatform("win32");
    expect(process.platform).toBe("win32");
  });

  it("the next case sees the host's own platform again", () => {
    expect(process.platform).toBe(hostPlatform());
  });
});
