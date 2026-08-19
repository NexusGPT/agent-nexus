/**
 * THE AUDIT BEHIND `BLOCKED_DESCRIPTORS` — the reason a descriptor is not bound,
 * verified rather than trusted.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `contract-help.namespaces.ts` decides which v1 descriptors get generated help.
 * A descriptor enters that list only when every enum it declares can reach a
 * flag, a positional, or an honest `bodyOnly` declaration — so one enum the CLI
 * cannot express blocks the whole descriptor.
 *
 * The reasons for those refusals were English prose, checked by nothing. That is
 * not a documentation problem, it is why the taxonomy went wrong: a sentence
 * claiming "commander validates `.choices()` on options only" was written into
 * it, was never measured, is false, and cost four descriptors their binding. An
 * audit of the same prose found one listed shape already dead, one that was a
 * decision rather than a refusal, and two shapes missing.
 *
 * `BLOCKED_DESCRIPTORS` turned the reason into a VALUE. This turns the value into
 * a CHECKED value, which is a different and larger claim:
 *
 *   · the reason is a member of a closed union    -> a typo is a COMPILE error
 *   · every descriptor the CLI CALLS is bound or blocked -> no third state
 *   · `unreachable` is REACHED, not believed      -> a refusal that has stopped
 *     being true goes RED instead of aging into a fact nobody re-measures
 *   · the population is DERIVED from the contract and the commander tree, never
 *     written down, so it cannot go stale in silence
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE POPULATION, AND WHY IT IS THIS ONE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * EVERY v1 DESCRIPTOR THAT A CLI LEAF ACTUALLY CALLS AND THAT DECLARES AN ENUM.
 *
 * Two exclusions, and both are the difference between a gate and a backlog:
 *
 *   · A DESCRIPTOR NO LEAF CALLS. `POST /permissions/check` has no SDK method and
 *     no command; its enums reach no operator, so there is no help to be wrong
 *     and nothing to refuse. Binding it means BUILDING a command. Measured: 433
 *     descriptors exist, 96 declare an enum, and 18 of those are reachable from
 *     no leaf at all.
 *   · A DESCRIPTOR THAT DECLARES NO ENUM. There is no value an operator types
 *     that the CLI could have validated and did not. `ModelList` is in the ledger
 *     anyway, on `no-projected-fields`, because the block there is the
 *     GENERATOR's, one level up — so the population is the union of "calls an
 *     enum" and "is already named in the ledger", never the ledger alone.
 *
 * ⚠️ THE REACH IS BOUNDED BY ROUTE RESOLUTION, AND THAT BOUND IS REPORTED. A leaf
 * whose SDK call the scanner cannot resolve contributes no descriptor, so it can
 * hide one. `unresolvedLeaves` carries that number and the gate asserts it does
 * not grow — the same discipline `help-truth.test.ts` applies to the same scan.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 ONE READ OF THE CONTRACT, NOT TWO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `help-truth-scan.ts` builds its own descriptor index from the
 * `@nexus/types/public-api-v1` SPECIFIER, whose `node` export condition points at
 * `dist/`. `scripts/v1-contract-projection.ts` reads the SOURCE by relative path,
 * deliberately, and its header records what mixing the two cost: a drift gate
 * that regenerated stale output, compared it to committed stale output, and
 * reported the artifact current.
 *
 * So this module builds the route index from the PROJECTION and passes it to
 * `descriptorFor`, rather than calling `descriptorIndex()`. Same segment-matching
 * code, one copy of the contract.
 *
 * Run the census:
 *
 *     pnpm --filter @agent-nexus/cli exec tsx test/unit/contract-blocked-audit.ts
 *     pnpm --filter @agent-nexus/cli exec tsx test/unit/contract-blocked-audit.ts --json
 */

import { Command } from "commander";

import { descriptorNames, projectDescriptor } from "../../scripts/v1-contract-projection";
import { isHiddenCommand } from "../../src/command-universe";
import {
  BLOCKED_DESCRIPTORS,
  type BlockedDescriptor,
  type BlockedReason,
  GENERATED_NAMESPACES,
  UNCONTRACTED_NAMESPACES
} from "../../src/commands/contract-help.namespaces";
import { boundArgument, boundCommand, boundOption } from "../../src/contract-binding";
import {
  buildProgram,
  type Descriptor,
  descriptorFor,
  sdkCallsIn,
  sdkRouteIndex,
  sourceSlices,
  type TreeNode,
  walkTree
} from "./help-truth-scan";

