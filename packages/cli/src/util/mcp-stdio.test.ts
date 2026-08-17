import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import type { JsonRpcMessage, JsonRpcResponse } from "./mcp-rpc";
import { runStdioBridge } from "./mcp-stdio";

/**
 * THE FRAMING, DRIVEN — because every failure of it looks like the model
 * stopping mid-response and nothing looks like a CLI bug.
 *
 * A host talks to `nexus mcp serve` over a pipe it also owns, so there is no
 * error channel back: a dropped reply, a reply on a cancelled id, or one byte of
 * non-protocol text on stdout all present to the user as the assistant going
 * quiet. These cases are the four ways that has happened in this repository's
 * bridge before — a message split across chunk boundaries, a final message with
 * no trailing newline, a late reply after a cancel, and an unparseable line
 * answered with nothing at all.
 */

interface Harness {
  readonly input: PassThrough;
  readonly lines: string[];
  readonly warnings: string[];
  readonly done: Promise<void>;
  readonly seen: JsonRpcMessage[];
}

function harness(
  forward: (message: JsonRpcMessage, signal: AbortSignal) => Promise<JsonRpcResponse | null>
): Harness {
  const input = new PassThrough();
  const lines: string[] = [];
  const warnings: string[] = [];
  const seen: JsonRpcMessage[] = [];

  const done = runStdioBridge({
    input,
    write: (line) => lines.push(line),
    warn: (message) => warnings.push(message),
    forward: (message, signal) => {
      seen.push(message);
      return forward(message, signal);
    }
  });

  return { input, lines, warnings, done, seen };
}

const echo = async (message: JsonRpcMessage): Promise<JsonRpcResponse | null> =>
  "id" in message
    ? { jsonrpc: "2.0", id: message.id ?? null, result: { ok: message.method } }
    : null;

