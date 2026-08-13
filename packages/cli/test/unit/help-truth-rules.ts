// Every `!` below follows an explicit bounds or length check on the line above
// it (`vars.length !== operands.length`, `routes.length === 0`, a `for` bounded
// by `.length`). A widening `?? ""` would report a violation against the empty
// string instead of crashing on an impossible index.
/* eslint-disable @typescript-eslint/no-non-null-assertion -- see the note above */
import { deriveCommandLeaves } from "../../src/command-universe";
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
  isIdFormatIssue,
  isPlaceholder,
  parseExample,
  pathVarsOf,
  registrarCount,
  sdkCallsIn,
  sdkRouteIndex,
  sourceSlices,
  tokenize,
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
  | "R5b-required-option-unexampled";

export interface ScanReport {
  readonly violations: readonly Violation[];
  readonly nodeCount: number;
  readonly leafCount: number;
  readonly examplesChecked: number;
  readonly truncated: number;
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
}

/** Flags that carry a request body rather than a single field value. */
const BODY_FLAGS = new Set(["body", "data"]);
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

export async function runHelpTruthScan(): Promise<ScanReport> {
  const base = await buildProgram();
  const nodes = walkTree(base);
  const leafNodes = nodes.filter((n) => n.isLeaf);
  const slices = sourceSlices(nodes);
  const descriptors = descriptorIndex();
  const sdkRoutes = sdkRouteIndex();

  const violations: Violation[] = [];
  const unresolvedCommands: { command: string; reason: string }[] = [];
  let examplesChecked = 0;
  let truncated = 0;
  let routesResolved = 0;
  let unresolvedNoSdkCall = 0;
  let unresolvedNoDescriptor = 0;
  let requiredOptionsExamined = 0;

  // Resolve each node's route ONCE — the slice and the SDK scan do not vary per
  // example, and re-resolving per example would make the arm 1000x its cost.
  const routeOf = new Map<string, Descriptor[]>();
  for (const node of nodes) {
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

  for (const node of nodes) {
    const label = node.path.join(" ");
    const help = helpOf(node.cmd);
    const examples = examplesIn(help);
    const routes = routeOf.get(label) ?? [];

    // ── R0 — a leaf a caller lands on must show a runnable example and Notes ──
    // This is the TRIPWIRE for R1–R4 as much as a rule of its own: every one of
    // them iterates examples, so a command with none satisfies all four
    // vacuously. A gate whose population can silently become empty is the false
    // green this file exists to prevent, one command at a time.
    // A HIDDEN command is exempt from R0 and from R0 only. `upgrade` registers
    // 18 hidden aliases (`up`, `bump`, `install`, …); nothing lists them, no
    // reader browses to one, and demanding 18 copies of the same Notes block is
    // how a rule earns its own deletion. Their examples and flags are still
    // judged by R1-R4 — the exemption is about what a reader is shown, not about
    // whether the command is covered.
    const hidden = (node.cmd as unknown as { _hidden?: boolean })._hidden === true;
    if (node.isLeaf && !hidden) {
      if (examples.length === 0) {
        violations.push({
          command: label,
          rule: "R0-no-example",
          key: "R0-no-example",
          detail: "no `$ nexus …` example in --help, so rules 1-4 cannot see this command"
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
    if (node.isLeaf && examples.length > 0) {
      for (const option of node.cmd.options) {
        if (!option.mandatory || !option.long) continue;
        requiredOptionsExamined++;
        const named = examples.some(
          (e) => e.includes(`${option.long} `) || e.includes(`${option.long}=`)
        );
        if (!named) {
          violations.push({
            command: label,
            rule: "R5b-required-option-unexampled",
            key: `R5b ${option.long}`,
            detail: `${option.long} is required and appears in none of the ${examples.length} example(s)`
          });
        }
      }
    }

    for (const example of examples) {
      const { argv, truncated: cut } = tokenize(example);
      if (argv[0] !== "nexus") continue;
      const args = argv.slice(1);
      if (args.includes("--help") || args.includes("-h")) continue;
      if (cut) truncated++;
      examplesChecked++;

      // ── R1 — commander is the real parser; what it refuses, a reader cannot run
      const program = await buildProgram();
      const outcome = await parseExample(program, args);
      if (outcome.kind === "refused") {
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
        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          continue; // a `-` stdin marker or a .json path, not an inline body
        }
        if (typeof payload !== "object" || payload === null || Array.isArray(payload)) continue;
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
        if (isPlaceholder(supplied)) continue;
        // An argument the CLI resolves client-side declares itself:
        // `.argument("<role>", "Role name or UUID")`. The route still wants a
        // UUID, and the help is still correct, because a lookup runs first.
        if (/\bname or\b/i.test(outcome.argumentDescriptions[i] ?? "")) continue;
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

    // ── the blind spots, counted rather than skipped ──────────────────────────
    if (examples.length > 0) {
      if (routes.length > 0) {
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
    violations: dedupe(violations),
    nodeCount: nodes.length,
    leafCount: leafNodes.length,
    examplesChecked,
    truncated,
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
    requiredOptionsExamined
  };
}

/** Two examples on one command can break identically; the ledger wants one row. */
function dedupe(list: readonly Violation[]): Violation[] {
  const seen = new Set<string>();
  const out: Violation[] = [];
  for (const v of list) {
    const id = `${v.command} ${v.key}`;
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
