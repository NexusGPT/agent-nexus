import fs from "node:fs";
import readline from "node:readline";

import { type Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError, refuse, reportFailure } from "../errors";
import { color, printEnvelope, printTable } from "../output";
import { confirmable, confirmDestructive } from "../util/confirm";
import {
  GOLDEN_CONVERSATION_ACCEPT_CONTRACT,
  GOLDEN_CONVERSATION_ADD_USER_TURN_CONTRACT,
  GOLDEN_CONVERSATION_CREATE_CONTRACT,
  GOLDEN_CONVERSATION_DELETE_CONTRACT,
  GOLDEN_CONVERSATION_GENERATE_CONTRACT,
  GOLDEN_CONVERSATION_GET_CONTRACT,
  GOLDEN_CONVERSATION_LIST_CONTRACT,
  GOLDEN_CONVERSATION_READY_CONTRACT,
  GOLDEN_CONVERSATION_SET_CHECKPOINT_CONTRACT,
  GOLDEN_CONVERSATION_SET_TURN_CONTENT_CONTRACT
} from "./eval.contract.generated";
import { registerEvalRunCommands } from "./eval-run";

/**
 * `nexus eval` — golden conversations (Prompt Lab phase 2).
 *
 * ## The authoring loop, in one paragraph
 *
 * You play the end user; the agent answers. `conv create` binds a conversation
 * to one agent+deployment (optionally on a **variant** — its tip prompt is
 * what generation runs under). Then `add-user` → `generate` → `accept` until
 * the dialogue is the reference you want; every accepted agent turn is a
 * **checkpoint** (a per-message test case) unless you toggle it off. `ready`
 * closes authoring: only READY conversations enter eval runs (phase 3).
 *
 * ## 🔴 `generate` RUNS THE REAL AGENT, TOOLS INCLUDED
 *
 * Each generate opens a FRESH ephemeral emulator session, replays the golden
 * prefix into it, and sends the last user message live. Tools execute for
 * real, spend real money, and the reply lands as the conversation's single
 * pending candidate — generate again and the old candidate is replaced.
 *
 * ## `conv new` is sugar, not a second system
 *
 * The interactive REPL drives exactly the subcommands above, one per
 * keystroke. Anything the REPL can do, a script can do without it.
 */
