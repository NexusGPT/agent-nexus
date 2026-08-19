import { Command, Option } from "commander";

import { resolveProfile } from "../config";
import { handleError, refuse, reportFailure } from "../errors";
import { color, emitDocument, isJsonMode, printSuccess, printTable } from "../output";
import {
  applyServerEntry,
  buildConfigBlock,
  buildServerEntry,
  defaultHome,
  MCP_CLIENTS,
  type McpClient,
  resolveClientTarget
} from "../util/mcp-client-config";
import {
  createBridgeForwarder,
  createMcpTransport,
  type JsonRpcMessage,
  type JsonRpcResponse,
  MCP_DEFAULT_TIMEOUT_SECONDS,
  type McpToolDescriptor,
  type McpTransport,
  readCallPayload,
  readCallResult,
  readToolList,
  toolsCallMessage,
  toolsListMessage
} from "../util/mcp-rpc";
import { runStdioBridge } from "../util/mcp-stdio";

/**
 * `nexus mcp` — THE OUTBOUND MCP SURFACE, FROM THE CLI THAT ALREADY HOLDS THE KEY.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WAS WRONG (NEX-3022)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `POST /api/public/v1/mcp` has worked for a long time and was invisible from
 * here: no `mcp` command, nothing in `nexus docs`, and the only typed way in was
 * `nexus api POST /mcp` with a hand-written JSON-RPC envelope. Anyone who found
 * the surface at all found it as a separate npm package, `@agent-nexus/mcp-server`,
 * whose `nexus-mcp login` asks for a key the CLI is already holding.
 *
 * The cost is not only ergonomic. That bridge resolves a credential its own way
 * — `NEXUS_API_KEY`, else the ACTIVE profile — which is a strict SUBSET of this
 * CLI's resolution, and the missing part changes which tenant a call lands in:
 * it sends no `organization-id` header, so a cross-org personal token drives MCP
 * against whatever organization the server defaults to while every other command
 * in the same shell acts on the one `nexus auth use-org` selected. See
 * `util/mcp-rpc.ts`, which is the one place this namespace resolves any of it.
 *
 * ── WHAT EACH VERB IS FOR ────────────────────────────────────────────────────
 *
 *   tools list / tools get   read the catalog the CALLING KEY can see
 *   call                     invoke one tool, once, and print what it returned
 *   serve                    be the stdio bridge, on the active CLI profile
 *   install                  emit or apply the host config block for `serve`
 *
 * `serve` is what removes the second credential store: an MCP host configured by
 * `install` launches this binary, so the key it uses is the profile's, resolved
 * by the same chain `--profile`, `NEXUS_PROFILE` and `.nexusrc` already drive.
 */

/** JSON-RPC ids are per-connection; a one-shot command needs exactly one. */
const ONE_SHOT_ID = 1;

/**
 * Turn a JSON-RPC error object into the CLI's own failure document.
 *
 * A JSON-RPC error is the request COMPLETING with a refusal, so it is
 * `remote-error` — the same cause a 4xx gets — rather than a transport failure.
 * The numeric code is carried in the message because it is the only handle the
 * server-side dispatcher gives a reader.
 */
function reportRpcError(error: NonNullable<JsonRpcResponse["error"]>, hint?: string): number {
  return reportFailure("remote-error", `${error.message} (JSON-RPC ${error.code})`, hint);
}

/**
 * Send one message and return its result, or `undefined` once a failure has
 * been reported. The caller checks for `undefined` and returns.
 *
 * 🚨 `undefined` MEANS "A FAILURE WAS REPORTED", NEVER "the result was absent",
 * and keeping those apart is the whole reason the third branch exists. A reply
 * carrying neither `result` nor `error` is malformed — JSON-RPC 2.0 requires
 * exactly one — and letting it fall through as a value would exit 0 having
 * printed nothing at all, which is the single outcome a caller cannot tell from
 * a working command.
 */
