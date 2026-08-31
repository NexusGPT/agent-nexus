import type {
  PromptAssistantChatBody,
  PromptAssistantThreadResponse,
  WaitForThreadResult
} from "@agent-nexus/sdk";
import { Command, InvalidArgumentError } from "commander";

import { createClient, MAX_TIMEOUT_SECONDS, seconds, timeoutSecondsToMs } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError, reportFailure } from "../errors";
import { color, isJsonMode, printEnvelope, printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";
import {
  PROMPT_ASSISTANT_CHAT__BODY_MODE,
  PROMPT_ASSISTANT_CHAT_CONTRACT
} from "./prompt-assistant.contract.generated";

/**
 * How long `prompt-assistant chat` waits on the API before giving up. The
 * assistant runs LLM calls that take minutes, so this sits far above the SDK's
 * 30 s default.
 *
 * SECONDS — the unit `createClient` takes, and the unit of the global
 * `--timeout <seconds>` flag it overrides. A MILLISECOND value here is
 * multiplied by 1000 a second time, overflows Node's 32-bit timer, is clamped
 * to 1 ms, and aborts every chat before the request leaves the machine
 * (NEX-3707). `timeoutSecondsToMs` now refuses such a value outright.
 */
const PROMPT_ASSISTANT_DEFAULT_TIMEOUT_SECONDS = seconds(2 * 60 * 60);

/** Maximum time the reply poll waits without `--wait` (5 min). */
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * How long `--wait` blocks before giving up, when `--wait-timeout` is not given.
 *
 * Thirty minutes because the two threads NEX-2923 was filed over took 13 and 26
 * minutes to reach `completed`, measured end-to-end in production. A default
 * under the observed maximum is a default that times out on the exact case the
 * flag exists for.
 */
const DEFAULT_WAIT_SECONDS = 30 * 60;

/** Parser for `--wait-timeout <seconds>`. Same ceiling as the global `--timeout`. */
function parseWaitSeconds(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("--wait-timeout must be a positive number of seconds.");
  }
  if (parsed > MAX_TIMEOUT_SECONDS) {
    throw new InvalidArgumentError(
      `--wait-timeout must be at most ${MAX_TIMEOUT_SECONDS} seconds.`
    );
  }
  return parsed;
}

/**
 * Ceiling on a single server-held wait, mirroring the API's own cap.
 *
 * Not imported from `@nexus/types`: this package talks to the API through
 * `@agent-nexus/sdk` and does not depend on the contract package. The value is
 * a property of the proxy in front of the API (a request is cut at 60 s), and
 * the server re-validates it — a client that asked for more would get a 400,
 * not a longer hold.
 */
const MAX_AWAIT_SECONDS = 55;

/** Parser for `await-thread --wait-timeout <seconds>`, which caps far lower than the poll's. */
function parseAwaitSeconds(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_AWAIT_SECONDS) {
    throw new InvalidArgumentError(
      `--wait-timeout must be a whole number of seconds between 1 and ${MAX_AWAIT_SECONDS}.`
    );
  }
  return parsed;
}

/** Parser for `await-thread --after-message-count <n>`. */
function parseAfterMessageCount(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError("--after-message-count must be a whole number of 0 or more.");
  }
  return parsed;
}

/**
 * Narrate a long wait on the human channel — and ONLY there.
 *
 * Under `--json` this prints nothing at all: a progress line on stdout is a
 * second document beside the payload, which is the one thing `--json` promises
 * never to be. Only status CHANGES are printed, so a half-hour generation is a
 * handful of lines rather than 120.
 */
function waitNarrator(): (thread: PromptAssistantThreadResponse, elapsedMs: number) => void {
  let last: string | undefined;
  return (thread, elapsedMs) => {
    if (isJsonMode() || thread.status === last) return;
    last = thread.status;
    const elapsed = Math.round(elapsedMs / 1000);
    const note = thread.status === "generating" ? " (writing the prompt — this takes minutes)" : "";
    console.error(color.dim(`… ${thread.status}${note} — ${elapsed}s elapsed`));
  };
}

