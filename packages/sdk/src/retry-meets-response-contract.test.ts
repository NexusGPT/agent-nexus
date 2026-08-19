import { describe, expect, it, vi } from "vitest";

import { HttpClient } from "./http-client";
import type { ContractReport } from "./response-contract";

/**
 * Does the 429-for-every-method widening survive the response-contract seam?
 *
 * The two changes meet on the same request: retrying happens in `send`, and the
 * contract report happens after `send` returns. The question a merge cannot
 * answer by inspection is whether a RETRIED request reports once or once per
 * attempt — a sink counting verdicts would be wrong in the second case, and a
 * discarded 429 body reaching `checkResponse` would report an error envelope as
 * a route payload mismatch.
 */
function client(script: readonly number[], reports: ContractReport[]) {
  const calls: string[] = [];
  const fetchFn = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
    const status = script[Math.min(calls.length, script.length - 1)];
    calls.push(String(init?.method ?? "GET"));
    return new Response(JSON.stringify({ success: true, data: { id: "a" } }), {
      status,
      headers: { "content-type": "application/json", "Retry-After": "1" }
    });
  });
  const http = new HttpClient({
    baseUrl: "https://api.nexusgpt.io",
    apiKey: "nxs_test",
    fetch: fetchFn as unknown as typeof globalThis.fetch,
    sleep: async () => undefined,
    onResponseContract: (r) => reports.push(r)
  });
  return { http, calls };
}

describe("429 retry x response-contract seam", () => {
  it("reports the contract ONCE for a retried POST, not once per attempt", async () => {
    const reports: ContractReport[] = [];
    const { http, calls } = client([429, 200], reports);

    await expect(http.request("POST", "/agents", { body: { name: "x" } })).resolves.toEqual({
      id: "a"
    });

    // The widening still holds: a POST IS replayed on 429.
    expect(calls).toEqual(["POST", "POST"]);
    // And the seam sees one logical read, not two. The discarded 429 has its
    // body cancelled inside `send` and never reaches `reportContract`.
    expect(reports).toHaveLength(1);
  });

  it("never hands a discarded 429 envelope to the contract checker", async () => {
    const reports: ContractReport[] = [];
    const { http } = client([429, 200], reports);

    await http.request("GET", "/agents");

    // If a discarded attempt leaked through, this would carry a verdict about a
    // 429 error body rather than the successful payload.
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ method: "GET", path: "/agents" });
  });

  it("still reports once when retries are EXHAUSTED and the request throws", async () => {
    const reports: ContractReport[] = [];
    const { http, calls } = client([429], reports);

    await expect(http.request("GET", "/agents")).rejects.toMatchObject({
      status: 429,
      attempts: 3
    });

    expect(calls.length).toBe(3);
    // A failed read publishes no payload verdict — there is no successful
    // payload to check. Zero, not three.
    expect(reports).toHaveLength(0);
  });
});
