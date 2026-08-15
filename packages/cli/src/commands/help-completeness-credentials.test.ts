import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE HELP IS THE CONTRACT for `credential`, `access-card`, `external-tool` and
 * `prompt-assistant` (NEX-3640 / NEX-3641 / NEX-3639 / NEX-3652, under the
 * NEX-3626 completeness programme).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A TEST GUARDS PROSE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * These namespaces are consumed by pasting `--help` into an agent prompt with no
 * other source available. That makes each Notes block load-bearing in the same
 * way a return value is: an agent that never learns `credential delete` cascades
 * over the credential's access cards will delete them, and an agent that reads
 * `success: true` as "the action worked" will report a failed send as a send.
 *
 * So the assertions below are NOT spell-checks. Each one pins a fact that was
 * measured against the code — cited beside it — and whose ABSENCE is what causes
 * the caller to do the wrong thing silently. A refactor that drops a Notes block
 * is exactly the regression this file exists to redden.
 *
 * The help text is read the way a caller reads it — through `outputHelp()`, not
 * `helpInformation()`. Commander emits `addHelpText("after")` from the help
 * LISTENERS, so `helpInformation()` returns the built-in sections only and every
 * assertion here would pass against an empty Notes block.
 */

const { deleteCredential } = vi.hoisted(() => ({ deleteCredential: vi.fn() }));

// Derived from the real module rather than enumerated. A hand-written factory
// is a DECLARATION LIST — it covers what someone typed, never what `../client`
// actually exports — so adding an export there breaks every consumer of the
// mock. That is how this file went red when `seconds()` was added: it registers
// the prompt-assistant commands, which import it. Spreading the real module
// first means a new export cannot break this again.
vi.mock("../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../client")>()),
  createClient: () => ({
    credentials: { delete: deleteCredential }
  })
}));

import { registerAccessCardCommands } from "./access-card";
import { registerCredentialCommands } from "./credential";
import { registerExternalToolCommands } from "./external-tool";
import { registerPromptAssistantCommands } from "./prompt-assistant";

type Register = (program: Command) => void;

/** The `--help` a caller actually sees for `nexus <namespace> <subcommand>`. */
function helpFor(register: Register, namespace: string, subcommand: string): string {
  const program = new Command();
  program.name("nexus").exitOverride();
  register(program);

  const ns = program.commands.find((c) => c.name() === namespace);
  if (!ns) throw new Error(`namespace '${namespace}' is not registered`);
  const cmd = ns.commands.find((c) => c.name() === subcommand);
  if (!cmd) throw new Error(`'${namespace} ${subcommand}' is not registered`);

  let out = "";
  cmd.configureOutput({ writeOut: (str) => (out += str) });
  cmd.outputHelp();
  return out;
}

/**
 * Assert every phrase appears, reporting the FIRST missing one by name.
 * A bare `expect(help).toContain(a && b && c)` names the block and not the fact.
 *
 * Both sides are whitespace-normalised: a Notes block is hand-wrapped at ~80
 * columns, so any sentence long enough to be worth pinning already straddles a
 * newline. Matching raw would tie each assertion to the wrap position and fail
 * on a reflow that changed nothing a reader cares about.
 */
function expectAllPresent(help: string, phrases: readonly string[]): void {
  const flat = help.replace(/\s+/g, " ");
  for (const phrase of phrases) {
    expect(flat, `missing from --help: "${phrase}"`).toContain(phrase.replace(/\s+/g, " "));
  }
}