async function requestResult(
  transport: McpTransport,
  message: JsonRpcMessage,
  hint?: string
): Promise<unknown | undefined> {
  const response = await transport.send(message);
  if (response === null) {
    process.exitCode = reportFailure(
      "remote-error",
      "The MCP endpoint answered with an empty body where a JSON-RPC reply was required.",
      `Endpoint: ${transport.target.url}`
    );
    return undefined;
  }
  if (response.error) {
    process.exitCode = reportRpcError(response.error, hint);
    return undefined;
  }
  if (response.result === undefined) {
    process.exitCode = reportFailure(
      "remote-error",
      "The MCP endpoint answered with neither a result nor an error.",
      `Endpoint: ${transport.target.url}`
    );
    return undefined;
  }
  return response.result;
}

/** Fetch the whole catalog the calling key can see. */
async function listTools(transport: McpTransport): Promise<McpToolDescriptor[] | undefined> {
  const result = await requestResult(
    transport,
    toolsListMessage(ONE_SHOT_ID),
    "The endpoint needs a valid API key; the catalog it returns is narrowed to that key's scopes."
  );
  if (result === undefined) return undefined;

  const tools = readToolList(result);
  if (tools === undefined) {
    process.exitCode = reportFailure(
      "remote-error",
      "The tools/list reply carried no tools array.",
      `Endpoint: ${transport.target.url}. Run "nexus api POST /mcp --body '{\\"jsonrpc\\":\\"2.0\\",\\"id\\":1,\\"method\\":\\"tools/list\\"}'" to see the raw response.`
    );
    return undefined;
  }
  return tools;
}

