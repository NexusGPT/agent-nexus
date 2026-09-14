import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { GoldenConversationsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * `eval conv` reaches the wire with the bodies the API refuses to guess.
 *
 * The assertions are on the BODY, not on the flags being declared — a flag
 * parsed into `opts` and never copied into the request is exactly the failure
 * this covers (`--help` listing it would still look right). Three flags here
 * are file-indirected (`accept --file`, `set-golden --file`, `checkpoint
 * --criteria`), so the test also proves the CLI reads the FILE's content into
 * the body rather than sending the path.
 */

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    goldenConversations: new GoldenConversationsResource({ request } as never)
  })
}));

import { registerEvalCommands } from "./eval";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerEvalCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

const CONV = "33333333-3333-4333-8333-333333333333";
const AGENT = "11111111-1111-4111-8111-111111111111";
const DEPLOY = "22222222-2222-4222-8222-222222222222";

const TURN = {
  id: "44444444-4444-4444-8444-444444444444",
  conversationId: CONV,
  index: 1,
  role: "AGENT",
  content: "Sure — what's your order number?",
  toolCalls: null,
  edited: false,
  isCheckpoint: true,
  criteria: null,
  createdAt: "2026-09-07T00:00:00.000Z",
  updatedAt: "2026-09-07T00:00:00.000Z"
};

let tmpFile: string | undefined;

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue(TURN);
});

afterEach(() => {
  if (tmpFile !== undefined) {
    fs.rmSync(tmpFile, { force: true });
    tmpFile = undefined;
  }
});

