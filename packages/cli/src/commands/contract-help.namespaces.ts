import { Command } from "commander";

import { registerAccessCardCommands } from "./access-card";
import { registerAgentCommands } from "./agent";
import { registerAgentCollectionCommands } from "./agent-collection";
import { registerAgentEvalCommands } from "./agent-eval";
import { registerAgentSkillCommands } from "./agent-skill";
import { registerAgentToolCommands } from "./agent-tool";
import { registerAnalyticsCommands } from "./analytics";
import { registerAssetCommands } from "./asset";
import { registerChannelCommands } from "./channel";
import { registerCloudImportCommands } from "./cloud-import";
import { registerCollectionCommands } from "./collection";
import { GENERATED_NAMESPACE_LEDGER, type GeneratedNamespaceName } from "./contract-help.ledger";
import { registerConversationCommands } from "./conversation";
import { registerCredentialCommands } from "./credential";
import { registerCueCommands } from "./cue";
import { registerCustomModelCommands } from "./custom-model";
import { registerCustomerCommands } from "./customer";
import { registerDeploymentCommands } from "./deployment";
import { registerDocsCommand } from "./docs";
import { registerDocumentCommands } from "./document";
import { registerEmulatorCommands } from "./emulator";
import { registerEvaluationCommands } from "./evaluation";
import { registerExecutionCommands } from "./execution";
import { registerExternalToolCommands } from "./external-tool";
import { registerFolderCommands } from "./folder";
import { registerHtmlMessageTemplateCommands } from "./html-message-template";
import { registerKnownIssuesCommand } from "./known-issues";
import { registerPermissionsCommands } from "./permissions";
import { registerPhoneNumberCommands } from "./phone-number";
import { registerPromptAssistantCommands } from "./prompt-assistant";
import { registerRoleCommands } from "./role";
import { registerSkillFolderCommands } from "./skill-folder";
import { registerTaskCommands } from "./task";
import { registerTemplateCommands } from "./template";
import { registerTicketCommands } from "./ticket";
import { registerToolCommands } from "./tool";
import { registerTracingCommands } from "./tracing";
import { registerTracksCommands } from "./tracks";
import { registerUserGroupCommands } from "./user-group";
import { registerVersionCommands } from "./version";
import { registerVibeCommands } from "./vibe";
import { registerWorkflowCommands } from "./workflow";
import { registerWorkspaceCommands } from "./workspace";

