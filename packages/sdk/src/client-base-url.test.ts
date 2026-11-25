import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NexusClient } from "./client";
import { NexusError } from "./errors";
import { DEFAULT_NEXUS_BASE_URL, NEXUS_REGION_BASE_URLS } from "./regions";

/**
 * WHICH HOST A `NexusClient` SENDS TO: `baseUrl` > `region` > `NEXUS_BASE_URL` >
 * the EU default.
 *
 * Every arm reads the URL the client actually REQUESTED, off the injected
 * `fetch`, rather than any field the constructor stores — the request is the
 * behaviour, and a stored field can be right while the request goes elsewhere.
 * One arm per `it`, so a mutant reordering the chain is scored on every term it
 * moves rather than only the first assertion it trips.
 *
 * The literals below are deliberate: the default arm pins the exact host the
 * SDK has always targeted, so it stays red if someone edits the table's `eu`
 * row, which comparing against the table itself could never do.
 */

const EU = "https://api.nexusgpt.io";
const US = "https://api.us.gpt.nexus";
const EXPLICIT = "https://api.example.test";
const FROM_ENV = "https://env.example.test";

const SAVED = process.env.NEXUS_BASE_URL;

beforeEach(() => {
  delete process.env.NEXUS_BASE_URL;
});

afterEach(() => {
  if (SAVED === undefined) delete process.env.NEXUS_BASE_URL;
  else process.env.NEXUS_BASE_URL = SAVED;
});

/** The URL of the one request `client.me.get()` sends under `opts`. */
async function requestedUrl(
  opts: ConstructorParameters<typeof NexusClient>[0] = {}
): Promise<string> {
  const urls: string[] = [];
  const client = new NexusClient({
    apiKey: "nxs_test",
    maxRetries: 0,
    fetch: (input) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: { id: "org", name: "Org" } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    },
    ...opts
  });
  await client.me.get().catch(() => undefined);
  expect(urls).toHaveLength(1);
  return urls[0];
}

describe("NexusClient base URL precedence", () => {
  it("with nothing set, targets the EU host exactly as it always has", async () => {
    expect(await requestedUrl()).toBe("https://api.nexusgpt.io/api/public/v1/me");
  });

  it("the exported default IS the EU host", () => {
    expect(DEFAULT_NEXUS_BASE_URL).toBe(EU);
    expect(NEXUS_REGION_BASE_URLS.eu).toBe(EU);
  });

  it("region us targets the US host", async () => {
    expect(await requestedUrl({ region: "us" })).toBe(`${US}/api/public/v1/me`);
  });

  it("region eu targets the EU host", async () => {
    expect(await requestedUrl({ region: "eu" })).toBe(`${EU}/api/public/v1/me`);
  });

  it("NEXUS_BASE_URL is used when neither baseUrl nor region is passed", async () => {
    process.env.NEXUS_BASE_URL = FROM_ENV;
    expect(await requestedUrl()).toBe(`${FROM_ENV}/api/public/v1/me`);
  });

  it("an explicit baseUrl wins over NEXUS_BASE_URL", async () => {
    process.env.NEXUS_BASE_URL = FROM_ENV;
    expect(await requestedUrl({ baseUrl: EXPLICIT })).toBe(`${EXPLICIT}/api/public/v1/me`);
  });

  it("region wins over NEXUS_BASE_URL", async () => {
    process.env.NEXUS_BASE_URL = FROM_ENV;
    expect(await requestedUrl({ region: "us" })).toBe(`${US}/api/public/v1/me`);
  });

  it("an explicit baseUrl wins over region", async () => {
    expect(await requestedUrl({ baseUrl: EXPLICIT, region: "us" })).toBe(
      `${EXPLICIT}/api/public/v1/me`
    );
  });

  it("a blank NEXUS_BASE_URL still falls through to the EU default", async () => {
    process.env.NEXUS_BASE_URL = "";
    expect(await requestedUrl()).toBe(`${EU}/api/public/v1/me`);
  });

  it("refuses a region the table does not hold instead of resolving it", () => {
    // `Reflect.construct` takes its arguments untyped, which is exactly the
    // caller this refusal exists for: plain JavaScript, or a value read from
    // configuration. No cast is needed to reach the runtime check.
    const construct = (): unknown =>
      Reflect.construct(NexusClient, [{ apiKey: "nxs_test", region: "mars" }]);
    expect(construct).toThrow(NexusError);
    expect(construct).toThrow(/Accepted: eu, us/);
  });
});
