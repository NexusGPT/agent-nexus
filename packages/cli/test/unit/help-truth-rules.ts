// Every `!` below follows an explicit bounds or length check on the line above
// it (`vars.length !== operands.length`, `routes.length === 0`, a `for` bounded
// by `.length`). A widening `?? ""` would report a violation against the empty
// string instead of crashing on an impossible index.
/* eslint-disable @typescript-eslint/no-non-null-assertion -- see the note above */
import { deriveCommandLeaves, isHiddenCommand } from "../../src/command-universe";
import {
  buildProgram,
  camel,
  type Descriptor,
  descriptorFor,
  descriptorIndex,
  examplesIn,
  fieldIssues,
  flagValuesIn,
  helpOf,
  type Invocation,
  invocationsIn,
  isIdFormatIssue,
  isPlaceholder,
  parseExample,
  type ParseOutcome,
  pathVarsOf,
  registrarCount,
  sdkCallsIn,
  sdkRouteIndex,
  sourceSlices,
  transportCallsIn,
  type TreeNode,
  walkTree
} from "./help-truth-scan";

/**
 * THE SEVEN RULES. One pass over every command, one violation list.
 *
 * Each violation carries a stable {@link Violation.key} — the rule plus the
 * thing that broke, never a line number or a message — because the ledger is
 * keyed on it and a key that moves when prose is reflowed would make the ledger
 * rot on every unrelated edit.
 *
 * ── WHAT EACH RULE CAN AND CANNOT SEE ────────────────────────────────────────
 *
 * R1 and R5 are TOTAL: commander is the real parser, so an example it refuses is
 * an example a reader cannot run, with no judgement involved.
 *
 * R2, R3 and R4 reach only as far as the route resolves. Every command whose
 * route does not resolve is counted in {@link ScanReport.unresolvedCommands} and
 * reported, because "this arm is blind here" and "this arm found nothing here"
 * are the same silence otherwise.
 *
 * None of the seven can see a defect where the HELP IS HONEST AND THE PRODUCT IS
 * BROKEN — a documented value the server 500s on, a 2xx that does nothing, a
 * poll that never terminates. That class needs a live call and is out of reach
 * of anything static, by construction rather than by omission.
 */

export interface Violation {
  /** `workflow node create` — the command path a caller types. */
  readonly command: string;
  readonly rule: RuleId;
  /** Stable identity, used as the ledger key. */
  readonly key: string;
  /** What to read when it goes red: the example and the refusal, verbatim. */
  readonly detail: string;
}

export type RuleId =
  | "R0-no-example"
  | "R0-no-notes"
  | "R1-example-refused"
  | "R2-body-field-refused"
  | "R3-flag-id-refused"
  | "R4-path-id-refused"
  | "R5b-required-option-unexampled"
  | "R6-path-placeholder-unrunnable";