/**
 * THE REGISTRARS for contract-generated help, and the taxonomy of what is NOT
 * generated.
 *
 * 🚨 THE LIST OF NAMESPACES IS NOT HERE. It is `contract-help.ledger.ts`, which
 * imports nothing, and that file's header owns the reason: a registrar is a
 * VALUE, so naming 39 of them makes this module import all 39 command files,
 * each of which imports the `*.contract.generated.ts` the generator writes.
 * Reading the list therefore used to require the generator's own output to
 * already be on disk — which it is not, during the one check that proves the
 * output is current. Read that header before moving anything back.
 *
 * This module pairs each ledger entry with its registrar and re-exports the
 * combined list as `GENERATED_NAMESPACES`, so every consumer that wants to BUILD
 * a namespace is unchanged. The generator's phase 1 reads the ledger alone.
 *
 * ── Why the registrar is named here rather than discovered ──────────────────
 *
 * `command-universe.ts` derives the WHOLE tree by importing every module in this
 * directory and calling each arity-1 `register*` export, and that is the right
 * instrument for its own question — "is the sweep's list of 34 leaves still all
 * of them". It is the wrong one here, for a reason that is a property of the
 * mechanism rather than of today's tree: it imports all ~60 command modules, so
 * a gate built on it reports on the health of 57 modules it does not check. Any
 * one of them failing to import makes this file red with a message about
 * somebody else's file and no signal about the contract at all.
 *
 * That is not hypothetical — measured while writing this, with two neighbouring
 * modules mid-edit: `ReferenceError: DOCS_URL is not defined` from `docs.ts`,
 * and a `model.ts` typecheck error. Neither has anything to do with a contract
 * binding, and both took the entire suite from "10 assertions" to "no tests".
 *
 * So this list names its own registrars, exactly as `help-completeness.test.ts`
 * does for its six. The population it walks is the namespaces named below, not
 * the CLI, and naming them is the honest scope rather than a second census.
 *
 * ── What is NOT here, and why that is a decision rather than a backlog ───────
 *
 * A descriptor enters this list only when EVERY enum it declares can reach a
 * flag or a positional, or be honestly declared body-only. The gate is
 * all-or-nothing per descriptor, so one contract enum the CLI cannot express
 * blocks its whole descriptor.
 *
 * 🚨 {@link BLOCKED_DESCRIPTORS} IS THE AUTHORITY ON WHY, AND THIS PARAGRAPH IS
 * ONLY ITS SUMMARY. A reason typed there is a value, `test/unit/contract-blocked
 * .test.ts` walks every record on every run, and its four arms are the reason to
 * read the const rather than this text:
 *
 *   · a descriptor a CLI leaf CALLS is bound or blocked. There is no third state,
 *     and an unclassified one is RED by name.
 *   · an unknown reason does not compile, and neither does a reason the union
 *     gains while the audit does not learn it.
 *   · every path a record calls `unreachable` is REACHED, not believed — through a
 *     flag, a positional, `--body` or a `bodyOnly` declaration. A refusal that has
 *     merely STOPPED being true is RED.
 *   · `reachable-not-yet-bound` and `route-twin-bound-elsewhere` assert the
 *     opposite and are checked the opposite way: every enum must be reachable, so
 *     "nobody got to it" cannot be written down as "it cannot be done".
 *
 * That last arm is what prose could not do. This list said commander validates
 * `.choices()` on options only; the sentence was never measured, it is false, and
 * it cost four descriptors their binding while reading exactly like a fact.
 *
 * NO REASON BLOCKS A DESCRIPTOR FOR WANT OF A FLAG ANY MORE. `no-flag-and-no-body`
 * holds zero records:
 *
 *   · `no-flag-and-no-body` — the enum is a QUERY PARAMETER the CLI never sends,
 *     and there is no `--body` to reach it through. Binding one means ADDING A
 *     FLAG — a change to what the CLI can DO, not to what it says, and therefore
 *     a product decision rather than rollout.
 *
 *     Every descriptor that ever carried this reason took the decision instead
 *     of deferring it, and each one paid for itself:
 *
 *       - `tracing generations` — `--sort-by` and `--order` added. Until then
 *         `--provider` printed a hand-typed three-value list while the server
 *         accepted four, so a KIMI generation was unfilterable by anyone
 *         reading --help.
 *       - `tracing traces` — `--source` added, which let `--status`, `--sort-by`
 *         and `--order` bind. All three had hand-typed their values in
 *         DESCRIPTIONS and validated nothing, under a Notes block that claimed
 *         "any other value is refused". Driven, `--sort-by __junk__` reached the
 *         network. A help text asserting a refusal nothing performs is worse
 *         than one saying nothing at all.
 *       - `tracing cost-breakdown` — `--bucket` added.
 *       - `customer list` — `--sort-by`, `--sort-order` and `--channel` added.
 *         The adapter behind that route keeps its own sort allowlist and falls
 *         back silently on a miss, so an unvalidated `--sort-by` did not even
 *         400: it returned a differently-ordered page and said nothing.
 *       - `execution list` — `--sort-by` and `--order` added, unblocking
 *         `--status` on both of its routes.
 *
 *     The reason stays in the union because the SHAPE is real and the next
 *     query parameter somebody adds will wear it. It describes nothing today.
 *     Count it, never quote it.
 *
 *     ⚠️ A BODY FIELD WITH NO FLAG IS A DIFFERENT SHAPE AND IS NOT BLOCKED. A
 *     command carrying `--body` genuinely reaches it, so `bodyOnly` states the
 *     truth and the descriptor binds. `template create` does that for
 *     `Body.type`, and `deployment embed-config-update` for all seven of its
 *     enums. Reading the two as one shape leaves bindable descriptors on the
 *     floor, which is exactly what happened.
 *
 * 🚨 `open-union` HOLDS NO RECORD, AND THE EXAMPLE THIS TEXT USED TO GIVE FOR IT
 * WAS NOT ONE. It read: "`tool connect --service` takes a built-in OAuth service
 * name OR any Pipedream app slug, so `.choices()` would refuse valid input" — and
 * `ToolConnectionConnect` projects exactly one field, `PathVars.toolId`, with no
 * enum and no `service` at all. There was nothing to refuse and therefore nothing
 * to block, which is why the census has always printed `open-union (0)` while
 * this paragraph called it one of two live blocks. The reason stays in the union
 * because an open set IS a real permanent limit; it simply does not describe
 * anything in the contract today. Count it, never quote it.
 *
 * These are NOT blocks, and each was read as one at some point. Each now has a
 * reason of its own, so it is countable instead of being folded into a wall:
 *
 *   · A POSITIONAL ENUM. Commander validates `.choices()` on an `Argument`
 *     exactly as on an `Option` — required, optional and variadic all refuse a
 *     junk value. Bind one with `enumArgument`, never by hand: the
 *     `.argParser()` trap that silently disables `.choices()` is identical on
 *     both. There is no reason for this shape because there is nothing to refuse.
 *   · ONE LEAF SERVING TWO DESCRIPTORS -> `route-twin-bound-elsewhere`. `ticket
 *     list --all-orgs`, `channel setup --auto` and `execution list
 *     --workflow-id` switch route on a flag while `bindCommand` takes one shape.
 *     A DECISION already taken and argued at the call site — the default branch
 *     is bound because the two descriptors' enums are identical. Do not reopen
 *     it.
 *   · A NESTED OR ARRAY-OF-OBJECT BODY ENUM -> `reachable-not-yet-bound`. This
 *     was the largest remaining group and it is now EMPTY: `judgeConfigs[]
 *     .provider` and `filters[].op` were bound with their namespaces, and
 *     `channel whatsapp-template create`, `deployment template attach`,
 *     `workflow batch` and `workflow edge create` — the last four — are bound
 *     here. Each took a `bodyOnly` reason, or in `deployment template attach`'s
 *     case one `enumOption` on a `--type` that already existed and validated
 *     nothing. The reason stays in the union for the next namespace, because
 *     "nobody got to it" must never be spellable as "it cannot be done".
 *
 * One shape stops a NAMESPACE rather than a descriptor: `no-projected-fields`.
 * `ModelList` is `GET /public/v1/models` with no path, query or body, so the
 * generator refuses to write a module for a namespace holding only descriptors
 * like it — every flag bound to one would be offered no values whatever.
 * `model` and `auth` are that class: `auth` reaches only `MeGet` and
 * `MeListOrganizations`, and both project nothing either.
 *
 * A SECOND shape stops a namespace, and no `BlockedReason` can express it,
 * because every member of that union is a statement ABOUT A DESCRIPTOR while
 * this one is the absence of any: a namespace whose leaves call no v1 route at
 * all. {@link UNCONTRACTED_NAMESPACES} records those, with the surface each one
 * calls instead.
 *
 * 🚨 THOSE THREE LISTS NOW HAVE TO COVER EVERY VISIBLE NAMESPACE, AND UNTIL
 * RECENTLY NOTHING CHECKED THAT. `BLOCKED_DESCRIPTORS` is total over the
 * descriptors a leaf CALLS AND THAT DECLARE AN ENUM — both qualifiers are
 * deliberate, and together they leave a namespace-shaped hole. `known-issues`
 * shipped through it: one leaf, one descriptor, no enum, and therefore no entry
 * in the audit's population and no entry in any list here.
 *
 * `contract-blocked-audit.ts` derives the namespace partition too, and reds on
 * one that is accounted for nowhere. Read the ratio off that census rather than
 * off any sentence — the denominator moved the last time somebody wrote it down.
 */
