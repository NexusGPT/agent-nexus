import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { DepsIo } from "../../../workspace-direct-mount/deps-io";
import { downloadVerified } from "./download-verified";

const BYTES = new TextEncoder().encode("the official bytes");
const SHA = createHash("sha256").update(BYTES).digest("hex");
const URL = "https://downloads.rclone.org/v1.74.4/rclone-v1.74.4-osx-arm64.zip";

const ioFetching = (download: DepsIo["download"]): DepsIo => ({
  platform: "darwin",
  arch: "arm64",
  env: {},
  stdinIsTTY: true,
  exists: () => false,
  rcloneVersion: () => null,
  macFuseApproved: () => "unknown",
  hasBrew: () => false,
  download,
  run: vi.fn(),
  askYesNo: vi.fn(),
  promptLine: vi.fn()
});

describe("downloadVerified — bytes reach the caller only when they hash to the pin", () => {
  it("returns the bytes when the hash matches", async () => {
    await expect(
      downloadVerified(
        ioFetching(async () => BYTES),
        URL,
        SHA
      )
    ).resolves.toBe(BYTES);
  });

  it("refuses a mismatch as a local failure naming both hashes, and hands nothing back", async () => {
    const truncated = BYTES.slice(0, 5);
    const attempt = downloadVerified(
      ioFetching(async () => truncated),
      URL,
      SHA
    );
    // The CLI's own taxonomy, not a bare Error: `handleError` prints the code and exits `local-failed`.
    await expect(attempt).rejects.toMatchObject({
      code: "CLI_LOCAL_FAILED",
      message: expect.stringContaining("did not match its pinned sha256"),
      hint: expect.stringContaining(SHA)
    });
  });

  it("wraps a transport failure as a local failure that names the url", async () => {
    const attempt = downloadVerified(
      ioFetching(async () => {
        throw new Error("ECONNRESET");
      }),
      URL,
      SHA
    );
    await expect(attempt).rejects.toMatchObject({
      message: `Could not download ${URL}: ECONNRESET`
    });
  });
});