describe("nexus credential --help", () => {
  it("names the delete cascade, the refusals, and the partial-delete case", () => {
    const help = helpFor(registerCredentialCommands, "credential", "delete");

    expectAllPresent(help, [
      // AccessCard.credentialId is ON DELETE CASCADE (schema.prisma), and it does
      // not spare the master card that `access-card delete` refuses to remove.
      "DELETES EVERY ACCESS CARD ON IT",
      "access-card list --credential-id",
      // Agent tool configs / workflow nodes / deployments hold the credential id
      // inside JSON with no foreign key — nothing repoints them.
      "NOTHING REPOINTS WHAT NAMES IT",
      // prisma-credential.repository.ts deletes the Credential row first and
      // logs-and-skips a source cleanup that other tables still reference.
      "A 2xx IS NOT ALWAYS A COMPLETE DELETE",
      // delete-credential.use-case.ts refuses on a live VibeAppCredentialBinding…
      "CREDENTIAL_STILL_BOUND",
      // …and revokes at Pipedream BEFORE the local delete, keeping the row on 502.
      "REVOKED UPSTREAM BEFORE ANYTHING LOCAL HAPPENS"
    ]);
  });

  it("states that only name and description are writable, and that SOURCE decides which", () => {
    const help = helpFor(registerCredentialCommands, "credential", "update");

    expectAllPresent(help, [
      // UpdateCredentialBodySchema is `{ name?, description? }` — a z.object, so
      // every other key the caller sends is stripped and answered with a 200.
      "ONLY name AND description ARE WRITABLE",
      // …and that sentence alone was WRONG IN THE REASSURING DIRECTION: it is
      // true of api_key_connection only. `ToolCredentials` has no `description`
      // column and `OAuthConnection` has neither, so the two fields it named as
      // safe were the two being dropped on 2 of the 3 sources (NEX-3854). The
      // per-source table and the refusal are what make the first line honest.
      "api_key_connection",
      "tool_credential",
      "oauth_connection",
      "CREDENTIAL_FIELD_NOT_WRITABLE",
      // The no-op carve-out. Without it a reader concludes any `description` on
      // a tool credential is a 400, and the dashboard's own rename — which
      // always sends `description: null` — looks broken.
      "RE-SENDING A VALUE THAT IS ALREADY SET IS NOT REFUSED",
      "CANNOT REPAIR"
    ]);
  });

  it("explains SOURCE where `credential get` prints it, not only on `list`", () => {
    const help = helpFor(registerCredentialCommands, "credential", "get");

    // `source` is printed by `get` and decides two separate things — what
    // `delete` tears down, and what `update` can store — and it was explained
    // only in `credential list --help`, which a reader of `get` never opens.
    expectAllPresent(help, [
      "SOURCE IS THE FIELD THAT DECIDES WHAT ELSE WORKS",
      "credential update"
    ]);
  });
});

describe("nexus credential delete --yes", () => {
  beforeEach(() => {
    deleteCredential.mockReset();
    deleteCredential.mockResolvedValue({ deleted: true });
  });

  it("offers --yes, like its far less destructive sibling tool delete-credential", () => {
    const program = new Command();
    program.name("nexus").exitOverride();
    registerCredentialCommands(program);

    const del = program.commands
      .find((c) => c.name() === "credential")
      ?.commands.find((c) => c.name() === "delete");

    expect(del?.options.some((o) => o.long === "--yes")).toBe(true);
  });

  it("deletes without prompting when --yes is passed", async () => {
    const program = new Command();
    program.name("nexus").exitOverride();
    registerCredentialCommands(program);

    await program.parseAsync(["node", "nexus", "credential", "delete", "cred-1", "--yes"]);

    expect(deleteCredential).toHaveBeenCalledWith("cred-1");
  });

  it("still deletes non-interactively — the prompt is a TTY affordance, not a gate", async () => {
    // Piped stdout has no way to answer a question. Blocking there would hang
    // every script that ever called this command, so the guard is TTY-only and
    // the help says so.
    const isTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });

    try {
      const program = new Command();
      program.name("nexus").exitOverride();
      registerCredentialCommands(program);

      await program.parseAsync(["node", "nexus", "credential", "delete", "cred-2"]);

      expect(deleteCredential).toHaveBeenCalledWith("cred-2");
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: isTTY, configurable: true });
    }
  });
});

