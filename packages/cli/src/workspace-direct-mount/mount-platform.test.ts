import { describe, expect, it } from "vitest";

import { MOUNT_PLATFORMS, mountPlatformOf } from "./mount-platform";

describe("mountPlatformOf — three rows, and where everything else lands", () => {
  it("names macOS and Windows by their own row", () => {
    expect(mountPlatformOf("darwin")).toBe("darwin");
    expect(mountPlatformOf("win32")).toBe("win32");
  });

  it("puts Linux and every other Node platform on the linux row", () => {
    const others: NodeJS.Platform[] = ["linux", "freebsd", "openbsd", "sunos", "aix", "android"];
    for (const platform of others) expect(mountPlatformOf(platform)).toBe("linux");
  });

  it("keeps the list the tables are keyed on at exactly these three names", () => {
    expect([...MOUNT_PLATFORMS]).toEqual(["darwin", "linux", "win32"]);
  });
});