function writeTmp(content: string): string {
  tmpFile = path.join(os.tmpdir(), `eval-test-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmpFile, content);
  return tmpFile;
}

describe("eval conv create", () => {
  it("sends the agent/deployment/title body, with --variant when given", async () => {
    request.mockResolvedValue({ id: CONV, status: "DRAFT", authoringVersionId: null });
    await run([
      "eval",
      "conv",
      "create",
      "--agent-id",
      AGENT,
      "--deployment-id",
      DEPLOY,
      "--title",
      "refund flow",
      "--variant",
      "French"
    ]);

    expect(request).toHaveBeenCalledTimes(1);
    const [method, route, options] = request.mock.calls[0] as [string, string, { body: unknown }];
    expect(method).toBe("POST");
    expect(route).toBe("/prompt-eval/golden-conversations");
    expect(options.body).toEqual({
      agentId: AGENT,
      deploymentId: DEPLOY,
      title: "refund flow",
      variant: "French"
    });
  });

  it("omits variant and description entirely when not given", async () => {
    request.mockResolvedValue({ id: CONV, status: "DRAFT", authoringVersionId: null });
    await run([
      "eval",
      "conv",
      "create",
      "--agent-id",
      AGENT,
      "--deployment-id",
      DEPLOY,
      "--title",
      "refund flow"
    ]);
    const [, , options] = request.mock.calls[0] as [string, string, { body: unknown }];
    expect(options.body).toEqual({ agentId: AGENT, deploymentId: DEPLOY, title: "refund flow" });
  });
});

describe("eval conv add-user", () => {
  it("sends the text body to the conversation's turns/user route", async () => {
    await run(["eval", "conv", "add-user", "--conversation-id", CONV, "--text", "I want a refund"]);
    const [method, route, options] = request.mock.calls[0] as [string, string, { body: unknown }];
    expect(method).toBe("POST");
    expect(route).toBe(`/prompt-eval/golden-conversations/${CONV}/turns/user`);
    expect(options.body).toEqual({ text: "I want a refund" });
  });
});

describe("eval conv generate", () => {
  it("POSTs generate with no body", async () => {
    request.mockResolvedValue({
      conversationId: CONV,
      sessionId: "55555555-5555-4555-8555-555555555555",
      candidate: { content: "hi", toolCalls: [], sessionId: "s", latencyMs: null, tokensUsed: null }
    });
    await run(["eval", "conv", "generate", "--conversation-id", CONV]);
    const [method, route] = request.mock.calls[0] as [string, string];
    expect(method).toBe("POST");
    expect(route).toBe(`/prompt-eval/golden-conversations/${CONV}/generate`);
  });
});

describe("eval conv accept", () => {
  it("sends NO body on a plain accept", async () => {
    await run(["eval", "conv", "accept", "--conversation-id", CONV]);
    const [method, route, options] = request.mock.calls[0] as [
      string,
      string,
      { body?: unknown } | undefined
    ];
    expect(method).toBe("POST");
    expect(route).toBe(`/prompt-eval/golden-conversations/${CONV}/accept`);
    expect(options?.body).toBeUndefined();
  });

  it("reads --file and sends its CONTENT as the edit", async () => {
    const file = writeTmp("Refund booked — 3-5 business days.");
    await run(["eval", "conv", "accept", "--conversation-id", CONV, "--file", file]);
    const [, , options] = request.mock.calls[0] as [string, string, { body: unknown }];
    expect(options.body).toEqual({ content: "Refund booked — 3-5 business days." });
  });
});

describe("eval conv set-golden", () => {
  it("PUTs the file's content at the indexed turn", async () => {
    const file = writeTmp("EDITED GOLDEN");
    await run([
      "eval",
      "conv",
      "set-golden",
      "--conversation-id",
      CONV,
      "--index",
      "3",
      "--file",
      file
    ]);
    const [method, route, options] = request.mock.calls[0] as [string, string, { body: unknown }];
    expect(method).toBe("PUT");
    expect(route).toBe(`/prompt-eval/golden-conversations/${CONV}/turns/3/content`);
    expect(options.body).toEqual({ content: "EDITED GOLDEN" });
  });
});

describe("eval conv checkpoint", () => {
  it("maps --on plus --criteria to {isCheckpoint: true, criteria: parsed}", async () => {
    const file = writeTmp('[{"name":"mentions_delay","rubric":"states the delay"}]');
    await run([
      "eval",
      "conv",
      "checkpoint",
      "--conversation-id",
      CONV,
      "--index",
      "3",
      "--on",
      "--criteria",
      file
    ]);
    const [method, route, options] = request.mock.calls[0] as [string, string, { body: unknown }];
    expect(method).toBe("PUT");
    expect(route).toBe(`/prompt-eval/golden-conversations/${CONV}/turns/3/checkpoint`);
    expect(options.body).toEqual({
      isCheckpoint: true,
      criteria: [{ name: "mentions_delay", rubric: "states the delay" }]
    });
  });

  it("maps --off to {isCheckpoint: false} and leaves criteria off the wire", async () => {
    await run(["eval", "conv", "checkpoint", "--conversation-id", CONV, "--index", "5", "--off"]);
    const [, , options] = request.mock.calls[0] as [string, string, { body: unknown }];
    expect(options.body).toEqual({ isCheckpoint: false });
  });

  it("refuses when neither --on nor --off is given, without calling the API", async () => {
    await run(["eval", "conv", "checkpoint", "--conversation-id", CONV, "--index", "3"]);
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).not.toBe(0);
    process.exitCode = 0;
  });
});

describe("eval conv delete", () => {
  it("refuses without --yes and never calls the API", async () => {
    await run(["eval", "conv", "delete", "--conversation-id", CONV]);
    expect(request).not.toHaveBeenCalled();
    process.exitCode = 0;
  });

  it("deletes with --yes", async () => {
    request.mockResolvedValue({ deleted: true });
    await run(["eval", "conv", "delete", "--conversation-id", CONV, "--yes"]);
    const [method, route] = request.mock.calls[0] as [string, string];
    expect(method).toBe("DELETE");
    expect(route).toBe(`/prompt-eval/golden-conversations/${CONV}`);
  });
});

describe("eval conv ready", () => {
  it("POSTs ready and exits 0 when the server answers READY", async () => {
    request.mockResolvedValue({ id: CONV, title: "refund flow", status: "READY" });
    await run(["eval", "conv", "ready", "--conversation-id", CONV]);
    const [method, route] = request.mock.calls[0] as [string, string];
    expect(method).toBe("POST");
    expect(route).toBe(`/prompt-eval/golden-conversations/${CONV}/ready`);
    expect(process.exitCode ?? 0).toBe(0);
  });
});