/**
 * Why a descriptor the CLI genuinely calls is NOT in the ledger.
 *
 * ⚠️ NOT AN ENUM OF EVERY POSSIBLE REASON. It is the vocabulary this rollout has
 * needed, and adding to it is a deliberate edit here rather than a sentence
 * somewhere. The taxonomy that preceded it was prose alone, and prose alone is
 * how "commander validates choices on options only" survived long enough to cost
 * four descriptors their binding.
 *
 * IT IS, HOWEVER, TOTAL OVER THE DESCRIPTORS A CLI LEAF CALLS. `contract-blocked
 * .test.ts` derives that population from the contract and the commander tree on
 * every run and fails on one that is neither bound nor named below, so a
 * descriptor cannot be silently unexamined.
 */
export type BlockedReason =
  /** A query parameter with no flag, on a command with no `--body` to reach it
   *  through. Unblocking means ADDING A FLAG — a product decision. */
  | "no-flag-and-no-body"
  /** The value is a closed contract enum OR an open set the contract cannot
   *  name, so `.choices()` would refuse valid input. A permanent limit. */
  | "open-union"
  /** The descriptor projects no fields at all, so the generator refuses to write
   *  a module for a namespace holding only descriptors like it. */
  | "no-projected-fields"
  /** NOT A WALL. Every enum is reachable TODAY — through `--body`, a flag or a
   *  positional — and nobody has written the binding yet. `unreachable` MUST be
   *  empty, and `contract-blocked-audit.ts` proves the reach path by path.
   *  Kept distinct from every other reason because conflating "nobody got to it"
   *  with "it cannot be done" is how the prose taxonomy drifted: a body field
   *  with no flag is this, never `no-flag-and-no-body`. */
  | "reachable-not-yet-bound"
  /** NOT A WALL. One leaf switches route on a flag while `bindCommand` takes one
   *  shape, and the leaf is bound to the twin. A decision taken, argued at the
   *  call site. `unreachable` MUST be empty. */
  | "route-twin-bound-elsewhere";