export function registerEvalCommands(program: Command): void {
  const evalCmd = program
    .command("eval")
    .description("Golden conversations: author reference dialogues for prompt evaluation");

  const conv = evalCmd.command("conv").description("Author and manage golden conversations");

  // `eval run` lives in its own file: the matrix renderer and the flag
  // grammar are substantial enough that keeping them here would bury the
  // authoring loop this file is about.
  registerEvalRunCommands(evalCmd, program);

  const readFileArg = (path: string): string | undefined => {
    if (!fs.existsSync(path) || !fs.statSync(path).isFile()) {
      refuse(`No such file: ${path}`);
      return undefined;
    }
    return fs.readFileSync(path, "utf-8");
  };

  // ── conv create ───────────────────────────────────────────────────────────
  const convCreate = conv
    .command("create")
    .description("Create a golden conversation (DRAFT, no turns)")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--deployment-id <id>", "Deployment ID (must belong to the agent)")
    .requiredOption("--title <title>", "Conversation title")
    .option("--description <text>", "Optional description")
    .option("--variant <ref>", 'Author on this prompt variant (name, id, or "main")')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv create --agent-id 11111111-1111-4111-8111-111111111111 \\
      --deployment-id 22222222-2222-4222-8222-222222222222 --title "refund flow"
  $ nexus eval conv create --agent-id 11111111-1111-4111-8111-111111111111 \\
      --deployment-id 22222222-2222-4222-8222-222222222222 \\
      --variant "French" --title "fr check" --json

Notes:
  THE DEPLOYMENT MUST BELONG TO THE AGENT — the pair is fixed for the
  conversation's life and eval runs inherit it (no retargeting).
  --variant RESOLVES AT CREATION: the variant's TIP version becomes the
  conversation's authoring version, and every generate runs under it. Saving
  to the variant afterwards does NOT move an existing conversation.
  Omitting --variant authors against the agent's LIVE prompt.`
    )
    .action(
      async (opts: {
        agentId: string;
        deploymentId: string;
        title: string;
        description?: string;
        variant?: string;
      }) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const result = await client.goldenConversations.create({
            agentId: opts.agentId,
            deploymentId: opts.deploymentId,
            title: opts.title,
            ...(opts.description !== undefined ? { description: opts.description } : {}),
            ...(opts.variant !== undefined ? { variant: opts.variant } : {})
          });
          printEnvelope(result, () => {
            console.log(`Created golden conversation ${color.bold(result.id)} (${result.status})`);
            if (result.authoringVersionId !== null) {
              console.log(`Authoring version: ${result.authoringVersionId}`);
            }
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // ── conv list ─────────────────────────────────────────────────────────────
  const convList = conv
    .command("list")
    .description("List golden conversations, newest first")
    .option("--agent-id <id>", "Only this agent's conversations")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv list
  $ nexus eval conv list --agent-id 11111111-1111-4111-8111-111111111111 --json

Notes:
  Under --json the payload is a BARE ARRAY of conversations.
  STATUS is DRAFT until "nexus eval conv ready" — only READY conversations
  are eligible for eval runs (phase 3).`
    )
    .action(async (opts: { agentId?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.list({
          ...(opts.agentId !== undefined ? { agentId: opts.agentId } : {})
        });
        printEnvelope(result, () => {
          printTable(
            result.map((c) => ({
              title: c.title,
              status: c.status,
              agent: c.agentId,
              id: c.id
            })),
            [
              { key: "title", label: "TITLE", width: 28 },
              { key: "status", label: "STATUS", width: 9 },
              { key: "agent", label: "AGENT", width: 36 },
              { key: "id", label: "ID", width: 36 }
            ]
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── conv get ──────────────────────────────────────────────────────────────
  const convGet = conv
    .command("get")
    .description("Show a conversation with its full turn list")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv get --conversation-id 33333333-3333-4333-8333-333333333333
  $ nexus eval conv get --conversation-id 33333333-3333-4333-8333-333333333333 --json

Notes:
  Under --json, .turns is ORDERED BY INDEX (0-based) and each turn carries
  role, content, toolCalls, edited, isCheckpoint, and criteria — the exact
  facts a test run judges against.
  A ✓ in the human view marks checkpoints; (edited) marks hand-edited turns.`
    )
    .action(async (opts: { conversationId: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.get(opts.conversationId);
        printEnvelope(result, () => {
          console.log(`${color.bold(result.title)}  [${result.status}]  ${result.id}`);
          for (const turn of result.turns) {
            const marks = [
              turn.isCheckpoint ? "✓" : " ",
              turn.edited ? "(edited)" : "",
              turn.toolCalls !== null && turn.toolCalls.length > 0
                ? `[tools: ${turn.toolCalls.map((t) => t.name).join(", ")}]`
                : ""
            ]
              .filter(Boolean)
              .join(" ");
            const speaker = turn.role === "USER" ? "you  " : "agent";
            console.log(`${String(turn.index).padStart(2)} ${speaker} › ${turn.content} ${marks}`);
          }
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── conv delete ───────────────────────────────────────────────────────────
  const convDelete = confirmable(
    conv.command("delete").description("Delete a conversation and all its turns")
  )
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv delete --conversation-id 33333333-3333-4333-8333-333333333333 --yes

Notes:
  THE DELETE IS HARD — the conversation and every turn go, and past eval
  runs keep only the snapshots they judged against. Without --yes this asks
  at a terminal and REFUSES in a script.`
    )
    .action(async (opts: { conversationId: string; yes?: boolean }) => {
      try {
        if (
          !(await confirmDestructive(
            `Delete golden conversation ${opts.conversationId} and all its turns?`,
            opts
          ))
        ) {
          return;
        }
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.delete(opts.conversationId);
        printEnvelope(result, () => {
          console.log(`Deleted ${opts.conversationId}`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── conv add-user ─────────────────────────────────────────────────────────
  const convAddUser = conv
    .command("add-user")
    .description("Append a user turn (you, playing the end user)")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--text <text>", "The user message")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv add-user --conversation-id 33333333-3333-4333-8333-333333333333 \\
      --text "I want a refund"

Notes:
  ADDING A USER TURN DISCARDS ANY PENDING CANDIDATE — the candidate answered
  the previous user message, so accepting it after this would store a reply
  to the wrong question. Generate again after adding.`
    )
    .action(async (opts: { conversationId: string; text: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.addUserTurn(opts.conversationId, {
          text: opts.text
        });
        printEnvelope(result, () => {
          console.log(`you › ${result.content}  (turn ${result.index})`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── conv generate ─────────────────────────────────────────────────────────
  const convGenerate = conv
    .command("generate")
    .description("Generate a candidate reply for the last user message (replay-then-generate)")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv generate --conversation-id 33333333-3333-4333-8333-333333333333 --json

Notes:
  EACH GENERATE IS A FRESH EPHEMERAL EMULATOR SESSION seeded with the golden
  prefix — run it twice and .sessionId differs, which is the no-state-leak
  guarantee regenerate rests on. The reply replaces any previous candidate.
  TOOLS EXECUTE LIVE and the call blocks for the full agent turn — budget
  minutes, not seconds, for tool-heavy agents.
  Under --json, .candidate carries content, toolCalls ([{name,input,output}]),
  latencyMs and tokensUsed; .sessionId names the emulator session (inspect it
  with "nexus emulator session get" while debugging).`
    )
    .action(async (opts: { conversationId: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.generate(opts.conversationId);
        printEnvelope(result, () => {
          console.log(`agent › ${result.candidate.content}`);
          if (result.candidate.toolCalls.length > 0) {
            console.log(
              color.dim(`tools: ${result.candidate.toolCalls.map((t) => t.name).join(", ")}`)
            );
          }
          console.log(color.dim("accept, edit (accept --file), or generate again to redo"));
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── conv accept ───────────────────────────────────────────────────────────
  const convAccept = conv
    .command("accept")
    .description("Accept the pending candidate as the golden agent turn")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .option(
      "--file <path>",
      "Accept-with-edit: store this file's content instead (flags the turn edited)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv accept --conversation-id 33333333-3333-4333-8333-333333333333
  $ nexus eval conv accept --conversation-id 33333333-3333-4333-8333-333333333333 --file edited.md

Notes:
  WITHOUT --file the candidate is stored verbatim (edited: false). With
  --file YOUR text becomes the golden content and the turn is flagged
  edited: true — the recorded tool calls stay the candidate's, because you
  edited the words, not what the agent did.
  CHECKPOINT DEFAULTS ON for every accepted agent turn; toggle off with
  "nexus eval conv checkpoint --off".
  With no pending candidate (never generated, or discarded by add-user)
  this refuses — run generate first.`
    )
    .action(async (opts: { conversationId: string; file?: string }) => {
      try {
        let content: string | undefined;
        if (opts.file !== undefined) {
          content = readFileArg(opts.file);
          if (content === undefined) return;
        }
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.accept(
          opts.conversationId,
          content !== undefined ? { content } : undefined
        );
        printEnvelope(result, () => {
          const suffix = result.edited ? " (edited)" : "";
          console.log(`accepted turn ${result.index}${suffix}: ${result.content}`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── conv set-golden ───────────────────────────────────────────────────────
  const convSetGolden = conv
    .command("set-golden")
    .description("Replace an existing agent turn's golden content")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--index <n>", "0-based turn index", parseInt)
    .requiredOption("--file <path>", "File whose content becomes the golden reply")
    .addHelpText(
      "after",
      `
Examples:
  $ echo "Refunds take 3-5 business days." > fix.md
  $ nexus eval conv set-golden --conversation-id 33333333-3333-4333-8333-333333333333 \\
      --index 3 --file fix.md

Notes:
  AGENT TURNS ONLY — a user turn is your own words and cannot be "golden".
  EDITING NEVER INVALIDATES PAST RUNS: a run snapshots the golden content it
  judged against, so this changes future runs only. The turn is flagged
  edited: true.`
    )
    .action(async (opts: { conversationId: string; index: number; file: string }) => {
      try {
        const content = readFileArg(opts.file);
        if (content === undefined) return;
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.setTurnContent(
          opts.conversationId,
          opts.index,
          { content }
        );
        printEnvelope(result, () => {
          console.log(`turn ${result.index} updated (edited): ${result.content}`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── conv checkpoint ───────────────────────────────────────────────────────
  const convCheckpoint = conv
    .command("checkpoint")
    .description("Toggle whether an agent turn is a test case; optionally attach criteria")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--index <n>", "0-based turn index", parseInt)
    .option("--on", "Make this turn a checkpoint")
    .option("--off", "Stop testing this turn")
    .option("--criteria <file.json>", "JSON array of {name, rubric, weight?} judged per run")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv checkpoint --conversation-id 33333333-3333-4333-8333-333333333333 \\
      --index 3 --on --criteria criteria.json
  $ nexus eval conv checkpoint --conversation-id 33333333-3333-4333-8333-333333333333 \\
      --index 5 --off

Notes:
  EXACTLY ONE OF --on / --off is required.
  --criteria REPLACES the turn's criteria wholesale (there is no append).
  Toggling --off KEEPS stored criteria, so a later --on finds them intact.
  Criteria are judged IN ADDITION to the built-in golden_match — each entry
  gets its own judge call at run time (phase 3).`
    )
    .action(
      async (opts: {
        conversationId: string;
        index: number;
        on?: boolean;
        off?: boolean;
        criteria?: string;
      }) => {
        try {
          if (opts.on === undefined && opts.off === undefined) {
            refuse("Pass --on or --off.");
            return;
          }
          if (opts.on !== undefined && opts.off !== undefined) {
            refuse("Pass --on or --off, not both.");
            return;
          }
          let criteria: { name: string; rubric: string; weight?: number }[] | undefined;
          if (opts.criteria !== undefined) {
            const raw = readFileArg(opts.criteria);
            if (raw === undefined) return;
            try {
              criteria = JSON.parse(raw) as { name: string; rubric: string; weight?: number }[];
            } catch {
              refuse(`--criteria is not valid JSON: ${opts.criteria}`);
              return;
            }
          }
          const client = createClient(program.optsWithGlobals());
          const result = await client.goldenConversations.setCheckpoint(
            opts.conversationId,
            opts.index,
            {
              isCheckpoint: opts.on !== undefined,
              ...(criteria !== undefined ? { criteria } : {})
            }
          );
          printEnvelope(result, () => {
            const state = result.isCheckpoint ? "ON" : "OFF";
            const crit = result.criteria !== null ? ` with ${result.criteria.length} criteria` : "";
            console.log(`checkpoint ${state} for turn ${result.index}${crit}`);
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // ── conv ready ────────────────────────────────────────────────────────────
  const convReady = conv
    .command("ready")
    .description("Mark the conversation READY (authoring done, eligible for runs)")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv ready --conversation-id 33333333-3333-4333-8333-333333333333

Notes:
  READY REQUIRES AT LEAST ONE CHECKPOINT — a conversation with no test case
  in it cannot participate in a run, so this refuses rather than deferring
  the surprise to run creation.
  READY IS NOT A LOCK: turns stay editable and checkpoints toggleable after.
  Marking an already-READY conversation ready again is a no-op, not an error.`
    )
    .action(async (opts: { conversationId: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.goldenConversations.ready(opts.conversationId);
        // "ready" is a check-shaped verb, so its verdict rides the EXIT CODE
        // (status-verdict gate; `external-tool test-auth` is the worked
        // example). The server refuses with 4xx on every real failure, so this
        // arm is a contract check — but a script gating on this command gates
        // on the answer, not on prose.
        if (result.status !== "READY") {
          process.exitCode = reportFailure(
            "remote-error",
            `Conversation is ${result.status}, not READY.`,
            'The server accepted the request but the conversation did not reach READY. Inspect it with "eval conv get".'
          );
          return;
        }
        printEnvelope(result, () => {
          console.log(`${result.title} is ready for eval runs`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── conv new (interactive REPL) ───────────────────────────────────────────
  conv
    .command("new")
    .description("Author a conversation interactively (a thin wrapper over the subcommands)")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--deployment-id <id>", "Deployment ID")
    .requiredOption("--title <title>", "Conversation title")
    .option("--variant <ref>", 'Author on this prompt variant (name, id, or "main")')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv new --agent-id 11111111-1111-4111-8111-111111111111 \\
      --deployment-id 22222222-2222-4222-8222-222222222222 --title "refund flow"

Notes:
  THE REPL IS SUGAR over conv create/add-user/generate/accept/checkpoint/
  ready — every keystroke maps to one subcommand, so anything it does a
  script can do without it.
  You type a user message; the agent generates; then one key decides:
  [a]ccept, [e]dit (opens $EDITOR), [r]egenerate, [c]heckpoint toggle for
  this turn, [d]one (marks READY when a checkpoint exists).
  SCRIPTED STDIN WORKS: pipe lines in the same order you would type them —
  "[user text]\\na\\nd\\n" authors one turn and finishes.`
    )
    .action(
      async (opts: { agentId: string; deploymentId: string; title: string; variant?: string }) => {
        try {
          await runAuthoringRepl(program, opts);
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // Bound last, so generated reference text lands after the hand-written Notes.
  bindCommand(convCreate, GOLDEN_CONVERSATION_CREATE_CONTRACT);
  bindCommand(convList, GOLDEN_CONVERSATION_LIST_CONTRACT);
  bindCommand(convGet, GOLDEN_CONVERSATION_GET_CONTRACT);
  bindCommand(convDelete, GOLDEN_CONVERSATION_DELETE_CONTRACT);
  bindCommand(convAddUser, GOLDEN_CONVERSATION_ADD_USER_TURN_CONTRACT);
  bindCommand(convGenerate, GOLDEN_CONVERSATION_GENERATE_CONTRACT);
  bindCommand(convAccept, GOLDEN_CONVERSATION_ACCEPT_CONTRACT, {
    "Body.content": "supplied via --file <path>; the CLI reads the file and sends its content"
  });
  bindCommand(convSetGolden, GOLDEN_CONVERSATION_SET_TURN_CONTENT_CONTRACT, {
    "Body.content": "supplied via --file <path>; the CLI reads the file and sends its content"
  });
  bindCommand(convCheckpoint, GOLDEN_CONVERSATION_SET_CHECKPOINT_CONTRACT, {
    "Body.isCheckpoint": "exposed as the --on / --off flag pair (exactly one is required)",
    "Body.criteria": "supplied via --criteria <file.json>; the CLI reads and parses the file"
  });
  bindCommand(convReady, GOLDEN_CONVERSATION_READY_CONTRACT);
}

/**
 * The interactive loop. Reads stdin line by line (TTY or pipe — T2-12 pipes),
 * and drives exactly the operations the subcommands expose.
 */
async function runAuthoringRepl(
  program: Command,
  opts: { agentId: string; deploymentId: string; title: string; variant?: string }
): Promise<void> {
  const client = createClient(program.optsWithGlobals());
  const conversation = await client.goldenConversations.create({
    agentId: opts.agentId,
    deploymentId: opts.deploymentId,
    title: opts.title,
    ...(opts.variant !== undefined ? { variant: opts.variant } : {})
  });
  console.log(
    `Authoring ${color.bold(conversation.title)} (${conversation.id})` +
      (opts.variant !== undefined ? ` on variant "${opts.variant}"` : "")
  );
  console.log(color.dim("Type a user message; [d]one finishes. Ctrl-D also finishes."));

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const lines: AsyncIterator<string> = rl[Symbol.asyncIterator]();
  const nextLine = async (prompt: string): Promise<string | null> => {
    process.stdout.write(prompt);
    const { value, done } = await lines.next();
    if (done) return null;
    return value;
  };

  try {
    let lastAcceptedIndex: number | null = null;
    // Whether the CURRENT candidate should be a checkpoint once accepted.
    let checkpointOn = true;

    userLoop: for (;;) {
      const line = await nextLine("you › ");
      if (line === null) break;
      const text = line.trim();
      if (text === "") continue;
      if (text === "d" || text === "done") break;

      await client.goldenConversations.addUserTurn(conversation.id, { text });
      process.stdout.write(color.dim("agent … generating\n"));
      let candidate = (await client.goldenConversations.generate(conversation.id)).candidate;
      checkpointOn = true;

      actionLoop: for (;;) {
        console.log(`agent › ${candidate.content}`);
        if (candidate.toolCalls.length > 0) {
          console.log(color.dim(`tools: ${candidate.toolCalls.map((t) => t.name).join(", ")}`));
        }
        const action = await nextLine(
          `[a]ccept  [e]dit  [r]egenerate  [c]heckpoint ${checkpointOn ? "on" : "off"}  [d]one › `
        );
        if (action === null) break userLoop;

        switch (action.trim()) {
          case "a": {
            const turn = await client.goldenConversations.accept(conversation.id);
            lastAcceptedIndex = turn.index;
            if (!checkpointOn) {
              await client.goldenConversations.setCheckpoint(conversation.id, turn.index, {
                isCheckpoint: false
              });
            }
            continue userLoop;
          }
          case "e": {
            const edited = await editInEditor(candidate.content);
            if (edited === null) {
              console.log(
                color.dim("editor unavailable — accept, regenerate, or edit later with set-golden")
              );
              continue actionLoop;
            }
            const turn = await client.goldenConversations.accept(conversation.id, {
              content: edited
            });
            lastAcceptedIndex = turn.index;
            if (!checkpointOn) {
              await client.goldenConversations.setCheckpoint(conversation.id, turn.index, {
                isCheckpoint: false
              });
            }
            continue userLoop;
          }
          case "r": {
            process.stdout.write(color.dim("agent … regenerating\n"));
            candidate = (await client.goldenConversations.generate(conversation.id)).candidate;
            continue actionLoop;
          }
          case "c": {
            checkpointOn = !checkpointOn;
            continue actionLoop;
          }
          case "d":
          case "done":
            break userLoop;
          default:
            console.log(
              color.dim("a = accept, e = edit, r = regenerate, c = checkpoint toggle, d = done")
            );
            continue actionLoop;
        }
      }
    }

    if (lastAcceptedIndex === null) {
      console.log("No turns accepted — conversation left in DRAFT.");
      return;
    }
    await client.goldenConversations.ready(conversation.id);
    console.log(`${conversation.title} is READY (${conversation.id})`);
  } finally {
    rl.close();
  }
}

/**
 * Open $EDITOR on the candidate text. Returns null when no interactive editor
 * can run (no TTY, or the editor exits non-zero) — the REPL falls back rather
 * than hanging a scripted stdin session.
 */
async function editInEditor(initial: string): Promise<string | null> {
  if (!process.stdin.isTTY) return null;
  const editor = process.env.EDITOR ?? process.env.VISUAL;
  if (editor === undefined || editor === "") return null;

  const os = await import("node:os");
  const path = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const file = path.join(os.tmpdir(), `nexus-golden-edit-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(file, initial);
  try {
    const run = spawnSync(editor, [file], { stdio: "inherit" });
    if (run.status !== 0) return null;
    return fs.readFileSync(file, "utf-8");
  } finally {
    fs.unlinkSync(file);
  }
}
