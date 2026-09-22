import { createServer, type Server, type Socket } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { fetchWithDeadline, RequestTimedOutError } from "./request-deadline";

/**
 * Both halves of the hang, against a REAL listener rather than a stubbed
 * `fetch`.
 *
 * A stub cannot produce the case that matters here. The defect is that `fetch`
 * resolves on the status line and the body arrives later, so a deadline placed
 * around the call and cleared on resolution bounds nothing that a socket
 * actually does. Only a peer that really sends headers and then really stops
 * exercises that, and it is the second case below.
 *
 * Every listener binds port 0 — the kernel picks a free one — and is closed in
 * `afterEach` with its sockets destroyed, so nothing is left holding a port.
 */

let server: Server | undefined;
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  const running = server;
  server = undefined;
  if (running) await new Promise<void>((resolve) => running.close(() => resolve()));
});

/** Close the current listener mid-test, so one case can open several in turn. */
async function closeListener(): Promise<void> {
  for (const socket of sockets.splice(0)) socket.destroy();
  const running = server;
  server = undefined;
  if (running) await new Promise<void>((resolve) => running.close(() => resolve()));
}

/** A listener that accepts, runs `onConnect`, and never completes a response. */
async function listen(onConnect: (socket: Socket) => void): Promise<string> {
  const created = createServer((socket) => {
    sockets.push(socket);
    onConnect(socket);
  });
  server = created;
  await new Promise<void>((resolve) => created.listen(0, "127.0.0.1", () => resolve()));
  const address = created.address();
  if (address === null || typeof address === "string") throw new Error("no TCP address");
  return `http://127.0.0.1:${address.port}/probe`;
}

describe("fetchWithDeadline bounds a peer that stops answering", () => {
  it("refuses a connection that is accepted and never answered", async () => {
    const url = await listen(() => {
      // Accept and say nothing. Pre-deadline, `fetch` waits here for ever.
    });

    await expect(fetchWithDeadline(url, {}, { timeout: 250 })).rejects.toBeInstanceOf(
      RequestTimedOutError
    );
  });

  it("refuses a peer that sends HEADERS and then goes silent", async () => {
    // 🔴 THE ARM THE OBVIOUS FIX PASSES AND STILL HANGS ON. A timer armed
    // around `fetch` alone is satisfied the instant this 200 arrives, and the
    // body below never comes — so the deadline is already cleared when the wait
    // that matters begins. Only a deadline covering the body read reds here.
    const url = await listen((socket) => {
      socket.write("HTTP/1.1 200 OK\r\nContent-Length: 12\r\n\r\n");
    });

    await expect(fetchWithDeadline(url, {}, { timeout: 250 })).rejects.toBeInstanceOf(
      RequestTimedOutError
    );
  });

  it("CONTROL: a peer that answers in full comes back, body and all", async () => {
    // Without this the two arms above are satisfied by a helper that rejects
    // unconditionally, which is indistinguishable from a working deadline.
    const url = await listen((socket) => {
      socket.write("HTTP/1.1 201 Created\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello");
      socket.end();
    });

    const { response, text } = await fetchWithDeadline(url, {}, { timeout: 2_000 });
    expect(response.status).toBe(201);
    expect(text).toBe("hello");
  });

  it("classifies a 200-then-silence stall as a TIMEOUT, not a generic network failure", async () => {
    // BUGBOT #6280 fe71de0d: the claim is that after headers arrive, undici
    // rejects the body read as `TypeError: terminated` with the abort only as a
    // `cause` — so this case would surface as a network failure and lose the
    // sentence naming the budget. Measured here rather than reasoned about.
    //
    // Four body-phase stall shapes, because the claim is about WHERE the abort
    // lands: an empty body under a Content-Length, a partial one, a chunked
    // stream with one chunk, and a chunked stream with none.
    const preambles = [
      "HTTP/1.1 200 OK\r\nContent-Length: 12\r\n\r\n",
      "HTTP/1.1 200 OK\r\nContent-Length: 12\r\n\r\nhalf",
      "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nhalf\r\n",
      "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n"
    ];

    // 🔴 COLLECTED, THEN ASSERTED ONCE. A failing `expect` throws, so asserting
    // INSIDE the loop aborts it — a mutant that only broke the third shape
    // would leave the fourth unrun, scored by nothing, while the block's single
    // red read as though it covered all four. Gathering first means every shape
    // is exercised on every run and the refusal names all of them.
    const misclassified: string[] = [];
    for (const preamble of preambles) {
      const url = await listen((socket) => socket.write(preamble));
      const thrown = await fetchWithDeadline(url, {}, { timeout: 200 }).then(
        () => null,
        (err: unknown) => err
      );
      await closeListener();

      const where = JSON.stringify(preamble);
      if (!(thrown instanceof RequestTimedOutError)) {
        misclassified.push(
          `${where} -> ${(thrown as Error)?.constructor?.name}: ${(thrown as Error)?.message}`
        );
        continue;
      }
      // The user-visible half: the budget has to survive into the message the
      // CLI renders, which is what a generic network failure would destroy.
      const message = thrown.message;
      if (!message.includes("200 ms") || !message.includes("--timeout <seconds>")) {
        misclassified.push(`${where} -> timeout, but the message hides the budget: ${message}`);
      }
    }

    expect(
      misclassified,
      `these stall shapes did not surface as a timeout naming its budget:\n  ${misclassified.join("\n  ")}`
    ).toEqual([]);
  });

  it("CONTROL: a peer that DESTROYS the socket is a network failure, never a timeout", async () => {
    // The other direction, and the one that makes the arm above a real claim:
    // `TypeError: terminated` does occur — when the peer kills the connection —
    // and calling THAT a timeout would name a budget that had nothing to do
    // with it. So the classification must separate the two, not widen to catch
    // everything.
    const url = await listen((socket) => {
      socket.write("HTTP/1.1 200 OK\r\nContent-Length: 1000\r\n\r\nxxxxxxxxxx");
      setTimeout(() => socket.destroy(), 60);
    });

    const thrown = await fetchWithDeadline(url, {}, { timeout: 5_000 }).then(
      () => null,
      (err: unknown) => err
    );
    expect(thrown).not.toBeInstanceOf(RequestTimedOutError);
    expect(thrown).toBeInstanceOf(TypeError);
  });

  it("names the budget it gave up on, so a raise is actionable", () => {
    const error = new RequestTimedOutError("http://example.test/x", 250);
    expect(error.message).toContain("250 ms");
    expect(error.message).toContain("--timeout <seconds>");
  });
});
