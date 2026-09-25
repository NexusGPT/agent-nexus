import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MANAGED_RCLONE, MANAGED_RCLONE_DIR, PATH_RCLONE } from "./managed-rclone";

// Which of the two runs is decided by `rclonePreflight`, the brand's only
// minter; its spec pins the rule. This one pins where the two names point.
describe("managed rclone — where the CLI's own copy lives", () => {
  it("lives under the CLI's own state directory, never under /usr/local or Homebrew", () => {
    expect(MANAGED_RCLONE_DIR).toBe(path.join(os.homedir(), ".nexus-mcp", "bin"));
    expect(MANAGED_RCLONE).toBe(path.join(MANAGED_RCLONE_DIR, "rclone"));
    expect(path.isAbsolute(MANAGED_RCLONE)).toBe(true);
  });

  it("falls back to the PATH name — the pre-managed behaviour — when no managed copy exists", () => {
    expect(PATH_RCLONE).toBe("rclone");
  });
});