export interface ScanReport {
  readonly violations: readonly Violation[];
  readonly nodeCount: number;
  readonly leafCount: number;
  readonly examplesChecked: number;
  readonly truncated: number;
  /**
   * Invocations whose stdin document the example STATES — `echo '<doc>' | nexus …`.
   *
   * ⚠️ A FLOOR, NOT A RESULT, and the counter that proves the population widened.
   * Every one of these lines was invisible to R1 until the prefix rule stopped
   * being `$ nexus `: a piped example does not start with the binary's name. If
   * this goes to zero the collection has silently narrowed back, and the gate
   * would read exactly as green as it does now.
   */
  readonly statedStdinDocuments: number;
  /**
   * `--body -` payloads R2 actually put to a route's `Body` — the stated stdin
   * document, parsed as an object.
   *
   * ⚠️ A FLOOR, NOT A RESULT, AND THE COUNTERPART OF
   * {@link statedStdinDocuments} FOR THE RULE THAT READS THE DOCUMENT. R1 was
   * taught to parse an echoed `--body -` example; R2 kept `JSON.parse`-ing the
   * raw flag value, which for every one of them is the literal `"-"`, so it
   * threw, continued, and judged no field of any stated payload. A rule that
   * skips its whole population and a rule that asked and found nothing produce
   * the identical empty violation list. Zero here means the skip is back.
   */
  readonly stdinBodiesJudged: number;
  /**
   * Invocations refused ONLY because the scanner could not know the document
   * they pipe in — `cat batch.json | nexus … --body -`.
   *
   * Reported rather than silently skipped, for the reason every other counter
   * here exists: an abstention and a clean pass produce the same empty violation
   * list. Zero when this landed, and it stays zero while every `--body -` example
   * either states its document or belongs to a command whose parse never reads
   * one. A number above zero is not a defect — it is coverage this arm does not
   * have, printed where a reader sees it.
   */
  readonly unstatedStdinBodies: number;
  readonly routesResolved: number;
  readonly routesUnresolved: number;
  readonly unresolvedNoSdkCall: number;
  readonly unresolvedNoDescriptor: number;
  /** Every command the contract arm is blind to, with the reason. */
  readonly unresolvedCommands: readonly { command: string; reason: string }[];
  /** Leaf paths, sorted — compared against `deriveCommandLeaves()` by the gate. */
  readonly leaves: readonly string[];
  readonly globalOptionCount: number;
  readonly registrarCount: number;
  readonly descriptorCount: number;
  readonly sdkRouteCount: number;
  readonly locatedNodes: number;
  /** How many required options R5b actually looked at. A floor, not a result. */
  readonly requiredOptionsExamined: number;
  /**
   * Per namespace: path operands R4 actually put to a route's `PathVars`.
   *
   * ⚠️ THE COUNTERPART OF {@link requiredOptionsExamined}, FOR THE RULE THAT
   * CERTIFIES A NAMESPACE CLEAN. R4 declines to judge an operand on three
   * separate grounds, and a namespace where it declined EVERY time produces the
   * same empty violation list as one where it asked every time and found
   * nothing. Only one of those is protection. Measured 2026-08-15 before this
   * counter existed: `agent-eval` was recorded clean on 0 judged / 32 skipped,
   * and `conversation` on 1 / 28.
   */
  readonly pathOperandsJudged: Readonly<Record<string, number>>;
  /** Per namespace: operands in a format-constrained slot that R4 waved through. */
  readonly pathOperandsSkipped: Readonly<Record<string, number>>;
  /**
   * Per BLIND namespace: WHY no path id in it was checkable.
   *
   * A namespace is blind when it judged nothing and skipped nothing. That one
   * state has four separate causes, and folding them into a single count is what
   * made a reporting artefact read as a contract-coverage programme:
   *
   *   `NO-ROUTE`      no command reaches a v1 route at all. CORRECT, PERMANENT.
   *   `UNREACHED`     routes resolve; none constrains a path operand. CORRECT,
   *                   PERMANENT — `GET /public/v1/models` has no id to check.
   *   `SDK-BYPASS`    the contract EXISTS and the CLI reaches it without the
   *                   SDK, so the arm that reads `client.x.y(` finds nothing.
   *                   Addressable, and not by writing a descriptor.
   *   `NO-DESCRIPTOR` an SDK call whose route the v1 contract does not declare.
   *                   The only one of the four that wants a new descriptor.
   *
   * Ten of the twelve blind namespaces measured on 2026-08-15 were the first two,
   * i.e. correct forever. A total that counts them as a gap overstates the work
   * by ten and cannot be read without subtracting a number nobody prints.
   */
  readonly namespaceBlindness: Readonly<Record<string, NamespaceBlindness>>;
  /**
   * How many raw transport routes resolved to a v1 descriptor, tree-wide.
   *
   * ⚠️ A FLOOR, NOT A RESULT — the same shape as {@link requiredOptionsExamined}.
   * `SDK-BYPASS` is the one blindness cause detected by a SECOND scan rather than
   * by the counters, so a regex that stops matching makes that bucket empty and
   * moves its namespaces into "correct and permanent". The gap total then reads
   * ZERO, which is indistinguishable from the work being finished. Proven by
   * mutation: deleting one of the two patterns in `transportCallsIn` printed
   * `CONTRACT GAP: none` with every other number unchanged.
   */
  readonly transportRoutesResolved: number;
}

/** Why a namespace had no checkable path id. Two are permanent, two are work. */
export type NamespaceBlindness = "NO-ROUTE" | "UNREACHED" | "SDK-BYPASS" | "NO-DESCRIPTOR";

/** The two that no amount of work will ever change. */
export const PERMANENT_BLINDNESS: readonly NamespaceBlindness[] = ["NO-ROUTE", "UNREACHED"];

/** Flags that carry a request body rather than a single field value. */
const BODY_FLAGS = new Set(["body", "data"]);

/** Does this invocation take its request body from standard input? */
function readsBodyFromStdin(argv: readonly string[]): boolean {
  return argv.some(
    (token, i) =>
      // Both spellings commander accepts. Missing `--body=-` would report an
      // abstention as a violation — the one direction that reads as a real find.
      ((token === "--body" || token === "--data") && argv[i + 1] === "-") ||
      token === "--body=-" ||
      token === "--data=-"
  );
}

