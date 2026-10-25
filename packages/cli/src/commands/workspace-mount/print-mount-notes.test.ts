import { afterEach, describe, expect, it, vi } from "vitest";

import { printMountNotes } from "./print-mount-notes";

function printed(run: () => void): string {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    lines.push(a.map(String).join(" "));
  });
  try {
    run();
  } finally {
    spy.mockRestore();
  }
  return lines.join("\n");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("printMountNotes — what no refusal would tell the person about this drive", () => {
  it("the rclone engine names the 100 MiB limit and --engine direct, which runs on every platform — never workspace push (it refuses 45 MiB and up)", () => {
    const note = printed(() => printMountNotes("rclone", false));
    expect(note).toContain("Files over 100 MiB never finish uploading");
    expect(note).toContain('Mount with "--engine direct" to write them.');
    expect(note).not.toContain("workspace push");
  });

  it("a READ-ONLY rclone mount prints nothing: no upload runs, and the direct engine refuses a CODE workspace anyway", () => {
    expect(printed(() => printMountNotes("rclone", true))).toBe("");
  });

  it("the direct and webdav engines print nothing", () => {
    expect(printed(() => printMountNotes("direct", false))).toBe("");
    expect(printed(() => printMountNotes("webdav", false))).toBe("");
  });

  it("inside WSL no \\\\wsl$ line: that path is not observed to reach a FUSE drive mounted without --allow-other", () => {
    vi.stubEnv("WSL_DISTRO_NAME", "Ubuntu");
    for (const engine of ["rclone", "direct"] as const) {
      expect(printed(() => printMountNotes(engine, false))).not.toContain("wsl$");
    }
  });
});