export interface BlockedDescriptor {
  /** Key into `ZPublicApiV1`. */
  readonly descriptor: string;
  readonly reason: BlockedReason;
  /** The leaf that would have been bound, e.g. `customer list`. */
  readonly leaf: string;
  /** Contract paths, relative to the descriptor, that nothing can reach. */
  readonly unreachable: readonly string[];
}

/**
 * The refusals THIS pass established by reading the command file, never by
 * inference. A descriptor absent from here is unexamined, not cleared.
 *
 * Re-derive the population it is a subset of rather than trusting its length —
 * the numbers move with every namespace anyone converts:
 *
 *   every key of `ZPublicApiV1` whose projection carries an enum field, minus
 *   every descriptor named in `GENERATED_NAMESPACES`.
 */
export const BLOCKED_DESCRIPTORS: readonly BlockedDescriptor[] = [
  {
    // `execution list --workflow-id` switches this leaf to the path-scoped
    // route. Both routes carry the SAME three enums — status, sortBy, order —
    // and differ only in where the workflow id travels, so the default branch
    // binds and this is the `channel setup` shape, not a wall.
    descriptor: "WorkflowExecutionListForWorkflow",
    reason: "route-twin-bound-elsewhere",
    leaf: "execution list --workflow-id",
    unreachable: []
  },
  {
    descriptor: "ModelList",
    reason: "no-projected-fields",
    leaf: "model list",
    unreachable: []
  },
  {
    // `auth` IS THE SECOND MEMBER OF `model`'s CLASS, and it took a lane reading
    // the projection to see it: this namespace looks local — login, logout,
    // switch, pin, list and status touch nothing but the profile file on disk —
    // and TWO of its leaves are live reads of the v1 contract. Both project
    // nothing, so the generator refuses the whole namespace.
    //
    // Neither is in the audit's `calledBy` map either, and that is not an
    // oversight: `auth` uses raw `fetch` against an absolute URL rather than the
    // SDK client, so the route scanner resolves no descriptor for it. That is
    // precisely why the record is worth writing — nothing else in this repo
    // says these two routes have a CLI caller.
    descriptor: "MeGet",
    reason: "no-projected-fields",
    leaf: "auth whoami",
    unreachable: []
  },
  {
    descriptor: "MeListOrganizations",
    reason: "no-projected-fields",
    leaf: "auth orgs",
    unreachable: []
  },
  {
    // `channel setup` sends --auto to autoProvision and otherwise to
    // getSetupStatus. `--type` already carries this enum on the leaf, so the
    // block is the one-shape-per-command limit, never the flag.
    descriptor: "ChannelSetupGet",
    reason: "route-twin-bound-elsewhere",
    leaf: "channel setup",
    unreachable: []
  }
];

export interface UncontractedNamespace {
  /** The top-level command name, e.g. `upgrade`. */
  readonly namespace: string;
  /**
   * The path prefix its leaves DO call, or `"(no network)"`. This is the
   * checkable half: a scanner can assert no leaf under `namespace` resolves to a
   * `/public/v1` route, which is the whole claim.
   */
  readonly surface: string;
  /** Why the contract has nothing to say here, for a reader. */
  readonly because: string;
}