/**
 * Is this refusal the scanner's own empty stdin talking, rather than the example?
 *
 * `readAndParseBody` refuses an empty document with `Invalid JSON in --body:` and
 * nothing after the colon. Matching the message rather than the code because the
 * code is the generic `threw` — the throw comes from the CLI's own resolver, not
 * from commander.
 */
function isEmptyBodyRefusal(outcome: ParseOutcome): boolean {
  return outcome.kind === "refused" && /Invalid JSON in --body:\s*$/.test(outcome.message);
}
/** Flags that configure the CLI, never a request field. */
const META_FLAGS = new Set([
  "json",
  "profile",
  "api-key",
  "base-url",
  "dashboard-url",
  "timeout",
  "auto-update",
  "no-auto-update",
  "yes",
  "force",
  "help",
  "version"
]);

/**
 * HAND THE EVENT LOOP BACK, so vitest's worker RPC can be answered.
 *
 * This scan is ~50 seconds of almost entirely SYNCHRONOUS work — it renders and
 * regexes the `--help` of every command in the tree. The `await`s already inside
 * the loop do not help: `buildProgram()` resolves from modules that are already
 * imported, so awaiting it drains the MICROTASK queue and never reaches the poll
 * phase. A macrotask is the only thing that does.
 *
 * ⚠️ WITHOUT THIS THE WHOLE RUN FAILS, and it fails somewhere else entirely.
 * vitest talks to its workers over birpc with a 60-SECOND ceiling that is
 * hardcoded in the runner (`DEFAULT_TIMEOUT = 6e4`) and is not configurable. A
 * worker blocked past that never processes the reply to its own `onTaskUpdate`,
 * so `onTimeoutError` throws `[vitest-worker]: Timeout calling "onTaskUpdate"`
 * as an UNHANDLED error. Measured 2026-08-18 while folding this package's two
 * test runners into one: every test passed, every file passed, and `vitest run`
 * exited 1 on an error naming no test — 135 files, 1734 assertions, all green,
 * exit 1. `tsx --test` had no RPC and so no ceiling, which is why this only
 * appeared on the way in.
 *
 * Yielding per node caps the blocking stretch at one command's worth of work.
 */
const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

/** One printed `$ …` invocation, carrying the example line it came from. */
type ExampleInvocation = Invocation & { readonly example: string };

/**
 * The ROUTE half of the scan: which command reaches which v1 descriptor, and
 * which reaches none.
 *
 * ── WHY THIS IS ITS OWN FUNCTION ─────────────────────────────────────────────
 * Two suites want two different halves of one answer. `help-truth` needs the
 * rules and calls {@link runHelpTruthScan}, which continues from this result.
 * `descriptor-match` asks only which commands resolve to a descriptor, and that
 * is decided entirely here — so it stops at this line instead of paying for
 * R1-R4, which cannot change its answer.
 *
 * 🚨 ONE DERIVATION, TWO CONSUMERS, DELIBERATELY. Giving the cheap caller its
 * own copy of this resolution is the obvious way to make it fast and it is the
 * wrong one: the two answers would drift, and the drift would be INVISIBLE —
 * both suites stay green while disagreeing about the same tree. The expensive
 * caller consumes this result rather than recomputing it, so there is no second
 * answer to drift.
 *
 * ── THE COST IS `buildProgram()`, NOT THE PARSING ────────────────────────────
 * Measured 2026-08-31 on this tree: 643 nodes, 1333 invocations. Everything in
 * THIS function totals ~190ms. R1-R4 cost ~37s, of which `parseExample` is
 * 0.6ms a call and `buildProgram` is 27.7ms a call — 98%. A fresh tree per
 * example is REQUIRED (commander stores parsed option values on the Command
 * objects, so a shared tree lets one example's arguments satisfy the next
 * example's required options and turns a real defect green), which is why the
 * split moves the cheap consumer OFF that path rather than memoising the tree
 * underneath it.
 */