describe("the stdio bridge frames JSON-RPC the way an MCP host does", () => {
  it("answers one request with exactly one line", async () => {
    const h = harness(echo);
    h.input.end('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
    await h.done;

    expect(h.lines).toEqual(['{"jsonrpc":"2.0","id":1,"result":{"ok":"tools/list"}}']);
    // Every reply must be ONE line: an embedded newline splits one message into
    // two unparseable halves on the wire.
    expect(h.lines[0]).not.toContain("\n");
  });

  it("reassembles a message split across chunk boundaries", async () => {
    const h = harness(echo);
    h.input.write('{"jsonrpc":"2.0","id":7,"me');
    h.input.write('thod":"ping"}\n');
    h.input.end();
    await h.done;

    expect(h.seen).toEqual([{ jsonrpc: "2.0", id: 7, method: "ping" }]);
    expect(h.lines).toHaveLength(1);
  });

  it("still answers a final message that arrives with no trailing newline", async () => {
    // A host that closes the pipe straight after writing produces exactly this,
    // and dropping it is invisible: the client simply waits forever.
    const h = harness(echo);
    h.input.end('{"jsonrpc":"2.0","id":2,"method":"ping"}');
    await h.done;

    expect(h.lines).toEqual(['{"jsonrpc":"2.0","id":2,"result":{"ok":"ping"}}']);
  });

  it("sends no reply to a notification", async () => {
    const h = harness(echo);
    h.input.end('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    await h.done;

    expect(h.seen).toHaveLength(1);
    expect(h.lines).toEqual([]);
  });

  it("writes nothing for a notification even when the forwarder hands back a reply", async () => {
    // stdout belongs to the protocol: a reply to a message that carried no id is
    // an unmatched response, and one of those breaks the host's transport for
    // every request still in flight. The rule is the id, never the body.
    const h = harness(
      async (): Promise<JsonRpcResponse | null> => ({ jsonrpc: "2.0", id: null, result: {} })
    );
    h.input.end('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    await h.done;

    expect(h.seen).toHaveLength(1);
    expect(h.lines).toEqual([]);
  });

  it("answers an unparseable line with a parse error on the null id", async () => {
    const h = harness(echo);
    h.input.end("not json at all\n");
    await h.done;

    // The id lives inside the document that could not be read, so `null` is the
    // only honest answer — and answering NOTHING leaves the client waiting.
    expect(JSON.parse(h.lines[0])).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error: not valid JSON" }
    });
    expect(h.seen).toEqual([]);
  });

  it("answers a document that is not JSON-RPC with an invalid-request error", async () => {
    const h = harness(echo);
    h.input.end('{"id":5,"method":"tools/list"}\n');
    await h.done;

    const reply = JSON.parse(h.lines[0]) as JsonRpcResponse;
    expect(reply.id).toBe(5);
    expect(reply.error?.code).toBe(-32600);
  });

  it("aborts the in-flight request a cancellation names, and drops its reply", async () => {
    let captured: AbortSignal | undefined;
    let release: (() => void) | undefined;
    const h = harness(async (message, signal) => {
      captured = signal;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { jsonrpc: "2.0", id: message.id ?? null, result: { late: true } };
    });

    h.input.write('{"jsonrpc":"2.0","id":9,"method":"tools/call"}\n');
    await new Promise((resolve) => setImmediate(resolve));
    h.input.write(
      '{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":9}}\n'
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(captured?.aborted).toBe(true);

    release?.();
    h.input.end();
    await h.done;

    // A late reply to a cancelled id has broken stdio clients before, so the
    // answer is dropped rather than written.
    expect(h.lines).toEqual([]);
  });

  it("reports a forward that throws as a JSON-RPC error and stays connected", async () => {
    let first = true;
    const h = harness(async (message) => {
      if (first) {
        first = false;
        throw new Error("upstream exploded");
      }
      return { jsonrpc: "2.0", id: message.id ?? null, result: { ok: true } };
    });

    h.input.write('{"jsonrpc":"2.0","id":1,"method":"tools/call"}\n');
    await new Promise((resolve) => setImmediate(resolve));
    h.input.end('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    await h.done;

    const replies = h.lines.map((line) => JSON.parse(line) as JsonRpcResponse);
    expect(replies[0].error?.code).toBe(-32603);
    expect(replies[0].error?.message).toContain("upstream exploded");
    // The second message proves one failed request did not end the session.
    expect(replies[1].result).toEqual({ ok: true });
  });

  it("answers a forward that throws SYNCHRONOUSLY instead of dying", async () => {
    // A synchronous throw escapes a bare `forward(…).catch(…)` entirely: it
    // propagates out of the stream's `data` listener, which is an UNCAUGHT
    // exception and takes the process down mid-conversation. Every other
    // in-flight request dies with it, and the host reports the server as gone.
    const h = harness((): never => {
      throw new Error("sync boom");
    });

    h.input.end('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    await h.done;

    const reply = JSON.parse(h.lines[0]) as JsonRpcResponse;
    expect(reply.id).toBe(1);
    expect(reply.error?.message).toContain("sync boom");
  });

  it("waits for in-flight replies before it resolves", async () => {
    let release: (() => void) | undefined;
    const h = harness(async (message) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { jsonrpc: "2.0", id: message.id ?? null, result: { ok: true } };
    });

    h.input.end('{"jsonrpc":"2.0","id":3,"method":"ping"}\n');
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.lines).toEqual([]);

    release?.();
    await h.done;
    // Resolving before the pending reply landed would drop the answer to a
    // message the host had already sent and is still waiting on.
    expect(h.lines).toHaveLength(1);
  });

  it("ignores blank lines rather than answering them", async () => {
    const h = harness(echo);
    h.input.end('\n\n{"jsonrpc":"2.0","id":4,"method":"ping"}\n\n');
    await h.done;

    expect(h.lines).toHaveLength(1);
    expect(h.warnings).toEqual([]);
  });
});
