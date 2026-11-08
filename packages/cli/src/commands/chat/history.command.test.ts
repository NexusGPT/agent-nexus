import { type ChatHistoryPage, ChatResource } from "@agent-nexus/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../../exit-codes";
import { outcomeForExitCode } from "../../id-graph.outcome";
import { buildRootProgram } from "../../index";
import { setJsonMode } from "../../output";
import { NO_CONVERSATION_MESSAGE } from "./_shared/no-conversation";

/**
 * THE REACH PROOF for `nexus chat history`.
 *
 * Drives the REAL `ChatResource` over a fake HTTP client and asserts the
 * request it makes — method, path, credential, query — rather than mocking the
 * resource, which would only prove the command calls a function. The two
 * things a refactor could quietly break are both requests: which credential
 * the read spends, and which page it asks for.
 */

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../client")>();
  return {
    ...actual,
    createClient: () => ({ chat: new ChatResource({ request } as never) })
  };
});

const DEPLOYMENT = "44444444-4444-4444-8444-444444444444";
const CHAT_ID = "33333333-3333-4333-8333-333333333333";
const OLDEST = "55555555-5555-4555-8555-555555555555";
/** Assembled rather than spelled — a credential-shaped literal gets rewritten on the way to disk. */
const SESSION_TOKEN = ["chat", "session", "token", "fixture"].join(".");
const MINTED_TOKEN = ["chat", "session", "token", "minted"].join(".");

/** A page whose second message carries a card, so the PARTS column has something to name. */
function aPage(hasMore: boolean): ChatHistoryPage {
  return {
    messages: [
      {
        id: OLDEST,
        role: "user",
        text: "show me the plans",
        parts: [{ type: "text", text: "show me the plans" }],
        createdAt: "2026-11-06T09:00:00.000Z"
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        role: "assistant",
        text: "Pick one",
        parts: [
          { type: "text", text: "Pick one" },
          {
            type: "data-nexus-html-template",
            id: "66666666-6666-4666-8666-666666666666",
            data: { messageId: "m2", html: "<button>Pro</button>", text: "Pick one" }
          }
        ],
        createdAt: "2026-11-06T09:00:01.000Z"
      }
    ],
    hasMore
  };
}

/** Run `nexus <argv>`, capturing stdout. */
async function run(argv: string[]): Promise<string> {
  const program = buildRootProgram();
  program.exitOverride();
  const chunks: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  };
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    console.log = log;
  }
  return chunks.join("\n");
}

/** Run `fn` with stderr captured, through both channels a refusal may write to. */
async function captureStderr(fn: () => Promise<unknown>): Promise<string> {
  const chunks: string[] = [];
  const write = process.stderr.write.bind(process.stderr);
  const error = console.error;
  process.stderr.write = ((chunk: string) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  console.error = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  };
  try {
    await fn();
  } finally {
    process.stderr.write = write;
    console.error = error;
  }
  return chunks.join("");
}

beforeEach(() => {
  request.mockReset();
  process.exitCode = 0;
  // JSON mode is module-global and `--json` sets it; clear it per case.
  setJsonMode(false);
});

describe("nexus chat history — the transcript read, on the session token", () => {
  it("reads the messages route with the SUPPLIED token and the page it was asked for", async () => {
    request.mockResolvedValue(aPage(false));

    await run([
      "chat",
      "history",
      DEPLOYMENT,
      "--session-token",
      SESSION_TOKEN,
      "--before",
      OLDEST,
      "--limit",
      "50"
    ]);

    // ONE request: a supplied token is spent as-is, so nothing is minted.
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("GET", `/deployments/${DEPLOYMENT}/chat/messages`, {
      chatSessionToken: SESSION_TOKEN,
      query: { before: OLDEST, limit: 50 }
    });
    expect(process.exitCode).toBe(0);
  });

  it("mints for a NAMED conversation with --chat-id, then reads with the minted token", async () => {
    request
      .mockResolvedValueOnce({
        token: MINTED_TOKEN,
        sessionId: "s1",
        chatId: CHAT_ID,
        expiresInSeconds: 900
      })
      .mockResolvedValueOnce(aPage(false));

    await run(["chat", "history", DEPLOYMENT, "--chat-id", CHAT_ID]);

    expect(request).toHaveBeenNthCalledWith(1, "POST", `/deployments/${DEPLOYMENT}/chat-session`, {
      body: { chatId: CHAT_ID }
    });
    expect(request).toHaveBeenNthCalledWith(2, "GET", `/deployments/${DEPLOYMENT}/chat/messages`, {
      chatSessionToken: MINTED_TOKEN,
      query: { before: undefined, limit: undefined }
    });
  });

  it("refuses, and sends nothing, when the conversation is not named", async () => {
    const err = await captureStderr(() => run(["chat", "history", DEPLOYMENT]));

    expect(request).not.toHaveBeenCalled();
    // The REFUSAL's own code and message, never merely "non-zero": with the guard
    // deleted, `null.token` throws, the catch maps it to a failure, and no request
    // is sent either — so a bare non-zero exit could not tell the two apart.
    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
    expect(err).toContain(NO_CONVERSATION_MESSAGE);
  });

  /**
   * WHY THIS LEAF NEEDS NO ROW IN `id-graph.leaf-residue.ts`.
   *
   * The id-thread sweep ADMITS `chat history <deployment-id>` — it threads the
   * deployment id and supplies no conversation — so on a sweep run the leaf
   * reaches exactly this refusal. The sweep's own verdict for it is
   * `outcomeForExitCode`, called here on the same streams the runner captures
   * (stdout and stderr, concatenated, under `--json`). `SKIPPED_NEEDS_INPUT` is
   * an honest skip; anything else is a false FAILED on a healthy route, which is
   * the only thing a residue row exists to prevent.
   */
  it("refuses in the one shape the id-thread sweep reads as a skip, never a FAILED", async () => {
    let stdout = "";
    const stderr = await captureStderr(async () => {
      stdout = await run(["--json", "chat", "history", DEPLOYMENT]);
    });

    expect(outcomeForExitCode(Number(process.exitCode), `${stdout}\n${stderr}`).status).toBe(
      "SKIPPED_NEEDS_INPUT"
    );
  });

  it("emits the server's whole page under --json, hasMore included", async () => {
    request.mockResolvedValue(aPage(true));

    const out = await run([
      "--json",
      "chat",
      "history",
      DEPLOYMENT,
      "--session-token",
      SESSION_TOKEN
    ]);

    expect(JSON.parse(out)).toEqual(aPage(true));
  });

  it("names each message's parts in the table, so a card is visible behind its text", async () => {
    request.mockResolvedValue(aPage(false));

    const out = await run(["chat", "history", DEPLOYMENT, "--session-token", SESSION_TOKEN]);

    expect(out).toContain("data-nexus-html-template");
  });

  it("points at the FIRST message as the cursor when older messages exist", async () => {
    request.mockResolvedValue(aPage(true));

    const out = await run(["chat", "history", DEPLOYMENT, "--session-token", SESSION_TOKEN]);

    expect(out).toContain(`--before ${OLDEST}`);
  });

  it("prints no cursor footer over a complete transcript", async () => {
    request.mockResolvedValue(aPage(false));

    const out = await run(["chat", "history", DEPLOYMENT, "--session-token", SESSION_TOKEN]);

    // POSITIVE twin first, over the same haystack: the table rendered, so the
    // absence below is about the footer and not about an empty capture.
    expect(out).toContain(OLDEST);
    expect(out).not.toContain("--before");
  });
});