export interface RouteResolution {
  readonly base: ReturnType<typeof buildProgram>;
  readonly nodes: readonly TreeNode[];
  readonly leafNodes: readonly TreeNode[];
  readonly slices: Map<TreeNode, string>;
  readonly descriptors: Map<string, Descriptor>;
  readonly sdkRoutes: Map<string, { method: string; path: string }>;
  /** command label → every descriptor its own source slice reaches. */
  readonly routeOf: Map<string, Descriptor[]>;
  /** command label → the `--help` bytes a caller reads. */
  readonly helpByLabel: Map<string, string>;
  /** command label → every runnable invocation printed in that help. */
  readonly invocationsByLabel: Map<string, ExampleInvocation[]>;
  readonly unresolvedCommands: { command: string; reason: string }[];
  readonly routesResolved: number;
  readonly unresolvedNoSdkCall: number;
  readonly unresolvedNoDescriptor: number;
}

export async function resolveCommandRoutes(): Promise<RouteResolution> {
  const base = await buildProgram();
  const nodes = walkTree(base);
  const leafNodes = nodes.filter((n) => n.isLeaf);
  const slices = sourceSlices(nodes);
  const descriptors = descriptorIndex();
  const sdkRoutes = sdkRouteIndex();

  const unresolvedCommands: { command: string; reason: string }[] = [];
  let routesResolved = 0;
  let unresolvedNoSdkCall = 0;
  let unresolvedNoDescriptor = 0;

  // Resolve each node's route ONCE — the slice and the SDK scan do not vary per
  // example, and re-resolving per example would make the arm 1000x its cost.
  const routeOf = new Map<string, Descriptor[]>();
  for (const node of nodes) {
    await yieldToEventLoop();
    const label = node.path.join(" ");
    const slice = slices.get(node);
    if (!slice) continue;
    const found: Descriptor[] = [];
    for (const call of sdkCallsIn(slice)) {
      const route = sdkRoutes.get(call);
      if (!route) continue;
      const descriptor = descriptorFor(descriptors, route);
      if (descriptor && !found.some((d) => d.name === descriptor.name)) found.push(descriptor);
    }
    if (found.length > 0) routeOf.set(label, found);
  }

  const helpByLabel = new Map<string, string>();
  const invocationsByLabel = new Map<string, ExampleInvocation[]>();
  for (const node of nodes) {
    await yieldToEventLoop();
    const label = node.path.join(" ");
    const help = helpOf(node.cmd);
    helpByLabel.set(label, help);

    // 🚨 THE POPULATION IS INVOCATIONS, NOT LINES, AND THE TWO STOPPED BEING THE
    // SAME THING WHEN `examplesIn` WIDENED. It now returns every `$ …` line, and
    // a `$` line need not run this CLI at all — `workspace restore`'s help shows
    // `$ rm ~/nexus/support-docs/notes/probe.md` to set the scene. Counting lines
    // would let that satisfy R0, certifying a command as exampled on a line that
    // invokes `rm`.
    const invocations = examplesIn(help).flatMap((example) =>
      invocationsIn(example).map((invocation) => ({ example, ...invocation }))
    );
    invocationsByLabel.set(label, invocations);

    // ── the blind spots, counted rather than skipped ──────────────────────────
    if (invocations.length > 0) {
      if ((routeOf.get(label) ?? []).length > 0) {
        routesResolved++;
      } else {
        const slice = slices.get(node);
        const call = slice ? sdkCallsIn(slice)[0] : undefined;
        if (!call) {
          unresolvedNoSdkCall++;
          unresolvedCommands.push({ command: label, reason: "no client.<resource>.<method> call" });
        } else {
          unresolvedNoDescriptor++;
          unresolvedCommands.push({ command: label, reason: `no v1 descriptor for ${call}` });
        }
      }
    }
  }

  return {
    base,
    nodes,
    leafNodes,
    slices,
    descriptors,
    sdkRoutes,
    routeOf,
    helpByLabel,
    invocationsByLabel,
    unresolvedCommands,
    routesResolved,
    unresolvedNoSdkCall,
    unresolvedNoDescriptor
  };
}

