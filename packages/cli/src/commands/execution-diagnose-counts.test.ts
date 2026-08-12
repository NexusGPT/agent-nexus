import { describe, expect, it } from "vitest";

import { summarizeCounts } from "./execution";

/**
 * `execution diagnose` used to lowercase the count keys before printing, which
 * made the human output look identical to `execution list`/`get` while the
 * `--json` payload underneath said `COMPLETED` where the other two said
 * `completed` (NEX-3176). The keys are normalized server-side now, so this
 * helper must NOT lowercase — a bucket that ever comes back uppercase should be
 * visible in the terminal too, not silently repaired.
 */
describe("summarizeCounts", () => {
  it("renders the non-zero buckets verbatim", () => {
    expect(summarizeCounts({ completed: 6, failed: 0, pending: 0, running: 0, skipped: 2 })).toBe(
      "6 completed, 2 skipped"
    );
  });

  it("does not lowercase, so server-side casing drift stays visible", () => {
    expect(summarizeCounts({ COMPLETED: 38 })).toBe("38 COMPLETED");
  });

  it("returns null when every bucket is zero, absent, or not a number", () => {
    expect(
      summarizeCounts({ completed: 0, failed: 0, pending: 0, running: 0, skipped: 0 })
    ).toBeNull();
    expect(summarizeCounts({})).toBeNull();
    expect(summarizeCounts({ completed: "6" })).toBeNull();
    expect(summarizeCounts(undefined)).toBeNull();
    expect(summarizeCounts(null)).toBeNull();
  });
});
