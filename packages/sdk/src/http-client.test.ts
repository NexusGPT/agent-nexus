import { describe, expect, it } from "vitest";

import { withDerivedHasMore } from "./http-client";

/**
 * `withDerivedHasMore` fills in a `hasMore` the server did not send.
 *
 * The property that matters most is the FIRST test: today every v1 list
 * endpoint sends `hasMore`, so the derivation must be a no-op on real traffic.
 * A helper that "helpfully" recomputed the field would silently disagree with
 * the server on exactly the paginated reads it is supposed to pass through.
 */
describe("withDerivedHasMore", () => {
  it("returns a served hasMore untouched, even when it contradicts the other fields", () => {
    // page 1 of 9 pages says "more pages exist", the server says false.
    // The server wins: it is the only party that knows.
    const meta = { total: 90, page: 1, limit: 10, totalPages: 9, hasMore: false };

    expect(withDerivedHasMore(meta).hasMore).toBe(false);
  });

  it("keeps a served hasMore: true", () => {
    expect(withDerivedHasMore({ total: 90, page: 1, hasMore: true }).hasMore).toBe(true);
  });

  it("derives from page < totalPages when hasMore is absent", () => {
    expect(withDerivedHasMore({ total: 90, page: 1, limit: 10, totalPages: 9 }).hasMore).toBe(true);
    expect(withDerivedHasMore({ total: 90, page: 9, limit: 10, totalPages: 9 }).hasMore).toBe(
      false
    );
  });

  it("falls back to page * limit < total when totalPages is absent too", () => {
    expect(withDerivedHasMore({ total: 90, page: 1, limit: 10 }).hasMore).toBe(true);
    expect(withDerivedHasMore({ total: 90, page: 9, limit: 10 }).hasMore).toBe(false);
  });

  it("answers false when nothing in the payload suggests another page", () => {
    expect(withDerivedHasMore({ total: 90, page: 1 }).hasMore).toBe(false);
  });

  it("preserves every other field it passes through", () => {
    const meta = { total: 90, page: 2, limit: 10, totalPages: 9 };

    expect(withDerivedHasMore(meta)).toEqual({
      total: 90,
      page: 2,
      limit: 10,
      totalPages: 9,
      hasMore: true
    });
  });
});