export async function runHelpTruthScan(): Promise<ScanReport> {
  const resolution = await resolveCommandRoutes();
  const {
    base,
    nodes,
    leafNodes,
    slices,
    descriptors,
    sdkRoutes,
    routeOf,
    helpByLabel,
    invocationsByLabel,
    unresolvedCommands,
    routesResolved,
    unresolvedNoSdkCall,
    unresolvedNoDescriptor
  } = resolution;

  const violations: Violation[] = [];
  let examplesChecked = 0;
  let truncated = 0;
  let statedStdinDocuments = 0;
  let stdinBodiesJudged = 0;
  let unstatedStdinBodies = 0;
  let requiredOptionsExamined = 0;
  const pathOperandsJudged = new Map<string, number>();
  const pathOperandsSkipped = new Map<string, number>();

  for (const node of nodes) {
    await yieldToEventLoop();
    const label = node.path.join(" ");
    const help = helpByLabel.get(label) ?? "";
    const routes = routeOf.get(label) ?? [];

    // The population is INVOCATIONS, not lines — {@link resolveCommandRoutes}
    // owns the extraction and the reason, and hands the same list to both the
    // route arm and the rules below, so the two can never judge different sets.
    const invocations = invocationsByLabel.get(label) ?? [];

    // ── R0 — a leaf a caller lands on must show a runnable example and Notes ──
    // This is the TRIPWIRE for R1–R4 as much as a rule of its own: every one of
    // them iterates examples, so a command with none satisfies all four
    // vacuously. A gate whose population can silently become empty is the false
    // green this file exists to prevent, one command at a time.
    // A HIDDEN command is exempt from R0 and from R0 only, because nothing
    // lists one and no reader browses to it. The exemption applies to nothing
    // today — the tree carries no hidden command — and it is kept rather than
    // deleted because the reasoning is about what a reader is SHOWN, which does
    // not change with the population. A hidden command's examples and flags are
    // still judged by R1-R4.
    const hidden = isHiddenCommand(node.cmd);
    if (node.isLeaf && !hidden) {
      if (invocations.length === 0) {
        violations.push({
          command: label,
          rule: "R0-no-example",
          key: "R0-no-example",
          detail: "no `nexus …` invocation in --help, so rules 1-4 cannot see this command"
        });
      }
      if (!help.includes("Notes:")) {
        violations.push({
          command: label,
          rule: "R0-no-notes",
          key: "R0-no-notes",
          detail: "no `Notes:` block in --help"
        });
      }
    }

    // ── R5b — a required option this command never shows in an example ────────
    // ⚠️ THIS RULE CORRECTLY REPORTS ZERO, AND ZERO IS WHY IT NEEDS A COUNTER.
    // R1 already refuses any example that omits a required option, so on a tree
    // where R1 is clean R5b is entailed and finds nothing. "Entailed" and "never
    // executed" produce the identical output, so the gate floors
    // {@link ScanReport.requiredOptionsExamined} instead of reading the zero as
    // evidence. An assertion nobody proved ran is not an assertion.
    if (node.isLeaf && invocations.length > 0) {
      for (const option of node.cmd.options) {
        if (!option.mandatory || !option.long) continue;
        requiredOptionsExamined++;
        const named = invocations.some(
          (i) => i.example.includes(`${option.long} `) || i.example.includes(`${option.long}=`)
        );
        if (!named) {
          violations.push({
            command: label,
            rule: "R5b-required-option-unexampled",
            key: `R5b ${option.long}`,
            detail: `${option.long} is required and appears in none of the ${invocations.length} example(s)`
          });
        }
      }
    }

    // One printed line can hold more than one invocation — a `$(…)` that computes
    // an argument, then the command that uses it — and each is separately
    // runnable, so each is separately judged.
    for (const { example, argv: args, truncated: cut, stdin, substituted } of invocations) {
      if (args.includes("--help") || args.includes("-h")) continue;
      if (cut) truncated++;
      examplesChecked++;
      if (stdin !== undefined) statedStdinDocuments++;

      // ── R1 — commander is the real parser; what it refuses, a reader cannot run
      //
      // A FRESH TREE PER EXAMPLE IS STILL LOAD-BEARING AND IS STILL BUILT.
      // Commander stores parsed option values on the Command objects, so reusing
      // one lets this example's arguments satisfy the next example's required
      // options and turns a real defect green. What is dropped here is only the
      // ORIGIN side table: `parseExample` reads `node.cmd` and `node.path` and
      // never `node.file`/`.line`, so recording a stack frame per command bought
      // nothing on these 1333 trees and cost 87.3% of each build.
      const program = await buildProgram({ recordOrigins: false });
      const outcome = await parseExample(program, args, stdin ?? "");
      if (outcome.kind === "refused") {
        // 🚨 ONE REFUSAL IS NOT A FINDING, AND IT IS THE ONE THIS SCANNER
        // CANNOT SEE THE INPUT OF. `cat batch.json | nexus … --body -` sends a
        // document the help does not print; the scanner supplies an empty
        // stdin, and refusing the example for that is judging bytes nobody
        // wrote. Every other refusal — an unknown flag, a bad enum value, a
        // required field supplied by neither a flag nor the body — is
        // independent of the document and is reported.
        if (stdin === undefined && readsBodyFromStdin(args) && isEmptyBodyRefusal(outcome)) {
          unstatedStdinBodies++;
          continue;
        }
        violations.push({
          command: label,
          rule: "R1-example-refused",
          key: `R1 ${outcome.code} ${firstFlagIn(outcome.message) ?? shortExample(example)}`,
          detail: `${example}\n      -> ${outcome.code}: ${outcome.message}`
        });
        continue; // an example that cannot parse produces no request to check
      }

      if (routes.length === 0) continue; // counted once per command, below
      const flags = flagValuesIn(args);

      /**
       * A finding only when EVERY route this command can reach refuses the
       * value. One command's source often names more than one route — a read
       * before a write, a lookup before a mutation — and a text scan cannot say
       * which one an argument belongs to. Requiring consensus turns that
       * ambiguity into an abstention instead of into a coin flip.
       */
      const agreed = (
        pick: (d: Descriptor) => { code: string; text: string }[]
      ): { code: string; text: string }[] => {
        const first = pick(routes[0]!);
        if (first.length === 0) return [];
        return routes.every((d) => pick(d).length > 0) ? first : [];
      };
      const label2 =
        routes.length === 1
          ? routes[0]!.name
          : `${routes[0]!.name} (+${routes.length - 1} route(s))`;

      // ── R2 — every key in the example's own --body payload ────────────────
      // Every issue kind, not only a format one: a `--body` payload reaches the
      // API verbatim, so a bad enum or a bad type in it is as real as a bad id.
      // This is the arm that catches `{"type":"conditional"}`.
      for (const [flag, raw] of flags) {
        if (!BODY_FLAGS.has(flag)) continue;
        // 🚨 `-` IS THE MARKER, NEVER THE PAYLOAD, AND READING IT AS ONE SKIPPED
        // EXACTLY THE EXAMPLES THIS SCAN WIDENED TO REACH. R1 already parses a
        // piped example with the document it states, so the bytes are here; R2
        // went on `JSON.parse("-")`, threw, and continued — so every stated
        // stdin body passed this rule without a field of it being put to a
        // schema, which is byte-for-byte what a clean one looks like. The
        // document the example states IS what the flag resolves to, so it is
        // what R2 must judge.
        const source = raw === "-" ? stdin : raw;
        if (source === undefined) continue; // a document the example does not state
        let payload: unknown;
        try {
          payload = JSON.parse(source);
        } catch {
          continue; // a .json path, or a --body this command carries as plain text
        }
        if (typeof payload !== "object" || payload === null || Array.isArray(payload)) continue;
        if (raw === "-") stdinBodiesJudged++;
        for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
          for (const issue of agreed((d) => (d.Body ? fieldIssues(d.Body, key, value) : []))) {
            violations.push({
              command: label,
              rule: "R2-body-field-refused",
              key: `R2 body.${key}`,
              detail: `${example}\n      -> ${label2} Body refuses ${issue.text}`
            });
          }
        }
      }

      // ── R3 — an id-shaped flag value the route's own schema refuses ───────
      for (const [flag, raw] of flags) {
        if (BODY_FLAGS.has(flag) || META_FLAGS.has(flag)) continue;
        if (isPlaceholder(raw)) continue;
        const field = camel(flag);
        // The RAW string, never a coerced value. Guessing that `1.15` is a
        // number produced "expected string, received number" on four correct
        // examples; the CLI passes what the shell handed it. A field the schema
        // does not know yields no issue on that path, so an unmapped flag is
        // silent here rather than a false finding.
        for (const issue of agreed((d) =>
          [
            ...(d.Body ? fieldIssues(d.Body, field, raw) : []),
            ...(d.Params ? fieldIssues(d.Params, field, raw) : [])
          ].filter(isIdFormatIssue)
        )) {
          violations.push({
            command: label,
            rule: "R3-flag-id-refused",
            key: `R3 --${flag}=${raw}`,
            detail: `${example}\n      -> ${label2} refuses ${issue.text}`
          });
        }
      }

      // ── R4 — a literal id in a path slot the route demands a format for ───
      // Judged against the command the example SELECTED, never the help block it
      // sits in: a Notes block legitimately shows a sibling's invocation
      // ("read the ids first: nexus role responsibilities …"), and attributing
      // that to the owning command validated it against the wrong route.
      if (outcome.selected !== undefined && outcome.selected !== label) continue;
      for (let i = 0; i < outcome.operands.length; i++) {
        const supplied = outcome.operands[i]!;

        // Does any resolved route actually CONSTRAIN this slot? Computed before
        // either skip, because it is what separates "R4 asked and the answer was
        // fine" from "R4 never asked" — and those two produce the identical
        // silence. `pathOperandsJudged` counts the first; `pathOperandsSkipped`
        // counts the second, per namespace.
        const constrained = routes.some((d) => {
          const vars = pathVarsOf(d);
          return d.PathVars !== undefined && vars.length === outcome.operands.length;
        });
        const namespace = node.path[0] ?? label;

        // An argument the CLI resolves client-side declares itself:
        // `.argument("<role>", "Role name or UUID")`. The route still wants a
        // UUID, and the help is still correct, because a lookup runs first.
        const resolvedClientSide = /\bname or\b/i.test(outcome.argumentDescriptions[i] ?? "");

        // A token an upstream `xargs` REWRITES before the command runs:
        // `… | xargs -I{} nexus prompt-assistant delete-thread {} --yes` sends
        // the id the previous stage printed, never the literal `{}`. Exempt on
        // the same ground as a `name or` argument — the example is runnable and
        // this token is not what reaches the route — and NOT through
        // `isPlaceholder`, which would hand it to R6 and report the shell's own
        // syntax as a placeholder the reader cannot run.
        const rewrittenByShell = substituted !== undefined && supplied === substituted;

        if (isPlaceholder(supplied) || resolvedClientSide || rewrittenByShell) {
          if (constrained) bump(pathOperandsSkipped, namespace);

          // ── R6 — a placeholder standing in a slot whose FORMAT is fixed ────
          // The reader cannot run `nexus x get <thing-id>` any more than they can
          // run `nexus x get thing-123`: the shell eats the angle brackets and
          // the route refuses the literal. R4 skipped both, so a namespace could
          // be certified clean having had every path id it ships waved through.
          // A `name or` argument is EXEMPT here as it is in R4 — a client-side
          // lookup means the human-readable form is genuinely correct — and so
          // is an `xargs` replacement, which the shell has already rewritten by
          // the time the route sees anything.
          if (!resolvedClientSide && !rewrittenByShell) {
            for (const issue of agreed((d) => {
              const vars = pathVarsOf(d);
              if (!d.PathVars || vars.length !== outcome.operands.length) return [];
              return fieldIssues(d.PathVars, vars[i]!, supplied).filter(isIdFormatIssue);
            })) {
              violations.push({
                command: label,
                rule: "R6-path-placeholder-unrunnable",
                key: `R6 arg${i}=${supplied}`,
                detail:
                  `${example}\n      -> ${label2} PathVars refuses ${issue.text}\n` +
                  `      the slot's format is fixed, so this placeholder is not runnable either`
              });
            }
          }
          continue;
        }

        if (constrained) bump(pathOperandsJudged, namespace);
        for (const issue of agreed((d) => {
          const vars = pathVarsOf(d);
          if (!d.PathVars || vars.length !== outcome.operands.length) return [];
          return fieldIssues(d.PathVars, vars[i]!, supplied).filter(isIdFormatIssue);
        })) {
          violations.push({
            command: label,
            rule: "R4-path-id-refused",
            key: `R4 arg${i}=${supplied}`,
            detail: `${example}\n      -> ${label2} PathVars refuses ${issue.text}`
          });
        }
      }
    }

    // The blind spots are counted in {@link resolveCommandRoutes}, which decides
    // them from `invocations` and `routeOf` alone — neither of which any rule
    // below can move.
  }

  // ── why each BLIND namespace is blind ────────────────────────────────────────
  // Computed here rather than in the gate, because it needs the source slices and
  // the descriptor index the scan already holds. The gate only prints it.
  const namespaceBlindness = new Map<string, NamespaceBlindness>();
  const namespacesSeen = new Set<string>();
  for (const node of leafNodes) namespacesSeen.add(node.path[0] ?? "");

  // Counted over EVERY leaf, not only the blind ones, so the floor stays a
  // property of the detector rather than of whichever namespaces are blind today.
  let transportRoutesResolved = 0;
  for (const node of leafNodes) {
    const slice = slices.get(node);
    if (slice === undefined) continue;
    for (const route of transportCallsIn(slice)) {
      if (descriptorFor(descriptors, route) !== undefined) transportRoutesResolved++;
    }
  }

  for (const namespace of namespacesSeen) {
    if (namespace === "") continue;
    if ((pathOperandsJudged.get(namespace) ?? 0) > 0) continue;
    if ((pathOperandsSkipped.get(namespace) ?? 0) > 0) continue;

    const own = leafNodes.filter((n) => (n.path[0] ?? "") === namespace);
    const reasons = unresolvedCommands
      .filter((u) => (u.command.split(" ")[0] ?? "") === namespace)
      .map((u) => u.reason);

    // An SDK call naming a route the contract does not declare is the only cause
    // that a new descriptor fixes, so it wins over everything else.
    if (reasons.some((r) => r !== "no client.<resource>.<method> call")) {
      namespaceBlindness.set(namespace, "NO-DESCRIPTOR");
      continue;
    }

    // Does any command reach a v1 route WITHOUT the SDK? Resolving the raw
    // transport path against the same index the SDK arm uses is what separates
    // "the contract is there and we walked around it" from "there is no contract".
    const bypasses = own.some((node) => {
      const slice = slices.get(node);
      if (slice === undefined) return false;
      return transportCallsIn(slice).some(
        (route) => descriptorFor(descriptors, route) !== undefined
      );
    });
    if (bypasses) {
      namespaceBlindness.set(namespace, "SDK-BYPASS");
      continue;
    }

    // A namespace is MIXED more often than not: `docs` is a leaf that reaches
    // nothing sitting beside `docs search`, which resolves a route perfectly well.
    // Classifying on "did any command fail to resolve" labelled the whole
    // namespace by its least informative member and called that NO-ROUTE, which
    // is wrong in the direction that hides a real contract.
    //
    // So the question is whether ANY command here reaches a v1 route. If one
    // does, a contract exists and the reason nothing was checked is that the
    // route carries no id — UNREACHED. Only a namespace where nothing resolves
    // at all is genuinely routeless.
    const resolvesSomething = own.some((node) => routeOf.has(node.path.join(" ")));
    namespaceBlindness.set(namespace, resolvesSomething ? "UNREACHED" : "NO-ROUTE");
  }

  return {
    violations: dedupe(violations),
    nodeCount: nodes.length,
    leafCount: leafNodes.length,
    examplesChecked,
    truncated,
    statedStdinDocuments,
    stdinBodiesJudged,
    unstatedStdinBodies,
    routesResolved,
    routesUnresolved: unresolvedNoSdkCall + unresolvedNoDescriptor,
    unresolvedNoSdkCall,
    unresolvedNoDescriptor,
    unresolvedCommands,
    leaves: [...new Set(leafNodes.map((n) => n.path.join(" ")))].sort(),
    globalOptionCount: base.options.length,
    registrarCount: await registrarCount(),
    descriptorCount: descriptors.size,
    sdkRouteCount: sdkRoutes.size,
    locatedNodes: nodes.filter((n) => n.file !== undefined).length,
    requiredOptionsExamined,
    pathOperandsJudged: Object.fromEntries(pathOperandsJudged),
    pathOperandsSkipped: Object.fromEntries(pathOperandsSkipped),
    namespaceBlindness: Object.fromEntries(namespaceBlindness),
    transportRoutesResolved
  };
}