/** Every reason, so the census can print an empty bucket rather than omit it. */
export const BLOCKED_REASONS = [
  "no-flag-and-no-body",
  "open-union",
  "no-projected-fields",
  "reachable-not-yet-bound",
  "route-twin-bound-elsewhere"
] as const satisfies readonly BlockedReason[];

/**
 * THE OTHER DIRECTION, AND IT IS THE ONE THAT ROTS. `satisfies` proves every name
 * above is a real `BlockedReason`; nothing proves every `BlockedReason` is above.
 * A reason added to the union and not here would be UNCHECKED by every arm in
 * this file while the ledger happily used it — a new taxonomy entry with no gate
 * behind it, which is the exact shape this module exists to delete.
 *
 * `Exclude<…>` is `never` while the two agree, and a non-`never` type fails the
 * `extends never` constraint with the missing name printed in the error.
 */
type AssertNever<T extends never> = T;
type _UnhandledReason = AssertNever<Exclude<BlockedReason, (typeof BLOCKED_REASONS)[number]>>;

export interface BlockedAudit {
  /** Descriptor -> the leaf paths that call it. Derived, never written down. */
  readonly calledBy: ReadonlyMap<string, readonly string[]>;
  /** Called descriptors that declare at least one enum, plus every ledger entry. */
  readonly population: readonly string[];
  /** Of those, the ones `GENERATED_NAMESPACES` binds. */
  readonly bound: readonly string[];
  /** Of those, the ones `BLOCKED_DESCRIPTORS` names. */
  readonly blocked: readonly string[];
  /** One line per breach, naming the descriptor. Empty means the ledger is total. */
  readonly violations: readonly string[];
  /** Leaves carrying an SDK call the scanner could not resolve to a route. */
  readonly unresolvedLeaves: number;
  /** Every visible top-level namespace, and which list accounts for it. */
  readonly namespaces: NamespaceCensus;
}

/**
 * THE PARTITION OVER NAMESPACES, which is a different claim from the partition
 * over descriptors and was made by nothing at all until now.
 *
 * `population` above is total over the descriptors a leaf CALLS AND THAT DECLARE
 * AN ENUM. Both qualifiers are deliberate and both leave a namespace-shaped
 * hole: a namespace whose only descriptor declares no enum never enters that
 * population, so no arm of this module ever looks at it, and it is neither bound
 * nor blocked nor complained about.
 *
 * 🚨 THAT IS NOT HYPOTHETICAL. `known-issues` shipped, called
 * `KnownIssuesForRoute` through the SDK, declared no enum, and appeared in NO
 * list — not the ledger, not `UNCONTRACTED_NAMESPACES`, not
 * `BLOCKED_DESCRIPTORS`. The rollout ratio was being read as 39/46 while the
 * tree had 47 visible namespaces, so the denominator was wrong and the missing
 * one was invisible rather than merely unconverted.
 *
 * A namespace is accounted for three ways, and every one of them is a place a
 * human wrote something down:
 *
 *   · the ledger converts it;
 *   · `UNCONTRACTED_NAMESPACES` records that its leaves call no v1 route;
 *   · a `BLOCKED_DESCRIPTORS` record names a leaf under it — which is how `model`
 *     and `auth` are accounted for, both on `no-projected-fields`.
 *
 * HIDDEN COMMANDS ARE EXCLUDED, through `isHiddenCommand` rather than a name
 * list. The tree carries none today — every top-level name is a namespace, 49
 * of each — so the exclusion currently subtracts nothing and a broken filter
 * would agree with a correct one. That is the argument FOR deriving it rather
 * than counting: `upgrade` once registered eighteen hidden aliases that
 * reinstalled the running binary and registered no namespace of their own, and
 * a hard-coded 18 would have gone silently wrong on the nineteenth exactly as a
 * hard-coded 0 would go wrong on the first one added back.
 */
export interface NamespaceCensus {
  /** Visible top-level command names, sorted. */
  readonly visible: readonly string[];
  readonly converted: readonly string[];
  readonly uncontracted: readonly string[];
  /** Accounted for only by a `BLOCKED_DESCRIPTORS` record naming one of its leaves. */
  readonly blockedOnly: readonly string[];
  /** In no list at all. MUST be empty. */
  readonly unaccounted: readonly string[];
}