describe("nexus access-card --help", () => {
  it("names the empty-policies trap on create", () => {
    const help = helpFor(registerAccessCardCommands, "access-card", "create");

    expectAllPresent(help, [
      // applyCardPolicy: `{}` is all-access only when isMaster, and
      // prisma-access-card.repository.ts hard-codes isMaster: false on create.
      // The CLI defaults policies to {} — a card that grants nothing.
      "OMITTING policies CREATES A CARD THAT GRANTS NOTHING",
      // isActionPermitted is a hasOwnProperty test over the policy map.
      "AN UNLISTED ACTION IS DENIED",
      "access-card available-actions"
    ]);
  });

  it("renders every enforced-required option as required", () => {
    // Commander ENFORCES a requiredOption ("error: required option
    // '--credential-id <id>' not specified") but renders it in the options list
    // identically to an optional one. A caller reading the help — or an agent
    // pasted it — cannot tell the two apart, which is the whole NEX-3641
    // complaint. The description carries what the renderer will not.
    for (const sub of ["list", "create", "available-actions"]) {
      const help = helpFor(registerAccessCardCommands, "access-card", sub);
      expect(help, `${sub}: --credential-id is not marked required`).toMatch(
        /--credential-id <id>\s+Credential ID \(required\)/
      );
    }

    const create = helpFor(registerAccessCardCommands, "access-card", "create");
    expect(create).toMatch(/--name <name>\s+Card name \(required\)/);
  });

  it("says policies is replaced, never merged, and that master refuses it", () => {
    const help = helpFor(registerAccessCardCommands, "access-card", "update");

    // The repository writes `policies: data.policies` wholesale, and
    // update-access-card.use-case.ts 400s on a master card's policies/variables.
    expectAllPresent(help, ["REPLACED WHOLESALE, NEVER MERGED", "THE MASTER CARD REFUSES"]);
  });
});

describe("nexus external-tool --help", () => {
  it("refuses to let success:true be read as a successful action", () => {
    const help = helpFor(registerExternalToolCommands, "external-tool", "execute");

    expectAllPresent(help, [
      // pipedream-handler.ts RETURNS processPipedreamResponse's error message as
      // the result, so tools-execution.service.ts still answers success: true.
      '"success": true DOES NOT MEAN THE ACTION SUCCEEDED',
      "Pipedream action failed:",
      // tool-external.ts merges and dispatches; `required` is parsed metadata
      // that nothing enforces before the call leaves.
      "NEXUS DOES NOT VALIDATE YOUR PARAMETERS"
    ]);
  });

  it("states that the spec and the operation ids never come back", () => {
    const help = helpFor(registerExternalToolCommands, "external-tool", "get");

    // ExternalToolDetailSchema carries actionsCount and neither openApiSpec nor
    // an action list.
    expectAllPresent(help, ["THE STORED openApiSpec IS NOT RETURNED", "NEITHER ARE THE OPERATION"]);
  });

  it("states the spec is a string and that writes need a requestBody", () => {
    const help = helpFor(registerExternalToolCommands, "external-tool", "create");

    // CreateExternalToolBodySchema: openApiSpec is z.string().min(1).
    // openapi-parser.ts derives body fields from requestBody only.
    expectAllPresent(help, [
      "openApiSpec IS A STRING, NOT AN OBJECT",
      "DECLARE requestBody FOR EVERY WRITE OPERATION"
    ]);
  });
});

describe("nexus prompt-assistant --help", () => {
  it("warns against the resend and names --mode as always required", () => {
    const help = helpFor(registerPromptAssistantCommands, "prompt-assistant", "chat");

    expectAllPresent(help, [
      // PromptAssistantChatBodySchema requires `mode` on every call, threadId or not.
      "--mode IS REQUIRED ON EVERY CALL",
      // prompt-assistant.service.ts falls back to createThread when the id
      // resolves to nothing — the quietest way to lose a conversation.
      "AN UNRECOGNISED ONE OPENS A NEW THREAD",
      // The command polls for up to 5 minutes (pollForResponse) before throwing.
      "NEVER RESEND ON AN APPARENT HANG",
      "list-threads"
    ]);
  });

  it("says promptResult.prompt is markdown and is absent until completion", () => {
    const help = helpFor(registerPromptAssistantCommands, "prompt-assistant", "get-thread");

    // PromptResultSchema.prompt is z.string(); promptResult is written only on
    // the COMPLETED transition in prompt-assistant.service.ts.
    expectAllPresent(help, [
      "promptResult IS ABSENT UNTIL status IS completed",
      "MARKDOWN STRING",
      "do NOT JSON.parse it"
    ]);
  });

  it("keeps every documented thread id a UUID, as the route demands", () => {
    // ThreadIdParamSchema is z.string().uuid(), so the old `thr-123` examples
    // could never have run.
    const help = helpFor(registerPromptAssistantCommands, "prompt-assistant", "get-thread");

    expect(help).not.toContain("thr-123");
  });
});
