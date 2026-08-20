// Every `!` below is guaranteed by the construct above it — a capture group the
// pattern always produces, or an index bounded by the `for` that produced it. A
// widening `?? ""` would report a violation against the empty string instead of
// crashing on an impossible index, which is the false finding this gate exists
// to avoid. `help-truth-rules.ts` carries the same disable for the same reason.
/* eslint-disable @typescript-eslint/no-non-null-assertion -- see the note above */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ALL_SCOPES } from "@nexus/types/public-api-v1";

import {
  buildProgram,
  camel,
  type Descriptor,
  descriptorFor,
  descriptorIndex,
  helpOf,
  sdkCallsIn,
  sdkRouteIndex,
  sourceSlices,
  type TreeNode,
  walkTree
} from "./help-truth-scan";

/**
 * THREE CLAIMS IN A `--help` THAT A MACHINE CAN SETTLE, AND NOTHING ELSE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS AND WHAT IT DELIBERATELY CANNOT DO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `help-truth-rules.ts` polices whether an EXAMPLE can be run: does commander
 * accept it, does the route's schema accept the ids and body keys in it. It
 * never reads a sentence. So a `Notes:` block is free to describe behaviour the
 * code does not have, and one did: `tracks create` stated that a new track
 * *"does not appear in `nexus tracks ready` as work until it has tasks"*, while
 * `findReadyTracks` tests status, archival and dependency edges and asks nothing
 * about tasks. `Track.status` defaults to `PLANNED`, so a freshly created track
 * is in the ready set, empty. Somebody read the help, created two probe tracks,
 * watched them sit in `tracks ready`, and filed a bug against working code.
 *
 * 🔴 THE GENERAL CLASS — "does this English sentence match this code" — IS NOT
 * MECHANICALLY DECIDABLE, AND THIS FILE DOES NOT CLAIM TO CHECK IT. Naming this
 * gate after the class it cannot cover would be worse than not writing it: a
 * reviewer who believes the prose is gated stops reading the prose. What follows
 * is the subset where a sentence names a referent a machine can resolve, and the
 * list is exhaustive.
 *
 *   1. A `nexus …` INVOCATION QUOTED IN PROSE names a command that is
 *      registered. Oracle: the live commander tree, names and aliases. TOTAL —
 *      no judgement, no route needed.
 *   2. AN OPTION DESCRIPTION STATING A BOUND OR A DEFAULT agrees with the route
 *      contract's own schema for the field that option fills. Oracle: the
 *      shipped Zod schema, probed by parsing values through it. Reaches only as
 *      far as the route resolves, and only in ONE direction — see below.
 *   3. `Needs the "<scope>" scope.` names the scope the route actually demands.
 *      Oracle: the `@PublicAPI("<scope>")` decorator in the backend's own v1
 *      controllers — a file this package does not own and did not write.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE BLIND SPOTS, NAMED RATHER THAN LEFT TO BE DISCOVERED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * - Rule 1 reads ONE LINE AT A TIME. A citation whose words wrap across two
 *   prose lines is not seen. Joining lines first is what produced the phantom
 *   `nexus command uses` out of `Usage: nexus mcp call …` followed by a
 *   paragraph starting `command uses` — a violation against text nobody wrote.
 *   A missed citation is an abstention; an invented one is a gate that gets
 *   switched off.
 * - Rule 2 IS ONE-DIRECTIONAL: it fires when the help promises MORE than the
 *   route accepts, never when the route is looser than the help says. A schema
 *   that does not bound the field at all is an ABSTENTION, counted in
 *   {@link ClaimReport.boundsAbstained} — and that is correct rather than lazy.
 *   `tracks create --current-step` states 400 characters and
 *   `CreateTrackBodySchema` carries no `.max()` ON PURPOSE, because the CHECK
 *   constraint counts characters and Zod counts UTF-16 code units; a rule that
 *   demanded agreement there would refuse a deliberate, documented decision.
 * - Rule 2 CANNOT CHECK A CHARACTER CLASS. `1-64 chars of [a-z0-9-]` looks
 *   checkable and is not: `TrackSlugSchema` is `/^[a-z0-9][a-z0-9-]{0,63}$/`, so
 *   a slug may not START with a hyphen, and a probe built from the stated class
 *   would report that correct regex as a defect. The descriptions were corrected
 *   by hand instead, and a positional rule stays a reader's job.
 * - Rule 3's oracle is a REGEX OVER BACKEND SOURCE, so a refactor that changes
 *   how those controllers are written empties the index rather than reddening
 *   it. {@link ClaimReport.backendRoutesIndexed} is the floor that catches that,
 *   and the gate asserts a known route resolves to a known scope AND that a
 *   route which cannot exist resolves to nothing.
 * - Rule 2's DEFAULT arm barely reaches a request BODY, and the reason is
 *   structural rather than a gap to close. It reads a default by parsing `{}`,
 *   which any schema carrying another required field refuses — so the arm is
 *   live on all-optional query schemas and abstains on almost every `Body`. See
 *   {@link defaultFor}.
 * - Nothing here reads the SERVER. A help sentence that is honest about a
 *   product that is broken is out of reach of anything static, exactly as
 *   `help-truth-rules.ts` says of its own seven.
 */