/**
 * The v1 descriptors, keyed `METHOD <contract path>`, from the SOURCE projection.
 *
 * `descriptorFor` needs only `name`, `method` and `path`; the three Zod slots on
 * its `Descriptor` interface are for callers that go on to judge a payload, which
 * this module never does.
 */
function projectedIndex(): Map<string, Descriptor> {
  const index = new Map<string, Descriptor>();
  for (const name of descriptorNames()) {
    const shape = projectDescriptor(name);
    index.set(`${shape.method.toUpperCase()} ${shape.route}`, {
      name,
      method: shape.method,
      path: shape.route
    });
  }
  if (index.size === 0) throw new Error("the contract projection yielded no descriptors");
  return index;
}

/** Enum field paths per descriptor, e.g. `TracingListTraces` -> `["Params.source", …]`. */
function enumPaths(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const name of descriptorNames()) {
    const paths = projectDescriptor(name)
      .fields.filter((field) => field.enumValues !== undefined)
      .map((field) => field.path);
    if (paths.length > 0) out.set(name, paths);
  }
  return out;
}

/** How many fields a descriptor projects at all — the `no-projected-fields` check. */
function fieldCount(name: string): number {
  return projectDescriptor(name).fields.length;
}

/**
 * `Body.judgeConfigs[].provider` -> `provider`.
 *
 * A flag or a positional carries the LEAF KEY of a contract path, never the
 * dotted path — `--sort-by` fills `Params.sortBy`, and no CLI anywhere spells the
 * slot.
 */
function leafKey(path: string): string {
  const last = path.split(".").pop() ?? path;
  return last.replace(/\[\]$/, "");
}

/**
 * Can this leaf put a value into this contract path TODAY?
 *
 * 🚨 THIS IS THE ASSERTION THAT EARNS THE FILE, so it is deliberately GENEROUS.
 * Four ways count as reached, and a refusal has to survive all four:
 *
 *   · a bound slot already names the exact contract path — the strongest form,
 *     and the one a stale refusal beside a finished binding would trip;
 *   · an `--option` whose commander attribute name matches the path's leaf key;
 *   · a positional `<argument>` of that name. THIS IS THE ONE THE FALSE SENTENCE
 *     HID. Commander validates `.choices()` on an `Argument` exactly as on an
 *     `Option`, so a positional reaches a value like any flag, and four
 *     descriptors were refused on the belief that it could not;
 *   · a `bodyOnly` declaration for that path, or a `--body` option on a leaf when
 *     the path is in the `Body` slot.
 *
 * A generous test makes the gate fire on a refusal that has merely BECOME
 * false — which is the whole point — rather than only on one that was false when
 * written.
 *
 * ⚠️ ONE KNOWN IMPRECISION, IN THE GENEROUS DIRECTION. The `--body` branch matches
 * on the option's NAME, so an option that happens to be called `--body` and means
 * something else counts. `channel whatsapp-template create` is exactly that: its
 * `--body <text>` is the template's message text, and the JSON object carrying the
 * nested enums arrives through `--body-file`. The verdict there is right for the
 * wrong micro-reason. It cannot make a `no-flag-and-no-body` record pass — those
 * are judged by arm 4, where generosity fires the gate rather than silencing it —
 * but it does weaken the `reachable-not-yet-bound` proof by exactly one option
 * name.
 */
function reaches(cmd: Command, descriptor: string, path: string): boolean {
  const binding = boundCommand(cmd);
  if (binding?.bodyOnly[path] !== undefined) return true;

  const full = `${descriptor}.${path}`;
  for (const option of cmd.options) {
    if (boundOption(option)?.source.path === full) return true;
  }
  for (const argument of cmd.registeredArguments) {
    if (boundArgument(argument)?.source.path === full) return true;
  }

  const key = leafKey(path);
  for (const option of cmd.options) {
    if (option.attributeName() === key) return true;
    // `--body` reaches every field of the Body slot, which is what makes a
    // body-only enum a REASON TO WRITE DOWN rather than a block.
    if (option.attributeName() === "body" && path.startsWith("Body.")) return true;
  }
  return cmd.registeredArguments.some((argument) => argument.name() === key);
}

/**
 * Resolve `"execution list --workflow-id"` to the `execution list` command.
 *
 * The trailing flag in a `leaf` string names the BRANCH a descriptor is reached
 * through, not a deeper command, so it is stripped before the walk. Returning
 * undefined is a violation, never a skip: a renamed leaf is exactly the rot this
 * gate is for.
 */
