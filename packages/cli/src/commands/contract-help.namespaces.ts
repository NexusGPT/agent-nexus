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
 * TWO reasons genuinely block a descriptor today:
 *
 *   · `no-flag-and-no-body` — the enum is a QUERY PARAMETER the CLI never sends,
 *     and there is no `--body` to reach it through. `customer list` sends no
 *     sortBy, sortOrder or channel; `tracing traces` sends no source; `tracing
 *     generations` sends no sortBy or order; `tracing cost-breakdown` sends no
 *     bucket; `execution list` sends no sortBy or order. Binding one means
 *     ADDING A FLAG — a change to what the CLI can DO, not to what it says, and
 *     therefore a product decision rather than rollout.
 *
 *     ⚠️ A BODY FIELD WITH NO FLAG IS A DIFFERENT SHAPE AND IS NOT BLOCKED. A
 *     command carrying `--body` genuinely reaches it, so `bodyOnly` states the
 *     truth and the descriptor binds. `template create` does that for
 *     `Body.type`, and `deployment embed-config-update` for all seven of its
 *     enums. Reading the two as one shape leaves bindable descriptors on the
 *     floor, which is exactly what happened.
 *   · `open-union` — `tool connect --service` takes a built-in OAuth service
 *     name OR any Pipedream app slug, so `.choices()` would refuse valid input
 *     and `alsoAccepts` would have to enumerate thousands of slugs. Neither
 *     `enumOption` nor any list can express it. A permanent limit.
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
 *     list --all-orgs` and `channel setup --auto` switch route on a flag while
 *     `bindCommand` takes one shape. A DECISION already taken and argued at the
 *     call site — the default branch is bound because the two descriptors' enums
 *     are identical. Do not reopen it.
 *   · A NESTED OR ARRAY-OF-OBJECT BODY ENUM -> `reachable-not-yet-bound`.
 *     `judgeConfigs[].provider`, `filters[].op`, `edges[].type`. These need a
 *     `bodyOnly` REASON WRITTEN, not a decision taken, and they are the largest
 *     remaining group.
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
    descriptor: "CustomerList",
    reason: "no-flag-and-no-body",
    leaf: "customer list",
    unreachable: ["Params.sortBy", "Params.sortOrder", "Params.channel"]
  },
  {
    descriptor: "WorkflowExecutionList",
    reason: "no-flag-and-no-body",
    leaf: "execution list",
    unreachable: ["Params.sortBy", "Params.order"]
  },
  {
    descriptor: "WorkflowExecutionListForWorkflow",
    reason: "no-flag-and-no-body",
    leaf: "execution list --workflow-id",
    unreachable: ["Params.sortBy", "Params.order"]
  },
  {
    // ONE field of four blocks this descriptor, and that is the shape worth
    // seeing: `--status`, `--sort-by` and `--order` all exist on this leaf and
    // hand-type lists that match the contract exactly. Only `source` has no
    // flag, and the gate is all-or-nothing per descriptor, so three ready enums
    // wait on one absent one.
    descriptor: "TracingListTraces",
    reason: "no-flag-and-no-body",
    leaf: "tracing traces",
    unreachable: ["Params.source"]
  },
  {
    descriptor: "TracingListGenerations",
    reason: "no-flag-and-no-body",
    leaf: "tracing generations",
    unreachable: ["Params.sortBy", "Params.order"]
  },
  {
    descriptor: "TracingAnalyticsCostBreakdown",
    reason: "no-flag-and-no-body",
    leaf: "tracing cost-breakdown",
    unreachable: ["Params.bucket"]
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
  },
  {
    // Both enums live inside the Twilio Types object, which `--body-file` supplies
    // whole. Two `bodyOnly` reasons away from binding.
    descriptor: "ChannelWhatsappTemplateCreate",
    reason: "reachable-not-yet-bound",
    leaf: "channel whatsapp-template create",
    unreachable: []
  },
  {
    // `--type carousel` is already on this leaf and already hand-types the list.
    descriptor: "DeploymentWhatsappTemplateAttach",
    reason: "reachable-not-yet-bound",
    leaf: "deployment template attach",
    unreachable: []
  },
  {
    descriptor: "WorkflowBatchExecute",
    reason: "reachable-not-yet-bound",
    leaf: "workflow batch",
    unreachable: []
  },
  {
    descriptor: "WorkflowEdgeCreate",
    reason: "reachable-not-yet-bound",
    leaf: "workflow edge create",
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
      "base URL and no profile. Its 18 hidden aliases register no namespace of " +
      "their own, which is why 64 top-level names are 46 namespaces."
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
  docs: registerDocsCommand,
  emulator: registerEmulatorCommands,
  "html-template": registerHtmlMessageTemplateCommands,
  "task-eval": registerEvaluationCommands,
  customer: registerCustomerCommands,
  execution: registerExecutionCommands,
  vibe: registerVibeCommands
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