export interface ClaimViolation {
  /** `tracks task claim` — the command path a caller types. */
  readonly command: string;
  readonly rule: ClaimRuleId;
  /** Stable identity: the rule plus the thing that broke. Never a line number. */
  readonly key: string;
  /** `<file>:<line>` of the offending text, resolved inside the command's slice. */
  readonly where: string;
  readonly detail: string;
}

export type ClaimRuleId =
  | "C1-command-citation-unresolved"
  | "C2-bound-overstated"
  | "C2-default-wrong"
  | "C3-scope-unknown"
  | "C3-scope-mismatch";

export interface ClaimReport {
  readonly violations: readonly ClaimViolation[];
  /**
   * `nexus …` citations rule 1 actually resolved.
   *
   * ⚠️ A FLOOR, NOT A RESULT. Rule 1 is clean today, and a clean rule and a rule
   * whose population silently became empty produce the identical empty violation
   * list. Narrowing the citation pattern — anchoring it, requiring quotes,
   * dropping the alias arm — costs coverage that nothing else would report.
   */
  readonly citationsChecked: number;
  /** Option descriptions rule 2 put to a schema and got a decisive answer from. */
  readonly boundsJudged: number;
  /** Bounds seen but not judged, with the reason, so an abstention is not a pass. */
  readonly boundsAbstained: readonly string[];
  /** Scope claims joined to a backend route and compared. */
  readonly scopeClaimsJudged: number;
  /** Scope claims whose route did not resolve, with the reason. */
  readonly scopeClaimsAbstained: readonly string[];
  /** Routes the backend controller scan indexed. The floor for rule 3's oracle. */
  readonly backendRoutesIndexed: number;
  readonly backendControllersRead: number;
  /** Commands the tree walk saw. Guards against a collapsed population. */
  readonly leafCount: number;
  readonly nodeCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ORACLE FOR RULE 3 — the backend's own v1 controllers
// ─────────────────────────────────────────────────────────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** `apps/backend/src/public/v1` — read as TEXT, exactly as the SDK scan is. */
export const BACKEND_V1_SRC = path.resolve(HERE, "../../../../apps/backend/src/public/v1");

/**
 * `METHOD /public/v1/<path>` → the scope its `@PublicAPI` decorator demands.
 *
 * The key is the CONTRACT path, so it joins directly against a
 * {@link Descriptor}'s own `method` and `path` with no normalisation step to get
 * wrong.
 *
 * ⚠️ A DECORATOR IS ONLY READ WHEN NO OTHER ROUTE DECORATOR SITS BETWEEN IT AND
 * ITS VERB. `@PublicAPI()` with no argument admits no API key and declares no
 * scope, and it is deliberately not indexed: a handler with no scope is not a
 * handler whose scope is the empty string.
 */
export function backendScopeIndex(): { index: Map<string, string>; controllers: number } {
  const index = new Map<string, string>();
  let controllers = 0;
  for (const entry of readdirSync(BACKEND_V1_SRC, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".controller.ts")) continue;
    controllers++;
    const text = readFileSync(path.join(BACKEND_V1_SRC, entry.name), "utf8");
    const base = /@Controller\(\s*["'`]([^"'`]*)["'`]\s*\)/.exec(text)?.[1];
    if (base === undefined) continue;
    const routes =
      /@PublicAPI\(\s*["'`]([^"'`]+)["'`][^)]*\)([\s\S]{0,400}?)@(Get|Post|Put|Patch|Delete)\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g;
    for (const m of text.matchAll(routes)) {
      const [, scope, between, verb, sub] = m;
      // Another verb between the decorator and this one means they belong to
      // different handlers and this pairing is an artefact of the window size.
      if (/@(Get|Post|Put|Patch|Delete)\(/.test(between ?? "")) continue;
      const full = `/${[base, sub ?? ""].filter((s) => s !== "").join("/")}`.replace(/\/+/g, "/");
      index.set(`${verb!.toUpperCase()} ${full}`, scope!);
    }
  }
  return { index, controllers };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ORACLE FOR RULE 1 — the live command tree
// ─────────────────────────────────────────────────────────────────────────────

interface TrieNode {
  readonly children: Map<string, TrieNode>;
}

/**
 * Every command name AND every alias, as a trie.
 *
 * 🚨 THE ALIASES ARE LOAD-BEARING. `skills update`'s own help says
 * `"nexus skills install" IS AN ALIAS OF THIS COMMAND`, which is true and which
 * a name-only trie reports as a citation of a command that does not exist. A
 * gate that reds on a sentence explaining an alias is a gate somebody deletes.
 */
export function commandTrie(nodes: readonly TreeNode[]): TrieNode {
  const root: TrieNode = { children: new Map() };
  for (const n of nodes) {
    let cur = root;
    for (let i = 0; i < n.path.length; i++) {
      const seg = n.path[i]!;
      let next = cur.children.get(seg);
      if (!next) {
        next = { children: new Map() };
        cur.children.set(seg, next);
      }
      if (i === n.path.length - 1)
        for (const alias of n.cmd.aliases()) cur.children.set(alias, next);
      cur = next;
    }
  }
  return root;
}

/**
 * `nexus` followed by at least one command-shaped word, on ONE line.
 *
 * The lookbehind is what stops `claude-code-skills-nexus repository` matching:
 * `\bnexus` is true after a hyphen, so the repository name in `claude-code
 * install`'s help read as a citation of a command called `repository`. The
 * separator is spaces and tabs rather than `\s`, for the wrapped-line reason in
 * this file's header.
 */
const CITATION = /(?<![\w/.-])nexus[ \t]+((?:[a-z][a-z0-9-]*)(?:[ \t]+[a-z][a-z0-9-]*)*)/g;

// ─────────────────────────────────────────────────────────────────────────────
// THE ORACLE FOR RULE 2 — the shipped Zod schema, probed rather than introspected
// ─────────────────────────────────────────────────────────────────────────────

interface Parses {
  safeParse(value: unknown): { success: boolean; data?: unknown };
}

/**
 * Does this schema accept `value` in `key`?
 *
 * TRUE when the schema raised no issue AT THIS KEY — never "the whole object
 * parsed". A route's Body usually has other required fields, so a whole-object
 * verdict answers a question about the fixture rather than about the value.
 */
function accepts(schema: Parses, key: string, value: unknown): boolean {
  const result = schema.safeParse({ [key]: value });
  if (result.success) return true;
  const issues =
    (result as { error?: { issues?: { path: (string | number)[] }[] } }).error?.issues ?? [];
  return !issues.some((i) => i.path[0] === key);
}

/**
 * The value the schema fills in for `key` when nothing is supplied.
 *
 * ⚠️ `undefined` HERE MEANS "NO ANSWER", NEVER "NO DEFAULT", AND THE CALLER
 * ABSTAINS ON IT. A schema with any other REQUIRED field refuses `{}` outright,
 * so this returns `undefined` for every field of such a schema whether or not it
 * declares a default — which in practice means the default arm reaches query
 * schemas (`Params`, all-optional) and almost never a `Body`. Reporting the
 * abstention is what keeps that a known limit rather than a silent pass.
 */
function defaultFor(schema: Parses, key: string): unknown {
  const result = schema.safeParse({});
  return result.success ? (result.data as Record<string, unknown> | undefined)?.[key] : undefined;
}

/**
 * A schema KNOWS a field when it refuses a value nothing could ever satisfy.
 *
 * A schema that does not declare the key ignores whatever is put there, so the
 * symbol is accepted and the schema is correctly not treated as the authority
 * for it. Without this, a command reaching two routes would be judged against
 * whichever one happened to be first.
 */
function knowsField(schema: Parses, key: string): boolean {
  return !accepts(schema, key, Symbol("a value no schema accepts"));
}

/**
 * A numeric range that is a STATED BOUND rather than part of an example.
 *
 * 🚨 THE DELIMITERS ARE THE WHOLE RULE. Without them this matched `4-6` inside
 * `claude-sonnet-4-6`, `3-70` inside `llama-3-70b` and `2026-03` inside an ISO
 * date, and reported 16 violations against 16 correct descriptions — a control
 * that fires on everything certifies nothing.
 */
const RANGE = /(?<![\w.-])(\d+)[ \t]*[-–][ \t]*(\d+)(?![\w.-])/;
/** Is the range a LENGTH in characters, or a value? The description says which. */
const LENGTH_UNIT = /\bchars?\b|\bcharacters?\b/i;
const STATED_DEFAULT = /\bdefault:?[ \t]*(\d+)/i;
/** `[a-z0-9-]` — read only to pick a representative character, never as a rule. */
const STATED_CLASS = /\[([A-Za-z0-9._-]+)\]/;

function representativeChar(description: string): string {
  const stated = STATED_CLASS.exec(description)?.[1];
  if (stated === undefined) return "a";
  if (stated.includes("a-z")) return "a";
  if (stated.includes("A-Z")) return "A";
  return "0";
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SCAN
// ─────────────────────────────────────────────────────────────────────────────

/** Hand the event loop back — the birpc reason `help-truth-rules.ts` records. */
const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

export async function runHelpClaimScan(): Promise<ClaimReport> {
  const base = buildProgram();
  const nodes = walkTree(base);
  const slices = sourceSlices(nodes);
  const descriptors = descriptorIndex();
  const sdkRoutes = sdkRouteIndex();
  const trie = commandTrie(nodes);
  const { index: scopeOfRoute, controllers } = backendScopeIndex();
  const knownScopes = new Set<string>(ALL_SCOPES);

  const violations: ClaimViolation[] = [];
  const boundsAbstained: string[] = [];
  const scopeClaimsAbstained: string[] = [];
  let citationsChecked = 0;
  let boundsJudged = 0;
  let scopeClaimsJudged = 0;

  for (const node of nodes) {
    await yieldToEventLoop();
    const label = node.path.join(" ");
    const help = helpOf(node.cmd);
    const slice = slices.get(node);
    const at = (needle: string): string => locate(node, slice, needle);

    // ── C1 — a `nexus …` citation in prose names a real command ──────────────
    // Prose only. An example line is already R1's population, and commander is a
    // stricter oracle there than a trie walk could be.
    const prose = help
      .split("\n")
      .filter((line) => !line.trim().startsWith("$ "))
      .join("\n");
    for (const match of prose.matchAll(CITATION)) {
      const tokens = match[1]!.split(/[ \t]+/);
      citationsChecked++;
      let cursor = trie;
      let taken = 0;
      while (taken < tokens.length) {
        const next = cursor.children.get(tokens[taken]!);
        if (!next) break;
        cursor = next;
        taken++;
      }
      if (taken === 0) {
        violations.push({
          command: label,
          rule: "C1-command-citation-unresolved",
          key: `C1 ${tokens[0]}`,
          where: at(`nexus ${tokens[0]}`),
          detail: `the help cites "nexus ${tokens[0]} …" and no command named "${tokens[0]}" is registered`
        });
        continue;
      }
      // Stopping on a command-shaped word while the command we reached still has
      // children means the next word was meant to be a subcommand and is not one.
      // Stopping at a LEAF is ordinary — the next word is an argument.
      if (taken < tokens.length && cursor.children.size > 0) {
        // The resolved path plus the one word that failed — the shortest string
        // that shows a reader both what was found and where it stopped.
        const cited = `nexus ${tokens.slice(0, taken + 1).join(" ")}`;
        violations.push({
          command: label,
          rule: "C1-command-citation-unresolved",
          key: `C1 ${tokens.slice(0, taken + 1).join(" ")}`,
          where: at(cited),
          detail: `the help cites "${cited}" and "${tokens.slice(0, taken).join(" ")}" registers no subcommand "${tokens[taken]}"`
        });
      }
    }

    if (!node.isLeaf) continue;

    // ── the route this command reaches, resolved exactly as R2-R4 resolve it ──
    const routes: Descriptor[] = [];
    if (slice !== undefined) {
      for (const call of sdkCallsIn(slice)) {
        const sent = sdkRoutes.get(call);
        const descriptor = sent ? descriptorFor(descriptors, sent) : undefined;
        if (descriptor && !routes.some((d) => d.name === descriptor.name)) routes.push(descriptor);
      }
    }

    // ── C3 — the scope this help promises is the scope the route demands ──────
    for (const match of help.matchAll(/Needs the "([^"]+)" scope/g)) {
      const claimed = match[1]!;
      const where = at(`Needs the "${claimed}" scope`);
      if (!knownScopes.has(claimed)) {
        violations.push({
          command: label,
          rule: "C3-scope-unknown",
          key: `C3 unknown ${claimed}`,
          where,
          detail: `"${claimed}" is not a member of ALL_SCOPES, so no API key can ever carry it`
        });
        continue;
      }
      const demanded = routes
        .map((d) => ({
          route: `${d.method.toUpperCase()} ${d.path}`,
          scope: scopeOfRoute.get(`${d.method.toUpperCase()} ${d.path}`)
        }))
        .filter((r) => r.scope !== undefined);
      if (demanded.length === 0) {
        scopeClaimsAbstained.push(
          `${label} claims "${claimed}" — ${routes.length === 0 ? "no v1 route resolved" : "no @PublicAPI scope indexed for its route"}`
        );
        continue;
      }
      scopeClaimsJudged++;
      const wrong = demanded.filter((r) => r.scope !== claimed);
      // A command reaching several routes legitimately needs several scopes; the
      // finding is a claim that matches NONE of them.
      if (wrong.length === demanded.length) {
        violations.push({
          command: label,
          rule: "C3-scope-mismatch",
          key: `C3 ${claimed}`,
          where,
          detail: `the help promises "${claimed}"; ${demanded.map((r) => `${r.route} demands "${r.scope}"`).join(", ")}`
        });
      }
    }

    // ── C2 — a stated bound or default agrees with the route's own schema ─────
    if (routes.length === 0) continue;
    for (const option of node.cmd.options) {
      if (!option.long) continue;
      const description = option.description ?? "";
      const range = RANGE.exec(description);
      const stated = STATED_DEFAULT.exec(description);
      if (!range && !stated) continue;

      const field = camel(option.long.replace(/^--/, ""));
      const schemas = routes
        .flatMap((d) => [d.Body, d.Params])
        .filter((s): s is NonNullable<typeof s> => s !== undefined)
        .map((s) => s as unknown as Parses);
      const target = schemas.find((s) => knowsField(s, field));
      const where = at(description);
      if (!target) {
        boundsAbstained.push(
          `${label} ${option.long} — no route schema declares "${field}": ${description}`
        );
        continue;
      }

      if (range) {
        const low = Number(range[1]);
        const high = Number(range[2]);
        const isLength = LENGTH_UNIT.test(description);
        const sample = representativeChar(description);
        const value = (n: number): unknown => (isLength ? sample.repeat(n) : n);
        const lowOk = accepts(target, field, value(low));
        const highOk = accepts(target, field, value(high));
        const overOk = accepts(target, field, value(high + 1));
        if (!lowOk || !highOk) {
          boundsJudged++;
          violations.push({
            command: label,
            rule: "C2-bound-overstated",
            key: `C2 ${option.long} ${low}-${high}`,
            where,
            detail:
              `${option.long} offers ${low}-${high}; the route's schema refuses ` +
              `${!lowOk ? String(low) : ""}${!lowOk && !highOk ? " and " : ""}${!highOk ? String(high) : ""}`
          });
        } else if (overOk) {
          // The schema does not cap where the help says it does. Deliberate more
          // often than not — see this file's header on `--current-step`.
          boundsAbstained.push(
            `${label} ${option.long} — the schema does not bound "${field}" at ${high}: ${description}`
          );
        } else {
          boundsJudged++;
        }
      }

      if (stated) {
        const claimed = Number(stated[1]);
        const actual = defaultFor(target, field);
        if (actual === undefined) {
          boundsAbstained.push(
            `${label} ${option.long} — the schema declares no default for "${field}": ${description}`
          );
        } else {
          boundsJudged++;
          if (actual !== claimed) {
            violations.push({
              command: label,
              rule: "C2-default-wrong",
              key: `C2 ${option.long} default`,
              where,
              detail: `${option.long} states a default of ${claimed}; the route's schema fills in ${String(actual)}`
            });
          }
        }
      }
    }
  }

  return {
    violations,
    citationsChecked,
    boundsJudged,
    boundsAbstained,
    scopeClaimsJudged,
    scopeClaimsAbstained,
    backendRoutesIndexed: scopeOfRoute.size,
    backendControllersRead: controllers,
    leafCount: nodes.filter((n) => n.isLeaf).length,
    nodeCount: nodes.length
  };
}

/**
 * `<file>:<line>` of `needle` inside the command's own source slice.
 *
 * The line is where the offending TEXT is declared, not where the command is
 * registered, because the text is what has to change. Falls back to the
 * registration line when the needle is not in the slice — a help string built
 * from a variable, or prose commander generated — and says so, rather than
 * pointing confidently at a line that does not carry it.
 */
function locate(node: TreeNode, slice: string | undefined, needle: string): string {
  const file = node.file ?? "<unlocated>";
  const short = file.includes("/packages/") ? file.slice(file.indexOf("/packages/") + 1) : file;
  if (slice === undefined || node.line === undefined) return `${short}:?`;
  const at = slice.indexOf(needle);
  if (at === -1)
    return `${short}:${node.line} (registration; the text is built rather than literal)`;
  return `${short}:${node.line + slice.slice(0, at).split("\n").length - 1}`;
}