function leafCommand(root: Command, leaf: string): Command | undefined {
  let cursor: Command | undefined = root;
  for (const token of leaf.split(/\s+/).filter((t) => t !== "" && !t.startsWith("-"))) {
    cursor = cursor?.commands.find((child) => child.name() === token);
    if (!cursor) return undefined;
  }
  return cursor;
}

/** Descriptor -> the leaf paths whose source slice calls it through the SDK. */
function callGraph(nodes: readonly TreeNode[]): {
  calledBy: Map<string, string[]>;
  unresolvedLeaves: number;
} {
  const index = projectedIndex();
  const sdk = sdkRouteIndex();
  const slices = sourceSlices(nodes);
  const calledBy = new Map<string, string[]>();
  let unresolvedLeaves = 0;

  for (const node of nodes) {
    const slice = slices.get(node);
    if (slice === undefined) continue;
    const calls = sdkCallsIn(slice);
    if (calls.length === 0) continue;

    let resolvedHere = false;
    for (const call of calls) {
      const route = sdk.get(call);
      if (!route) continue;
      const descriptor = descriptorFor(index, route);
      if (!descriptor) continue;
      resolvedHere = true;
      const leaves = calledBy.get(descriptor.name) ?? [];
      leaves.push(node.path.join(" "));
      calledBy.set(descriptor.name, leaves);
    }
    if (!resolvedHere) unresolvedLeaves++;
  }

  return { calledBy, unresolvedLeaves };
}

/**
 * Compare the contract, the commander tree and the ledger in every direction that
 * can go wrong.
 *
 * Returns rather than throws, so the census prints the same object the gate
 * asserts on and a red is readable before it is a stack trace.
 */
/**
 * Which list accounts for each visible top-level namespace.
 *
 * Exported so the gate can drive it against a SYNTHETIC tree. Asserting
 * `unaccounted` is empty on the real CLI proves nothing on its own — an
 * `isHiddenCommand` that returned true for everything, or a `visible` list that
 * came back empty, would satisfy it perfectly.
 */
export function censusNamespaces(root: Command): NamespaceCensus {
  const visible = root.commands
    .filter((cmd) => cmd.name() !== "help" && !isHiddenCommand(cmd))
    .map((cmd) => cmd.name())
    .sort();

  const converted = new Set(GENERATED_NAMESPACES.map((entry) => entry.namespace));
  const uncontracted = new Set(UNCONTRACTED_NAMESPACES.map((entry) => entry.namespace));
  // The leaf string is `"<namespace> <verb> …"`, sometimes with a trailing flag
  // naming the branch. Only the first token is a namespace.
  const blocked = new Set(
    BLOCKED_DESCRIPTORS.map((entry) => entry.leaf.trim().split(/\s+/)[0]).filter(
      (name) => name !== undefined && name !== ""
    )
  );

  return {
    visible,
    converted: visible.filter((name) => converted.has(name)),
    uncontracted: visible.filter((name) => uncontracted.has(name)),
    blockedOnly: visible.filter(
      (name) => !converted.has(name) && !uncontracted.has(name) && blocked.has(name)
    ),
    unaccounted: visible.filter(
      (name) => !converted.has(name) && !uncontracted.has(name) && !blocked.has(name)
    )
  };
}