/** The `--wait` options, resolved once so both verbs read them identically. */
function waitOptions(
  opts: { wait?: boolean; waitTimeout?: number },
  afterMessageCount?: number
): {
  until: "prompt" | "assistant-reply";
  afterMessageCount?: number;
  timeoutMs?: number;
  onPoll: (thread: PromptAssistantThreadResponse, elapsedMs: number) => void;
} {
  return {
    until: opts.wait ? "prompt" : "assistant-reply",
    afterMessageCount,
    // Without `--wait`: the pre-existing 5-minute reply poll, unchanged. It
    // stops at `generating`, which is why `--wait` had to exist.
    timeoutMs: opts.wait
      ? timeoutSecondsToMs(opts.waitTimeout ?? DEFAULT_WAIT_SECONDS)
      : POLL_TIMEOUT_MS,
    onPoll: waitNarrator()
  };
}

/** The one document a wait produces, on every outcome including the timeout. */
function waitDocument(result: WaitForThreadResult): Record<string, unknown> {
  const { thread } = result;
  const lastAssistant = [...(thread.messages ?? [])].reverse().find((m) => m.role === "assistant");
  return {
    threadId: thread.threadId,
    status: thread.status,
    response: lastAssistant?.content ?? "",
    ...(thread.promptResult ? { promptResult: thread.promptResult } : {}),
    ...(result.outcome === "timed-out" ? { timedOut: true } : {})
  };
}

/** The `get-thread` record shape, shared by the plain read and the `--wait` read. */
const GET_THREAD_FIELDS = [
  { key: "threadId", label: "ID" },
  { key: "status", label: "Status" },
  // How long it has been in that status, measured by the SERVER. `status` alone
  // cannot tell a generation that started two seconds ago from one that has been
  // running forty minutes, and that gap is what NEX-2524 was filed about.
  { key: "progress", label: "Progress" },
  { key: "messages", label: "Messages" },
  { key: "promptResult", label: "Prompt Result" }
] as const satisfies readonly { key: keyof PromptAssistantThreadResponse; label: string }[];

/**
 * The verdict a wait ends on, as an exit code.
 *
 * ⚠️ A TIMEOUT AND A FAILURE BOTH EXIT NON-ZERO, and that is the point of the
 * flag. NEX-2923 was filed because a caller read "the command returned" as "the
 * prompt is ready" while the thread was still generating. Exiting 0 with a
 * `generating` status reproduces exactly that, one layer down.
 *
 * `resumeCommand` is the WHOLE command that continues this wait, flags included,
 * and it is passed in rather than rebuilt here because only the call site knows
 * what the caller typed. Two ways a hint goes wrong, and both have shipped:
 * naming the other verb (sending an `await-thread` user to `get-thread --wait`
 * hands them back the client-side poll they chose the server-held one to
 * avoid), and dropping `--after-message-count` — following THAT hint answers
 * instantly with the previous turn's verdict, which is the stale-prompt trap
 * the flag exists to close.
 */
function waitExitCode(
  result: WaitForThreadResult,
  threadId: string,
  resumeCommand = `nexus prompt-assistant get-thread ${threadId} --wait`
): number {
  if (result.outcome === "timed-out") {
    const resume = resumeCommand;
    return reportFailure(
      "timed-out",
      `Still ${result.thread.status} after ${Math.round(result.waitedMs / 1000)}s — the CLI stopped waiting, the server did not stop working.`,
      `Resume with "${resume}". Do NOT resend the message: a resend is a second user turn.`
    );
  }
  // `outcome`, not `status`: a thread carries the PREVIOUS turn's terminal
  // status until this turn produces its own, and reporting that as this
  // invocation's failure fails a retry that actually worked.
  if (
    result.outcome === "terminal" &&
    (result.thread.status === "failed" || result.thread.status === "cancelled")
  ) {
    return reportFailure(
      "remote-error",
      `Thread ${result.thread.status} — no prompt was produced.`,
      'Read the last assistant message for the reason, then start a new thread with "nexus prompt-assistant chat".'
    );
  }
  return 0;
}

