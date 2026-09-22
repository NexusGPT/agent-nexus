import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { DownloadStalledError, downloadWithStallDeadline } from "./stall-deadline";

/**
 * The two arms that together say "silence" rather than "elapsed time", and the
 * FIRST is the one that matters — it is the arm a total deadline fails.
 *
 * A total budget and a stall budget are indistinguishable on a transfer that
 * succeeds quickly and on one that is dead from the start. They differ on
 * exactly one case: a transfer that keeps arriving for longer than the budget.
 * A total deadline aborts it; a stall deadline does not. So a suite without the
 * slow-but-progressing arm would pass identically over the wrong instrument.
 *
 * Every server binds port 0 and is closed in `afterEach`.
 */

let server: Server | undefined;

afterEach(async () => {
  const running = server;
  server = undefined;
  if (running) {
    running.closeAllConnections();
    await new Promise<void>((resolve) => running.close(() => resolve()));
  }
});

async function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const created = createServer(handler);
  server = created;
  await new Promise<void>((resolve) => created.listen(0, "127.0.0.1", () => resolve()));
  const address = created.address();
  if (address === null || typeof address === "string") throw new Error("no TCP address");
  return `http://127.0.0.1:${address.port}/bundle.tar.gz`;
}

describe("downloadWithStallDeadline budgets silence, not duration", () => {
  it("does NOT abort a transfer that keeps arriving past its own budget", async () => {
    // 10 chunks, ~60 ms apart: ~600 ms of transfer under a 250 ms budget. An
    // elapsed-time deadline of 250 ms aborts this at chunk 4 with the download
    // healthy — which is the defect a naive fix introduces, and it is worse
    // than the hang because it refuses work that was going to succeed.
    const url = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "application/gzip" });
      let sent = 0;
      const tick = setInterval(() => {
        res.write("x".repeat(64));
        if (++sent === 10) {
          clearInterval(tick);
          res.end();
        }
      }, 60);
    });

    const { response, body } = await downloadWithStallDeadline(url, {}, { timeout: 250 });

    expect(response.status).toBe(200);
    expect(body.length).toBe(640);
  });

  it("abandons a transfer that starts and then goes silent", async () => {
    const url = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "application/gzip" });
      res.write("x".repeat(64));
      // …and never another byte. `res.end()` is deliberately not called.
    });

    await expect(downloadWithStallDeadline(url, {}, { timeout: 200 })).rejects.toBeInstanceOf(
      DownloadStalledError
    );
  });

  it("abandons a peer that accepts the connection and never answers", async () => {
    const url = await listen(() => {
      // Never writes a status line.
    });

    await expect(downloadWithStallDeadline(url, {}, { timeout: 200 })).rejects.toBeInstanceOf(
      DownloadStalledError
    );
  });

  it("hands a non-2xx back rather than throwing, so callers keep their own mapping", async () => {
    const url = await listen((_req, res) => {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("nope");
    });

    const { response, body } = await downloadWithStallDeadline(url, {}, { timeout: 2_000 });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
    expect(body.toString()).toBe("nope");
  });
});