/** One counter per namespace, created on first use. */
function bump(counter: Map<string, number>, namespace: string): void {
  counter.set(namespace, (counter.get(namespace) ?? 0) + 1);
}

/**
 * Two examples on one command can break identically; the ledger wants one row.
 *
 * 🚨 THE SEPARATOR IS WRITTEN AS A BACKSLASH-u ESCAPE AND MUST STAY AN ESCAPE. It used to be a
 * RAW NUL byte, which is the same code unit at runtime and a different FILE:
 * `file(1)` reported this source as `data` rather than text, `grep` classified
 * it as binary, and a `grep` wrapper that suppresses binary matches then printed
 * NOTHING for every pattern — including controls like `the` and `export`. A
 * silent empty result on the gate's own source, with no error and no exit code
 * to notice. Pasting a literal NUL back in restores that.
 */
function dedupe(list: readonly Violation[]): Violation[] {
  const seen = new Set<string>();
  const out: Violation[] = [];
  for (const v of list) {
    const id = `${v.command}\u0000${v.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(v);
  }
  return out;
}

/** `--first-name` out of commander's own refusal, so the key names the cause. */
function firstFlagIn(message: string): string | undefined {
  return /(--[a-z][a-z0-9-]*)/.exec(message)?.[1];
}

/** A short, stable stand-in when the refusal names no flag (argument arity). */
function shortExample(example: string): string {
  return example.replace(/^\$\s*nexus\s*/, "").slice(0, 48);
}

/** Re-exported so the gate can assert the two derivations agree. */
export { deriveCommandLeaves };
