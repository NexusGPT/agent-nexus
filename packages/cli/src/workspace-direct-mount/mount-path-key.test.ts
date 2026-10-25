import path from "node:path";

import { describe, expect, it } from "vitest";

import { stagePlatform } from "../stage-platform";
import { isDriveLetter, mountPathKey } from "./mount-path-key";

const pretendPlatform = stagePlatform();

describe("isDriveLetter — a whole drive, with or without its backslash", () => {
  it.each(["X:", "x:", "X:\\", "z:\\"])("%s is a drive letter", (at) => {
    expect(isDriveLetter(at)).toBe(true);
  });

  it.each(["X", "XY:", "X:\\nexus", "C:/", "*", "", "\\\\server\\share"])("%s is not", (at) => {
    expect(isDriveLetter(at)).toBe(false);
  });
});

describe("mountPathKey — one directory, one key, however it was typed", () => {
  it("on macOS and Linux: path.resolve, case kept", () => {
    for (const platform of ["darwin", "linux"] as const) {
      pretendPlatform(platform);
      expect(mountPathKey("/home/jo/nexus/a/")).toBe(path.resolve("/home/jo/nexus/a"));
      expect(mountPathKey("/home/jo/NEXUS/A")).not.toBe(mountPathKey("/home/jo/nexus/a"));
    }
  });

  it("on Windows: folders fold their case, and a drive letter is `X:` however it was typed", () => {
    pretendPlatform("win32");
    // Node's path binds to the host at load, so the folder is spelled the host's way here.
    expect(mountPathKey("/Users/Jo/nexus/A")).toBe(mountPathKey("/users/jo/NEXUS/a"));
    expect(mountPathKey("x:")).toBe("X:");
    expect(mountPathKey("X:\\")).toBe("X:");
  });
});