/**
 * NAMESPACES WITH NO CONTRACT TO DERIVE FROM — the shape `BlockedReason` cannot
 * express, and deliberately not forced into it.
 *
 * Every member of that union is a statement ABOUT A DESCRIPTOR: this enum has no
 * flag, that union is open, this projection is empty. A namespace whose leaves
 * call no v1 route at all has no descriptor to make the statement about, so a
 * `BLOCKED_DESCRIPTORS` record would have to invent a `descriptor` key —
 * `projectDescriptor` throws on a name `ZPublicApiV1` does not hold, which would
 * take the audit down rather than record anything.
 *
 * ⚠️ THE DISTINCTION IS NOT PEDANTRY, BECAUSE THE TWO HAVE DIFFERENT FUTURES. A
 * `no-flag-and-no-body` record clears when somebody adds a flag. `upgrade` never
 * clears — it drives npm. `api` clears only if the CLI learns to project the
 * contract for a path typed at RUNTIME, which is a feature, not a binding.
 *
 * 🚨 IT IS NOT A CLAIM THAT THE CONTRACT DECLARES NOTHING BY THIS NAME.
 * `ZPublicApiV1` holds `ClaudeCodeSkillDownload` and `ClaudeCodeSkillExists`;
 * the CLI's `claude-code` namespace calls neither, because it installs from a
 * bundle compiled into the binary. Server routes with no CLI caller are the
 * audit's own first exclusion, and this const records the same fact from the
 * command side.
 */
export const UNCONTRACTED_NAMESPACES: readonly UncontractedNamespace[] = [
  {
    namespace: "admin",
    surface: "/api/admin/",
    because:
      "platform-operator routes behind AdminPermissionGuard and a Clerk JWT. They " +
      "bypass the SDK's /api/public/v1 prefix entirely — see util/admin-http.ts — " +
      "so ZPublicApiV1 declares no descriptor for any of them."
  },
  {
    namespace: "api",
    surface: "/api/public/v1 + a path typed at runtime",
    because:
      "THE ONE MEMBER HERE THAT DOES CALL v1, AND IT IS STILL UNBINDABLE. Method " +
      "and path are POSITIONAL ARGUMENTS, so the descriptor is chosen by the " +
      "operator after the binary starts. `bindCommand` takes one shape at " +
      "registration time and there is no shape to take. Reaching it means " +
      "resolving a typed path to a descriptor at runtime, which is a feature."
  },
  {
    namespace: "claude-code",
    surface: "(no network)",
    because:
      "installs skills from src/skills-content.generated.ts, compiled into the " +
      "binary. No fetch, no HttpClient, no API key. The contract's own " +
      "ClaudeCodeSkillDownload and ClaudeCodeSkillExists routes have no caller here."
  },
  {
    namespace: "mcp",
    surface: "/api/public/v1/mcp, as a JSON-RPC 2.0 envelope",
    because:
      "the SECOND member here that does call v1, and unbindable for a different " +
      "reason from `api`. `McpRpc` is a TRANSPORT descriptor: its Body is the " +
      "JSON-RPC envelope — jsonrpc, id, method, params — and `params` is " +
      "deliberately `z.unknown()`, because its shape is decided by `method`, " +
      "which the envelope does not know. So the contract projects no field a " +
      "flag could carry and declares no enum: `--input` fills `params.arguments`, " +
      "whose schema is the TOOL's `inputSchema`, generated server-side at request " +
      "time and printed by `nexus mcp tools get`. The SDK excludes it for the " +
      "same reason — see `v1-routes-have-an-sdk-method.test.ts`."
  },
  {
    namespace: "skills",
    surface: "(no network)",
    because:
      "the same bundle as claude-code, wrapped in project-root detection. Its own " +
      "--help says so: no network calls, no API key required."
  },
  {
    namespace: "upgrade",
    surface: "npm registry + a global package-manager install",
    because:
      "manages the local CLI install. Its --help states it needs no API key, no " +
      "base URL and no profile. It answers to update, latest and up as declared " +
      "aliases, which register no namespace of their own and are not separate " +
      "top-level names either. The namespace total is NAMESPACE_TOTAL in test/" +
      "unit/help-truth.ledger.ts, where a test pins it to the live tree; a " +
      "number written here would be prose that nothing can redden, and the two " +
      "that used to be here had both gone stale."
  }
];