export function registerPromptAssistantCommands(program: Command): void {
  const pa = program.command("prompt-assistant").description("AI-powered prompt writing assistant");

  // ── chat ────────────────────────────────────────────────────────────────
  const chat = pa
    .command("chat")
    .description("Send a message to the prompt assistant")
    .option("--message <text-or->", "Message text (or '-' for stdin)")
    .addOption(
      enumOption(
        "--mode <mode>",
        "Which assistant answers this turn",
        PROMPT_ASSISTANT_CHAT__BODY_MODE
      )
    )
    .option("--thread-id <id>", "Thread ID for multi-turn conversations")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .option("--wait", "Block until the prompt is written, then print it")
    .option(
      "--wait-timeout <seconds>",
      `How long --wait blocks (default ${DEFAULT_WAIT_SECONDS})`,
      parseWaitSeconds
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt-assistant chat --message "Create a customer support agent" --mode agent
  $ nexus prompt-assistant chat --message "Improve the prompt" --mode agent --thread-id 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01
  $ nexus prompt-assistant chat --message "Create a customer support agent" --mode agent --wait
  $ nexus prompt-assistant chat --message "Create a customer support agent" --mode agent --wait --wait-timeout 3600
  $ echo "Write a summarization task" | nexus prompt-assistant chat --message - --mode ai-task
  $ nexus prompt-assistant chat --body '{"message":"Help me","mode":"agent"}'

Notes:
  --wait IS HOW YOU GET THE PROMPT. Without it this command stops the moment the
  thread turns "generating" — the state that means the reply is in and the PROMPT
  IS NOT WRITTEN YET — and the prompt then has to be fetched with get-thread.
  With it, the command blocks through generation and prints promptResult.
  It exits NON-ZERO if the wait times out or the thread ends failed/cancelled,
  so "the command returned 0" means the prompt is there.

  --wait STILL ENDS ON A FOLLOW-UP QUESTION. The assistant usually asks
  something before it has enough to generate; that reply ends the wait with
  status still in_progress. Answer it with another chat on the same --thread-id.

  --mode IS REQUIRED ON EVERY CALL, follow-ups included: omitting it is a 400.
  It picks the assistant for THIS turn and is NOT checked against the thread, so
  a follow-up sent under the other mode runs the other assistant over the same
  history and nothing objects. Pass the mode the thread was opened with.

  --thread-id IS A UUID, AND AN UNRECOGNISED ONE OPENS A NEW THREAD. A valid
  uuid that names no thread is not an error — the reply comes back with none of
  the context you meant to continue, under a threadId you did not send. Check
  the threadId in the response.

  THIS COMMAND AUTO-POLLS AND CAN TAKE MINUTES. The API returns immediately with
  an empty response; the CLI then polls the thread for you and prints the reply.
  NEVER RESEND ON AN APPARENT HANG — a resend is a second user turn on the same
  thread and the assistant answers it as one.

  THREE DIFFERENT WAITS CAN END THIS COMMAND, and each has its own dial.
  The POLL gives up after ${POLL_TIMEOUT_MS / 60_000} minutes without --wait, and
  after --wait-timeout (default ${DEFAULT_WAIT_SECONDS}s) with it. The HTTP request
  is given ${PROMPT_ASSISTANT_DEFAULT_TIMEOUT_SECONDS}s, which the global
  --timeout <seconds> overrides — it bounds ONE request, not the poll.

  ANY OF THEM ENDING LEAVES THE WORK RUNNING SERVER-SIDE. Do NOT open a second
  thread: recover the id with "prompt-assistant list-threads" and resume with
  "prompt-assistant get-thread <id> --wait".

  STATUS is in_progress, generating, completed, failed or cancelled; the last
  three are final. generating means the reply is in but the PROMPT is still being
  written — without --wait the prompt arrives on get-thread as promptResult, not
  here.`
    )
    .action(async (opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient({
          ...globals,
          timeout: globals.timeout ?? PROMPT_ASSISTANT_DEFAULT_TIMEOUT_SECONDS
        });
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.mode) flags.mode = opts.mode;
        if (opts.threadId) flags.threadId = opts.threadId;
        if (opts.message) flags.message = await resolveInputValue(opts.message);
        const body = mergeBodyWithFlags(base, flags);

        // Snapshot message count before sending so we can detect new messages
        let initialMessageCount = 0;
        if (opts.threadId) {
          try {
            const existing = await client.promptAssistant.getThread(opts.threadId);
            initialMessageCount = existing.messages?.length ?? 0;
          } catch {
            /* thread may not exist yet */
          }
        }

        const result = await client.promptAssistant.chat(
          asRequestBody<PromptAssistantChatBody>(body)
        );

        // The backend processes chat messages asynchronously — it returns
        // immediately with an empty response. Wait until the thread reaches the
        // state this invocation asked for, then print THAT, never the empty
        // acknowledgement the POST came back with.
        if (!result.response && result.threadId) {
          const waited = await client.promptAssistant.waitForThread(
            result.threadId,
            waitOptions(opts, initialMessageCount)
          );
          printRecord(waitDocument(waited));
          if (!isJsonMode() && !opts.wait && waited.thread.status === "generating") {
            // The one outcome that looks like success and is not: the reply is
            // in, the prompt is not, and nothing else here says so.
            console.error(
              color.dim(
                `Prompt still generating. Get it with: nexus prompt-assistant get-thread ${result.threadId} --wait`
              )
            );
          }
          const code = waitExitCode(waited, result.threadId);
          if (code !== 0) process.exitCode = code;
        } else {
          printRecord(result);
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── list-threads ────────────────────────────────────────────────────────
  addPaginationOptions(
    pa
      .command("list-threads")
      .description("List prompt assistant threads (newest first) — recover a lost thread ID")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus prompt-assistant list-threads
  $ nexus prompt-assistant list-threads --limit 5 --json

Notes:
  Use this to recover a thread whose ID was lost (e.g. a chat call killed
  before its response was read). Results are paginated; check meta.paging.

  SUMMARY IS NOT ASSISTANT-WRITTEN, AND IT CHANGES MEANING WITH status. The
  server sends the generated promptResult.name once there is one, and until then
  it echoes YOUR OWN first message — whitespace collapsed, cut at 140 characters
  with a trailing "…", or "(no messages)" on an empty thread. So a row that
  reads like a title means a promptResult is stored, and a row that reads like a
  request means none is. Read STATUS for whether it is ready — a thread can hold
  an earlier turn's promptResult while the current turn is still running.
  Never match on summary to find a thread: two threads
  opened with the same sentence carry the same summary. Match on threadId.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.promptAssistant.listThreads(getPaginationParams(opts));

      printList(data, meta, [
        { key: "threadId", label: "THREAD ID", width: 36 },
        { key: "mode", label: "MODE", width: 8 },
        { key: "status", label: "STATUS", width: 12 },
        { key: "summary", label: "SUMMARY", width: 50 },
        { key: "createdAt", label: "CREATED", width: 24 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get-thread ──────────────────────────────────────────────────────────
  pa.command("get-thread")
    .description("Get a prompt assistant thread with messages")
    .argument("<thread-id>", "Thread ID")
    .option("--wait", "Block until the thread is finished, then print the prompt")
    .option(
      "--wait-timeout <seconds>",
      `How long --wait blocks (default ${DEFAULT_WAIT_SECONDS})`,
      parseWaitSeconds
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt-assistant get-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01
  $ nexus prompt-assistant get-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01 --json
  $ nexus prompt-assistant get-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01 --wait
  $ nexus prompt-assistant get-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01 --wait --wait-timeout 3600

Notes:
  --wait DOES THE POLLING FOR YOU. It blocks until status is completed, failed
  or cancelled — through "generating", which is where the minutes go — and exits
  non-zero on a timeout or a failed thread. This is the recovery path for a chat
  that was killed: recover the id with list-threads, then wait on it here.

  ⚠️ --wait ON A THREAD AWAITING YOUR ANSWER BLOCKS FOR THE FULL TIMEOUT. A
  thread whose assistant asked a question sits in_progress until you reply, and
  in_progress is not a state waiting ever leaves. Reply with
  "prompt-assistant chat --thread-id <id> --wait" instead.

  WITHOUT --wait THIS IS THE POLL. Generation is asynchronous, so re-run this
  command until status is completed, failed or cancelled — do not open a second
  thread and do not resend the message.
  promptResult IS ABSENT UNTIL status IS completed. Its absence is "not ready",
  never "no prompt was produced".

  --wait MOVES THE PATHS DOWN ONE LEVEL. Without it the document is the thread
  itself; with it the document is {thread, outcome, waitedMs} and the thread's
  own fields are under .thread. outcome is terminal, assistant-replied,
  generating or timed-out — the same verdict the exit code carries, readable
  without inspecting $?.

  THE SHAPE, read from the top level without --wait and from .thread with it:
    thread          {threadId, status, messages, promptResult}
    messages[]      {role, content, timestamp}   role is "user" or "assistant"
    promptResult    {prompt, name, description, …}
  name and description are what a caller fills "agent create --first-name /
  --description" or "task create --name / --description" with; prompt is the
  prompt itself. THE REST OF promptResult DEPENDS ON THE MODE THE THREAD WAS
  OPENED WITH, and reading for the wrong one gets undefined rather than an error.

  🚨 --mode agent AND --mode ai-task PRODUCE DIFFERENT prompt FORMATS. Both are
  used verbatim and neither is ever JSON.parse'd, but they are not interchangeable:
    agent     NEXUS SECTION MARKUP, NOT PROSE MARKDOWN. It opens
              ::: section: name="…", deploymentSpecific=false, readonly=false,
              hidden=false, defaultConfig=false :::
              then ::: tab: NEXUS :::, and it may carry {{firstName}}-style
              placeholders. Those directives ARE the agent prompt format — send
              the string unchanged to "nexus agent create/update --prompt";
              stripping them flattens every section and tab into one blob.
              This mode also returns agentFields and promptJson.
    ai-task   PLAIN PROSE, with no directives at all — the model's text as
              written. This mode instead returns input and output, each
              {type: "json"|"text", schema?}, which is what "task create"
              --expected-input / --expected-output and the JSON schemas want.

  The thread id is a UUID; lost ones are recovered with
  "prompt-assistant list-threads".`
    )
    .action(async (threadId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.wait) {
          const t = await client.promptAssistant.getThread(threadId);
          // The thread IS the response here, so this envelope narrows nothing
          // and the document is byte-for-byte what `printRecord` emitted. It is
          // `printEnvelope` so that BOTH branches answer one derivable shape —
          // otherwise the `--wait` branch below would leave this command with
          // two, and the generated `--help` line would describe one of them.
          printEnvelope(t, () => {
            printRecord(t, GET_THREAD_FIELDS);
          });
          return;
        }

        // No `afterMessageCount`: no turn was sent here, so a terminal status is
        // the whole answer and there is no reply to settle on.
        const waited = await client.promptAssistant.waitForThread(threadId, waitOptions(opts));
        // `outcome` is what the wait actually DID — settled, still generating,
        // or out of time — and until NEX-4139 it survived only as the process
        // exit code, which a pipeline reads long after it has parsed stdout.
        printEnvelope(waited, () => {
          printRecord(waited.thread, GET_THREAD_FIELDS);
        });
        const code = waitExitCode(waited, threadId);
        if (code !== 0) process.exitCode = code;
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── await-thread ────────────────────────────────────────────────────────
  pa.command("await-thread")
    .description("Hold ONE request open on the server until the thread finishes")
    .argument("<thread-id>", "Thread ID")
    // NOT `--timeout`: that is a GLOBAL option, and the root parses its options
    // across the whole of argv, so a subcommand flag sharing the name never
    // receives a value — it silently retunes the CLI's own transport instead.
    .option(
      "--wait-timeout <seconds>",
      `How long the SERVER holds the request, 1..${MAX_AWAIT_SECONDS} (default ${MAX_AWAIT_SECONDS})`,
      parseAwaitSeconds
    )
    .option(
      "--after-message-count <n>",
      "Message count observed BEFORE the turn you are waiting on was sent",
      parseAfterMessageCount
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt-assistant await-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01
  $ nexus prompt-assistant await-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01 --wait-timeout 30
  $ nexus prompt-assistant await-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01 --after-message-count 4

Notes:
  THIS IS get-thread --wait WITH THE LOOP ON THE SERVER. One request is held
  until the thread is completed, failed or cancelled instead of re-downloading
  the whole transcript every few seconds. Prefer it in a hook or a script that
  only needs to know when the prompt is ready.

  ⚠️ IT RETURNS BEFORE A LONG GENERATION FINISHES, AND THAT IS NORMAL. The proxy
  in front of the API cuts a request at 60s, so the hold is capped at
  ${MAX_AWAIT_SECONDS}s and a longer generation exits non-zero with a timed-out
  status. Run the command again with the same id — the work never stopped, and
  a resend of the message would be a second user turn.

  --after-message-count MATTERS AFTER A REPLY. A thread left completed by an
  earlier turn still reads completed the moment you send the next message, so
  without this flag the wait returns the PREVIOUS turn's prompt instantly. Pass
  the message count you read before sending.

  READ .outcome, NOT ONLY THE EXIT CODE. The document is {thread, outcome,
  waitedMs}, so the thread's own fields are under .thread. outcome is terminal,
  assistant-replied or timed-out; timed-out is the resume signal above and not
  a failure.`
    )
    .action(async (threadId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptAssistant.awaitThread(threadId, {
          timeoutSeconds: opts.waitTimeout,
          afterMessageCount: opts.afterMessageCount
        });

        // The server's own wait response: {thread, outcome, waitedMs}. `outcome`
        // is the answer to "did it finish", and a `--json` caller could not read
        // it before NEX-4139 — it existed only as this process's exit code.
        printEnvelope(result, () => {
          printRecord(result.thread, GET_THREAD_FIELDS);
        });
        // The hint carries the FLAGS BACK, not just the id. Resuming without
        // `--after-message-count` reopens the stale-verdict trap the flag
        // closes, and resuming without `--wait-timeout` silently changes the
        // hold the caller asked for.
        const code = waitExitCode(
          result,
          threadId,
          [
            `nexus prompt-assistant await-thread ${threadId}`,
            opts.waitTimeout === undefined ? "" : ` --wait-timeout ${opts.waitTimeout}`,
            opts.afterMessageCount === undefined
              ? ""
              : ` --after-message-count ${opts.afterMessageCount}`
          ].join("")
        );
        if (code !== 0) process.exitCode = code;
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete-thread ───────────────────────────────────────────────────────
  confirmable(pa.command("delete-thread"))
    .description("Delete a prompt assistant thread")
    .argument("<thread-id>", "Thread ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt-assistant delete-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01
  $ nexus prompt-assistant delete-thread 3f2a9c7e-1b4d-4a8e-9c0f-5d6e7a8b9c01 --yes

Notes:
  THE GENERATED PROMPT GOES WITH THE THREAD. promptResult lives on the thread
  and nowhere else, so copy it out before deleting — deleting is the only way to
  lose a prompt you have not applied to an agent or task.
  WITHOUT A TERMINAL THIS REFUSES. A script must pass --yes; it will not delete
  a thread on the assumption that nobody objected.

  ONE THREAD PER CALL — THERE IS NO BULK DELETE AND NO DELETE-BY-STATUS. The
  argument is a single UUID and there is no --status, no --before and no
  --all, here or anywhere in this namespace. Threads accumulate, including ones
  abandoned at "generating", and clearing them is one call per id harvested from
  "prompt-assistant list-threads":
    $ nexus prompt-assistant list-threads --limit 100 --json \\
        | jq -r '.data[] | select(.status=="generating") | .threadId' \\
        | xargs -n1 -I{} nexus prompt-assistant delete-thread {} --yes
  READ THE ROWS BEFORE PIPING THEM. "generating" is a LIVE state, not a stale
  one — the loop above deletes a prompt that is still being written, along with
  every thread whose promptResult you have not copied out.`
    )
    .action(async (threadId: string, opts) => {
      try {
        if (!(await confirmDestructive(`Delete thread ${threadId}?`, opts))) return;

        const client = createClient(program.optsWithGlobals());
        await client.promptAssistant.deleteThread(threadId);
        printSuccess("Thread deleted.", { threadId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(chat, PROMPT_ASSISTANT_CHAT_CONTRACT);
}