/** The `--input` payload, parsed. Throws a refusal message the action reports. */
function parseInput(raw: string | undefined): Record<string, unknown> | string {
  if (raw === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return `--input is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "--input must be a JSON OBJECT of tool arguments, not an array or a scalar.";
  }
  return parsed as Record<string, unknown>;
}

export function registerMcpCommands(program: Command): void {
  const mcp = program
    .command("mcp")
    .description("Inspect, call, and serve the Nexus MCP tool surface")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus mcp tools list
  $ nexus mcp tools list --filter agent
  $ nexus mcp tools get agent_list
  $ nexus mcp call agent_list --input '{"query":{"limit":5}}'
  $ nexus mcp install --client claude-code
  $ nexus mcp serve

Notes:
  ONE ENDPOINT SITS BEHIND ALL OF THIS: POST {base-url}/api/public/v1/mcp,
  speaking JSON-RPC 2.0. Every verb here is a typed way to send it a message, so
  --profile, --api-key, --base-url and --timeout mean exactly what they mean
  everywhere else in this CLI.
  THE TOOL CATALOG IS GENERATED SERVER-SIDE AND FILTERED BY YOUR KEY'S SCOPES.
  It is the intersection of the live Public API v1 routes and the ones opted in
  to MCP, narrowed to what the calling key may do — so a tool MISSING from
  "tools list" usually means a missing scope, not a missing feature. Run
  "nexus permissions access" to see what the key actually holds.
  THERE IS NO SECOND LOGIN AND NO SECOND CREDENTIAL FILE. "mcp serve" runs on
  the profile this CLI already resolved, so an MCP host configured by
  "mcp install" reaches exactly the organization "nexus auth status" names.`
    );

  // ── tools ──────────────────────────────────────────────────────────────────

  const tools = mcp
    .command("tools")
    .description("Read the MCP tool catalog your API key can see")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus mcp tools list
  $ nexus mcp tools get agent_list

Notes:
  BOTH VERBS SEND THE SAME tools/list REQUEST. "get" filters the catalog in this
  process, so it costs one round trip and can never disagree with "list".`
    );

  tools
    .command("list")
    .description("List the MCP tools the current API key exposes")
    .option("--filter <text>", "Only tools whose name or description contains this text")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus mcp tools list
  $ nexus mcp tools list --filter workflow
  $ nexus mcp tools list --json
  $ nexus mcp tools list --profile prod

Notes:
  THE LIST IS ALREADY SCOPE-FILTERED BY THE SERVER, so its length is a statement
  about YOUR KEY and not about the platform. A different key on the same
  organization legitimately sees a different catalog, and a tool that is absent
  is a scope you do not hold far more often than a route that does not exist.
  --filter IS APPLIED IN THIS PROCESS, after the full catalog arrives. It is a
  plain case-insensitive substring test over the name and the description — not a
  glob, not a regex — and it narrows what is PRINTED, never what the key can do.
  THE DESCRIPTION COLUMN IS TRUNCATED TO ITS WIDTH, like every table in this CLI.
  Read --json, or "nexus mcp tools get <tool>", before concluding a description
  says something it does not.
  READ-ONLY AND DESTRUCTIVE ARE HINTS DERIVED FROM THE HTTP VERB behind the tool,
  not a permission check. "destructive: yes" means a caller should confirm before
  invoking it; it does not mean the endpoint will refuse you, and "no" is not a
  promise that nothing changes.
  AN EMPTY LIST IS NOT AN ERROR and exits 0. It means the key holds no scope that
  reaches an MCP-exposed route.`
    )
    .action(async (opts: { filter?: string }) => {
      try {
        const transport = createMcpTransport(program.optsWithGlobals());
        const all = await listTools(transport);
        if (all === undefined) return;

        const needle = opts.filter?.toLowerCase();
        const rows = (
          needle
            ? all.filter(
                (tool) =>
                  tool.name.toLowerCase().includes(needle) ||
                  (tool.description ?? "").toLowerCase().includes(needle)
              )
            : all
        ).map((tool) => ({
          name: tool.name,
          readOnly: tool.annotations?.readOnlyHint === true,
          destructive: tool.annotations?.destructiveHint === true,
          description: tool.description ?? ""
        }));

        printTable(rows, [
          { key: "name", label: "TOOL", width: 34 },
          { key: "readOnly", label: "READ-ONLY", width: 9 },
          { key: "destructive", label: "DESTRUCTIVE", width: 11 },
          { key: "description", label: "DESCRIPTION", width: 60 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  tools
    .command("get")
    .description("Show one MCP tool's full description and input schema")
    .argument("<tool>", "Tool name as it appears in `nexus mcp tools list`")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus mcp tools get agent_list
  $ nexus mcp tools get agent_create --json

Notes:
  THIS IS THE COMMAND TO RUN BEFORE "mcp call". The inputSchema it prints is the
  JSON Schema the server generated from the route's own contract, so the object
  you pass to --input is exactly the object described here — path parameters at
  the top level, plus "query" and "body" objects where the route has them.
  THE NAME MUST MATCH EXACTLY. It is the contract's authored tool name, not the
  CLI command and not the URL path, and an unknown name exits NON-ZERO rather
  than printing an empty record. See "nexus --help" for the exit-code table.
  A TOOL THIS KEY CANNOT SEE IS INDISTINGUISHABLE FROM ONE THAT DOES NOT EXIST,
  because the catalog is scope-filtered before it reaches this process. Check
  "nexus permissions access" before concluding the tool was removed.`
    )
    .action(async (name: string) => {
      try {
        const transport = createMcpTransport(program.optsWithGlobals());
        const all = await listTools(transport);
        if (all === undefined) return;

        const tool = all.find((candidate) => candidate.name === name);
        if (!tool) {
          process.exitCode = reportFailure(
            "not-found",
            `No MCP tool named "${name}" is visible to this API key.`,
            `Run "nexus mcp tools list --filter ${name.split("_")[0]}" to see the names this key exposes.`
          );
          return;
        }

        if (isJsonMode()) {
          emitDocument(tool);
          return;
        }

        console.log(color.bold(tool.name));
        console.log(tool.description ?? "");
        console.log();
        console.log(
          color.dim(
            `read-only: ${tool.annotations?.readOnlyHint === true} · destructive: ${tool.annotations?.destructiveHint === true}`
          )
        );
        console.log();
        console.log(color.bold("Input schema"));
        // `?? {}` because `JSON.stringify(undefined)` returns the VALUE
        // undefined, and `console.log` then prints the word "undefined" as if it
        // were the schema. A tool with no declared input has an empty object.
        console.log(JSON.stringify(tool.inputSchema ?? {}, null, 2));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── call ───────────────────────────────────────────────────────────────────

  mcp
    .command("call")
    .description("Invoke one MCP tool and print what it returned")
    .argument("<tool>", "Tool name as it appears in `nexus mcp tools list`")
    .option("--input <json>", "Tool arguments as a JSON object (default: {})")
    .option("--raw", "Print the untouched JSON-RPC result instead of the tool's payload")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus mcp call identity_whoami
  $ nexus mcp call agent_list --input '{"query":{"limit":5}}'
  $ nexus mcp call agent_get --input '{"agentId":"11111111-1111-4111-8111-111111111111"}'
  $ nexus mcp call agent_list --raw

Notes:
  THIS DISPATCHES A REAL PUBLIC API CALL. The endpoint runs the tool against the
  same routes, the same scopes and the same organization every other nexus
  command uses, so a destructive tool here destroys exactly what it says.
  🚨 THERE IS NO --yes AND NO --dry-run. The tool name is not inspected locally
  and nothing is confirmed — the request is sent the moment you press enter.
  Run "nexus mcp tools get <tool>" first; its destructive hint is the only warning
  you get.
  --input IS A JSON OBJECT AND NOTHING ELSE. An array, a scalar or invalid JSON
  is refused before any request leaves this process. Omitting it sends {}, which
  is correct for a tool that takes no arguments and a 4xx for one that does.
  THE SHAPE OF --input IS THE TOOL'S inputSchema, NOT THIS CLI'S FLAGS. Path
  parameters sit at the top level; a route's query string goes under "query" and
  its request body under "body". "nexus mcp tools get <tool>" prints it.
  BY DEFAULT YOU GET THE TOOL'S PAYLOAD, RE-PARSED. The endpoint returns it as
  JSON inside a text block; this command unwraps that one block so the output is
  the document itself. --raw prints the JSON-RPC result verbatim — content array,
  isError flag and all — which is what you want when the payload is not JSON.
  A TOOL THAT FAILS EXITS NON-ZERO AND ITS ANSWER IS THE ERROR MESSAGE. The
  exit code names the category, and "nexus --help" carries that table. The
  endpoint
  reports a 4xx from the underlying route as isError on a successful JSON-RPC
  reply, so "the call worked and the API refused it" is a FAILURE here, never a
  0 exit with an error body on stdout.`
    )
    .action(async (name: string, opts: { input?: string; raw?: boolean }) => {
      try {
        const args = parseInput(opts.input);
        if (typeof args === "string") {
          process.exitCode = refuse(
            args,
            `Run "nexus mcp tools get ${name}" for its input schema.`
          );
          return;
        }

        const transport = createMcpTransport(program.optsWithGlobals());
        const result = await requestResult(
          transport,
          toolsCallMessage(ONE_SHOT_ID, name, args),
          `Run "nexus mcp tools list" to see the names this key exposes.`
        );
        if (result === undefined) return;

        const call = readCallResult(result);
        if (call.isError === true) {
          const payload = readCallPayload(call);
          process.exitCode = reportFailure(
            "remote-error",
            `Tool "${name}" returned an error: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`,
            `Run "nexus mcp tools get ${name}" to check the input schema and the scope it needs.`
          );
          return;
        }

        const output = opts.raw ? result : readCallPayload(call);
        // Printed like `nexus api`: one JSON document, pretty by default and
        // compact under --json, because the payload has no fixed table shape.
        console.log(JSON.stringify(output, null, isJsonMode() ? undefined : 2));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── serve ──────────────────────────────────────────────────────────────────

  mcp
    .command("serve")
    .description("Run the stdio MCP bridge on the active CLI profile")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus mcp serve
  $ nexus mcp serve --profile prod
  $ nexus mcp serve --timeout 120

Notes:
  THIS IS NOT AN INTERACTIVE COMMAND. It reads newline-delimited JSON-RPC on
  STDIN and writes replies on STDOUT until stdin closes, which is what an MCP
  host does to it. Run from a terminal it will simply sit there — use
  "nexus mcp tools list" to check the surface by hand, and "nexus mcp install" to
  wire it into a host.
  STDOUT IS THE PROTOCOL. Nothing else is ever written there; the profile banner,
  warnings and errors all go to stderr, so a host's transport stays parseable.
  ONE STDERR LINE ON STARTUP NAMES THE ENDPOINT, THE PROFILE AND THE ORGANIZATION
  this bridge is bound to. Read it in the host's MCP log when a tool answers from
  a tenant you did not expect — it is the only place that pairing is stated.
  IT CARRIES NO CREDENTIALS OF ITS OWN. The profile is resolved once, at start,
  through the same chain as every other command — so pin it with --profile in the
  host config rather than relying on the ACTIVE profile, which "nexus auth switch"
  in any other terminal repoints for every process on the machine. A running
  bridge does NOT pick that change up; restart the host if you meant it to.
  THE TOOL SET IS THE SERVER'S. This process forwards messages and never invents,
  filters or renames a tool, so what a host sees is exactly what
  "nexus mcp tools list" prints for the same profile.
  THE GLOBAL --timeout APPLIES PER MESSAGE and defaults to ${MCP_DEFAULT_TIMEOUT_SECONDS}s here. A tool
  call that outlives it is reported to the host as a JSON-RPC error; the
  underlying API request may still be completing.`
    )
    .action(async () => {
      try {
        const transport = createMcpTransport(program.optsWithGlobals());
        const { url, profileName, profileSource, organizationId, keyIsCrossOrg } = transport.target;

        // ON STDERR, ALWAYS, AND IT IS THE ONE PLACE THIS PAIRING IS STATED. A
        // host shows the tool NAMES and nothing about which tenant answers them,
        // so "the agent listed somebody else's agents" has no other diagnostic.
        // Never stdout: that belongs to the protocol.
        process.stderr.write(
          `nexus mcp serve: ${url} · profile ${profileName} (${profileSource}) · ` +
            `org ${organizationId ?? (keyIsCrossOrg ? "(NONE SELECTED — the server picks the tenant)" : "(the key's own)")}\n`
        );

        await runStdioBridge({
          input: process.stdin,
          write: (line) => process.stdout.write(line + "\n"),
          warn: (message) => process.stderr.write(`nexus mcp serve: ${message}\n`),
          forward: createBridgeForwarder(transport)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── install ────────────────────────────────────────────────────────────────

  mcp
    .command("install")
    .description("Emit or apply the MCP host config block for this profile")
    .addOption(
      new Option("--client <client>", "MCP host to configure")
        .choices([...MCP_CLIENTS])
        .default("claude-code")
    )
    .option("--name <name>", "Server name inside the host's config", "nexus")
    .option("--apply", "Write the block into the host's config file instead of printing it")
    .option("--force", "With --apply, replace an entry of the same name")
    .option("--no-pin", "Follow the ACTIVE profile at launch instead of pinning the current one")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus mcp install
  $ nexus mcp install --client cursor
  $ nexus mcp install --client claude-desktop --apply
  $ nexus mcp install --client claude-code --apply --force
  $ nexus mcp install --name nexus-prod --profile prod
  $ nexus mcp install --no-pin

Notes:
  WITHOUT --apply THIS WRITES NOTHING. It prints the block and the path it
  belongs in, which is the safe default for a file you may keep under version
  control. --apply MERGES the block into that file, preserving every other server
  already configured there, and creates the file when it does not exist.
  WHERE THE BLOCK GOES DEPENDS ON THE CLIENT, and two of the three are outside
  this directory: claude-code writes .mcp.json in the CURRENT WORKING DIRECTORY
  (project scope — it is normally committed), cursor writes ~/.cursor/mcp.json
  and claude-desktop writes the desktop app's own config under your home
  directory. The command prints the resolved path before it writes.
  🚨 THE BLOCK CONTAINS NO API KEY, DELIBERATELY. It launches "nexus mcp serve",
  which resolves the profile at start, so the credential stays in the CLI's
  config and never lands in a file that gets committed. A block carrying a key is
  not something this command emits.
  THE PROFILE IS PINNED BY DEFAULT, and that is the flag that matters. The active
  profile is machine-global state that "nexus auth switch" repoints from any
  terminal, silently, so an unpinned host would change organization under a
  running editor. --no-pin drops the pin when following the active profile is
  what you actually want.
  AN EXISTING ENTRY OF THE SAME NAME IS REFUSED, not overwritten. Pass --force to
  replace it, or --name <other> to keep both. A config file that is not valid
  JSON is refused too — this command will not discard a file it cannot read.
  RESTART THE HOST AFTER --apply. None of these clients re-read their MCP config
  while running, so a block that is correct on disk changes nothing until then.`
    )
    .action(
      async (opts: {
        client: McpClient;
        name: string;
        apply?: boolean;
        force?: boolean;
        pin: boolean;
      }) => {
        try {
          const globals = program.optsWithGlobals();
          const target = resolveClientTarget(opts.client, {
            cwd: process.cwd(),
            home: defaultHome(),
            platform: process.platform
          });

          let profile: string | undefined;
          if (opts.pin) {
            const resolved = resolveProfile(globals);
            if (resolved.source === "override") {
              process.exitCode = refuse(
                "There is no profile to pin: this invocation is running on an --api-key / NEXUS_API_KEY override.",
                "Name one with --profile <name>, or pass --no-pin to emit a block that follows whatever profile is active when the host launches it."
              );
              return;
            }
            profile = resolved.name;
          }

          const entry = buildServerEntry({ profile, baseUrl: globals.baseUrl });
          const block = buildConfigBlock(opts.name, entry);

          if (!opts.apply) {
            if (isJsonMode()) {
              emitDocument({
                client: opts.client,
                configPath: target.configPath,
                scope: target.scope,
                applied: false,
                config: block
              });
              return;
            }
            console.log(color.bold(`Add this to ${target.configPath}`));
            console.log(color.dim(`  scope: ${target.scope}`));
            console.log();
            console.log(JSON.stringify(block, null, 2));
            console.log();
            console.log(
              color.dim("Run the same command with --apply to write it there, then restart ") +
                color.cyan(opts.client) +
                color.dim(".")
            );
            return;
          }

          let outcome;
          try {
            outcome = applyServerEntry(target.configPath, opts.name, entry, {
              force: opts.force === true
            });
          } catch (error) {
            // `local-failed` is the cause this is, and the generic handler would
            // label it `CLI_UNKNOWN_ERROR` — a code that tells a script nothing
            // about whether the request even happened. Nothing left this process:
            // a name collision, an unreadable file, or a directory this user
            // cannot write are all failures of a write on THIS machine.
            process.exitCode = reportFailure(
              "local-failed",
              error instanceof Error ? error.message : String(error),
              `Config file: ${target.configPath}`
            );
            return;
          }

          printSuccess(`MCP server "${opts.name}" ${outcome} in ${target.configPath}.`, {
            client: opts.client,
            configPath: target.configPath,
            server: opts.name,
            command: `${entry.command} ${entry.args.join(" ")}`,
            outcome
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
}