export function auditBlockedDescriptors(): BlockedAudit {
  const root = buildProgram();
  const nodes = walkTree(root);
  const { calledBy, unresolvedLeaves } = callGraph(nodes);
  const enums = enumPaths();
  const bound = new Set(GENERATED_NAMESPACES.flatMap((entry) => entry.descriptors));
  const ledger = new Map(BLOCKED_DESCRIPTORS.map((entry) => [entry.descriptor, entry] as const));
  const violations: string[] = [];

  const population = [
    ...new Set([...[...calledBy.keys()].filter((name) => enums.has(name)), ...ledger.keys()])
  ].sort();

  // ── 1. NO THIRD STATE ──────────────────────────────────────────────────────
  for (const name of population) {
    if (bound.has(name) || ledger.has(name)) continue;
    violations.push(
      `unclassified: ${name} is called by [${calledBy.get(name)?.join(", ")}] and declares ` +
        `enums [${enums.get(name)?.join(", ")}] — bind it, or add a BLOCKED_DESCRIPTORS record`
    );
  }

  for (const entry of BLOCKED_DESCRIPTORS) {
    violations.push(...auditOne(entry, { root, bound, calledBy, enums }));
  }

  // ── 6. EVERY VISIBLE NAMESPACE IS IN SOME LIST ─────────────────────────────
  const namespaces = censusNamespaces(root);
  for (const name of namespaces.unaccounted) {
    violations.push(
      `unaccounted namespace: "${name}" is in neither GENERATED_NAMESPACE_LEDGER, ` +
        `UNCONTRACTED_NAMESPACES nor any BLOCKED_DESCRIPTORS leaf — convert it, or record ` +
        `why the contract has nothing to say about it`
    );
  }
  // The other direction, and it is the one that rots quietly: a record for a
  // namespace that no longer exists excuses nothing and reads exactly like a
  // live one.
  const live = new Set(namespaces.visible);
  for (const entry of UNCONTRACTED_NAMESPACES) {
    if (!live.has(entry.namespace)) {
      violations.push(
        `dead namespace record: UNCONTRACTED_NAMESPACES names "${entry.namespace}", which is ` +
          `no visible top-level command — it was renamed or removed`
      );
    }
  }

  return {
    calledBy,
    population,
    bound: population.filter((name) => bound.has(name)),
    blocked: [...ledger.keys()].sort(),
    violations,
    unresolvedLeaves,
    namespaces
  };
}

interface AuditContext {
  readonly root: Command;
  readonly bound: ReadonlySet<string>;
  readonly calledBy: ReadonlyMap<string, readonly string[]>;
  readonly enums: ReadonlyMap<string, readonly string[]>;
}