export interface GeneratedNamespace {
  /** The top-level command name, e.g. `analytics`. */
  readonly namespace: string;
  /** Keys into `ZPublicApiV1`. Sorted by the generator, never by hand. */
  readonly descriptors: readonly string[];
  /** The root registrar that hangs this namespace off a program. */
  readonly register: (program: Command) => void;
}

/**
 * Every ledger namespace, mapped to the registrar that hangs it off a program.
 *
 * Keyed by `GeneratedNamespaceName`, so this map is exhaustive BY COMPILATION: a
 * namespace added to the ledger with no registrar does not build, and a
 * registrar named for a namespace the ledger does not hold does not build
 * either. That is what stops the split becoming two lists that drift — it buys
 * the generator a phase 1 that loads against a wiped tree, and costs no
 * looseness here.
 *
 * Ordered as the ledger is, so the two read side by side.
 */
const NAMESPACE_REGISTRARS: Record<GeneratedNamespaceName, (program: Command) => void> = {
  analytics: registerAnalyticsCommands,
  "custom-model": registerCustomModelCommands,
  deployment: registerDeploymentCommands,
  "agent-eval": registerAgentEvalCommands,
  credential: registerCredentialCommands,
  "prompt-assistant": registerPromptAssistantCommands,
  task: registerTaskCommands,
  workflow: registerWorkflowCommands,
  "access-card": registerAccessCardCommands,
  agent: registerAgentCommands,
  channel: registerChannelCommands,
  conversation: registerConversationCommands,
  document: registerDocumentCommands,
  permissions: registerPermissionsCommands,
  "phone-number": registerPhoneNumberCommands,
  ticket: registerTicketCommands,
  tool: registerToolCommands,
  tracing: registerTracingCommands,
  tracks: registerTracksCommands,
  version: registerVersionCommands,
  role: registerRoleCommands,
  "agent-tool": registerAgentToolCommands,
  collection: registerCollectionCommands,
  folder: registerFolderCommands,
  "skill-folder": registerSkillFolderCommands,
  template: registerTemplateCommands,
  "user-group": registerUserGroupCommands,
  workspace: registerWorkspaceCommands,
  "agent-skill": registerAgentSkillCommands,
  "external-tool": registerExternalToolCommands,
  "agent-collection": registerAgentCollectionCommands,
  asset: registerAssetCommands,
  "cloud-import": registerCloudImportCommands,
  cue: registerCueCommands,
  docs: registerDocsCommand,
  emulator: registerEmulatorCommands,
  "html-template": registerHtmlMessageTemplateCommands,
  "task-eval": registerEvaluationCommands,
  customer: registerCustomerCommands,
  execution: registerExecutionCommands,
  vibe: registerVibeCommands,
  "known-issues": registerKnownIssuesCommand
};

/**
 * The ledger, with each entry's registrar attached.
 *
 * Anything that BUILDS a namespace reads this. The generator's phase 1 reads
 * `GENERATED_NAMESPACE_LEDGER` instead, because importing THIS module pulls in
 * every command file and therefore every `*.contract.generated.ts` it is about
 * to write.
 */
export const GENERATED_NAMESPACES: readonly GeneratedNamespace[] = GENERATED_NAMESPACE_LEDGER.map(
  (entry) => ({
    namespace: entry.namespace,
    descriptors: entry.descriptors,
    register: NAMESPACE_REGISTRARS[entry.namespace]
  })
);

/**
 * Build one namespace and hand back its top-level command.
 *
 * A fresh `Command` per namespace rather than one shared root: commander mutates
 * the parent on registration, and a shared root would let one namespace's
 * failure read as another's.
 */
export function buildNamespace(entry: GeneratedNamespace): Command {
  const program = new Command();
  program.name("nexus").exitOverride();
  entry.register(program);

  const group = program.commands.find((cmd) => cmd.name() === entry.namespace);
  if (!group) {
    throw new Error(`"${entry.namespace}" registered no command called "${entry.namespace}"`);
  }
  return group;
}