/** Every arm that judges ONE ledger record. Split out so each reason's proof is readable. */
function auditOne(entry: BlockedDescriptor, ctx: AuditContext): string[] {
  const out: string[] = [];
  const { descriptor, reason, leaf, unreachable } = entry;

  // The union refuses an unknown reason at compile time. This is the same claim
  // at runtime, for a ledger reached through a loosened type.
  if (!(BLOCKED_REASONS as readonly string[]).includes(reason)) {
    return [`unknown reason: ${descriptor} claims "${reason}"`];
  }

  // ── 2. A RECORD FOR A BOUND DESCRIPTOR IS STALE ────────────────────────────
  // It reads exactly like a live one and excuses nothing, which is how a fixed
  // thing stays on a list forever.
  if (ctx.bound.has(descriptor)) {
    out.push(`stale: ${descriptor} is bound — its record excuses nothing, delete it`);
  }

  // ── 3. THE DESCRIPTOR AND THE LEAF MUST BOTH STILL EXIST ───────────────────
  const cmd = leafCommand(ctx.root, leaf);
  if (!cmd) {
    out.push(`dead leaf: ${descriptor} names "${leaf}", which is no command in the tree`);
  }
  if (!ctx.calledBy.has(descriptor) && reason !== "no-projected-fields") {
    out.push(
      `dead record: no leaf resolves to ${descriptor} — it was renamed, or the leaf stopped ` +
        `calling it, so the record refuses nothing`
    );
  }

  // ── 4. `unreachable` IS REACHED, NOT BELIEVED ──────────────────────────────
  // The one property that would have caught four descriptors losing their binding
  // to a false sentence: their paths were reachable through a positional all
  // along, and nothing looked.
  const live = ctx.enums.get(descriptor) ?? [];
  for (const path of unreachable) {
    if (!live.includes(path)) {
      out.push(
        `dead blocker: ${descriptor} blocks on "${path}", which is no longer an enum field ` +
          `(live enums: ${live.join(", ") || "none"})`
      );
      continue;
    }
    if (cmd && reaches(cmd, descriptor, path)) {
      out.push(
        `stale blocker: ${descriptor} calls "${path}" unreachable, but "${leaf}" reaches it ` +
          `today — bind the descriptor, or correct the record`
      );
    }
  }

  // ── 5. EACH REASON CARRIES ITS OWN PROOF ───────────────────────────────────
  switch (reason) {
    case "no-flag-and-no-body":
    case "open-union":
      // These two ASSERT that something cannot be reached, so a record naming
      // nothing asserts nothing and passes arm 4 vacuously.
      if (unreachable.length === 0) {
        out.push(`empty: ${descriptor} is "${reason}" and names no unreachable path`);
      }
      break;

    case "no-projected-fields":
      // The generator's block, one level up: it refuses to write a module for a
      // namespace holding only descriptors that project nothing.
      if (fieldCount(descriptor) > 0) {
        out.push(
          `stale: ${descriptor} now projects ${fieldCount(descriptor)} field(s) — the ` +
            `generator's refusal no longer applies`
        );
      }
      if (unreachable.length > 0) {
        out.push(`shape: ${descriptor} projects no fields, so it can name no unreachable path`);
      }
      break;

    case "reachable-not-yet-bound":
    case "route-twin-bound-elsewhere":
      // 🚨 NEITHER OF THESE IS A WALL, and saying so mechanically is the point.
      // Both assert the descriptor is BINDABLE TODAY, so every enum it declares
      // must be reached by the leaf — the exact inverse of arm 4, and the arm
      // that stops "nobody got to it" being written down as "it cannot be done".
      if (unreachable.length > 0) {
        out.push(
          `shape: ${descriptor} is "${reason}", which claims nothing is unreachable — ` +
            `it names [${unreachable.join(", ")}]`
        );
      }
      if (cmd) {
        for (const path of live) {
          if (!reaches(cmd, descriptor, path)) {
            out.push(
              `unproven: ${descriptor} is "${reason}", but "${leaf}" reaches no value for ` +
                `"${path}" — it is blocked, not merely unconverted`
            );
          }
        }
        // The twin claim, without a second field to keep honest: a leaf serving
        // two descriptors is bound to ONE of them, so `boundCommand` must find a
        // binding. An unbound leaf validates neither branch and the record is a
        // story rather than a decision.
        if (reason === "route-twin-bound-elsewhere" && boundCommand(cmd) === undefined) {
          out.push(
            `unproven twin: ${descriptor} says "${leaf}" is bound to the other branch, but ` +
              `that leaf is bound to no descriptor at all`
          );
        }
      }
      break;
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE CENSUS
// ─────────────────────────────────────────────────────────────────────────────

export function renderAudit(audit: BlockedAudit): string {
  const { namespaces } = audit;
  const lines: string[] = [];
  lines.push(`visible top-level namespaces               : ${namespaces.visible.length}`);
  lines.push(`  converted (ledger)                      : ${namespaces.converted.length}`);
  lines.push(`  no v1 route at all                      : ${namespaces.uncontracted.length}`);
  lines.push(
    `  refused, per a BLOCKED_DESCRIPTORS record: ${namespaces.blockedOnly.length}` +
      (namespaces.blockedOnly.length > 0 ? `  (${namespaces.blockedOnly.join(", ")})` : "")
  );
  lines.push(`  UNACCOUNTED                             : ${namespaces.unaccounted.length}`);
  lines.push("");
  lines.push(`descriptors a leaf calls, carrying an enum : ${audit.population.length}`);
  lines.push(`  bound (generated help)                  : ${audit.bound.length}`);
  lines.push(`  blocked (BLOCKED_DESCRIPTORS)           : ${audit.blocked.length}`);
  lines.push(`leaves whose SDK call did not resolve      : ${audit.unresolvedLeaves}`);
  lines.push("");
  for (const reason of BLOCKED_REASONS) {
    const entries = BLOCKED_DESCRIPTORS.filter((e) => e.reason === reason);
    lines.push(`${reason}  (${entries.length})`);
    for (const entry of entries) {
      lines.push(`    ${entry.descriptor}   <- ${entry.leaf}`);
      lines.push(`      unreachable: ${entry.unreachable.join(", ") || "(none)"}`);
    }
  }
  lines.push("");
  if (audit.violations.length === 0) {
    lines.push("OK - every descriptor a leaf calls is bound, or blocked with a verified reason.");
  } else {
    lines.push(`${audit.violations.length} VIOLATION(S):`);
    for (const violation of audit.violations) lines.push(`  ${violation}`);
  }
  return lines.join("\n");
}

if (process.argv[1]?.endsWith("contract-blocked-audit.ts") === true) {
  const audit = auditBlockedDescriptors();
  process.stdout.write(
    process.argv.includes("--json")
      ? `${JSON.stringify({ ...audit, calledBy: [...audit.calledBy] }, null, 2)}\n`
      : `${renderAudit(audit)}\n`
  );
  if (audit.violations.length > 0) process.exit(1);
}
