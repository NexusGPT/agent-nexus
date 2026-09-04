// Every `!` below follows an explicit bounds or length check on the line above
// it, or a regex match already tested for null. `noUncheckedIndexedAccess` types
// the read as possibly undefined regardless, so the alternative is a widening
// `?? ""` that turns an impossible index into a SILENTLY EMPTY value — the exact
// false green this scanner exists to prevent, one layer down. An out-of-range
// index here is a programming error the runner must surface.
/* eslint-disable @typescript-eslint/no-non-null-assertion -- see the note above */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { ZPublicApiV1 } from "@nexus/types/public-api-v1";
import { Command, CommanderError } from "commander";

import { discoverRootRegistrars } from "../../src/command-universe";
import { isJsonMode, setJsonMode } from "../../src/output";
import { buildRootProgram } from "../../src/root-program";
import { resetResolvedBodies } from "../../src/util/body";

/**
 * THE SCANNER BEHIND THE `--help` TRUTH GATE. Population first, predicate second.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT IT IS FOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `--help` is this CLI's contract, so every sentence in it can be WRONG, and the
 * expensive kind of wrong is an EXAMPLE: a reader copies it, the CLI or the API
 * refuses it, and the help that was meant to make the command usable first time
 * is what broke the attempt. An empirical audit of 674 shipped claims found 75
 * contradicted by observed behaviour. This scanner is the STATIC half of that
 * audit, re-run on every commit, over every namespace.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ONE POPULATION, TWO GATES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The tree is the REAL root program, from `src/root-program.ts` — the same object
 * `index.ts` parses with, program-level options included. A second walk beside it
 * would be a second thing to drift, so `help-truth.test.ts` asserts this
 * scanner's leaf set equals `command-universe`'s `deriveCommandLeaves()` exactly.
 * Two consumers, one population, and a disagreement is a RED rather than silence.
 *
 * Reading the REAL root matters beyond tidiness. An earlier version rebuilt the
 * tree from the namespace registrars and recovered the global options by scraping
 * `index.ts` for `.option("…")`. That reached the namespaces and could never
 * reach the program-level options — and a command-level option colliding with a
 * global (`custom-model --base-url`) never receives its value, because the root
 * consumes it across the whole of argv first. A tree without the globals is blind
 * to that entire class. The scrape also failed exactly as predicted: `index.ts`
 * was refactored mid-run and the anchor stopped matching.
 *
 * ⚠️ THE POPULATION MUST REFUSE, NOT DEGRADE. Every assertion over an empty tree
 * is VACUOUSLY TRUE — a gate reporting a clean pass over nothing. So every
 * discovery here throws on an empty result rather than returning one, and the
 * gate re-floors all of it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE CONTRACT ARM IS STATIC — AND WHY IT MUST BE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The obvious way to learn which route an example hits is to RUN it against a
 * stubbed transport. That was built, and it is unshippable: `auth login` blocks
 * on `readline` against stdin, `auth` and `channel` shell out to `xdg-open`, and
 * `upgrade` — plus 18 HIDDEN aliases of it — calls `execSync` on a global npm
 * install. A test that executes arbitrary command actions installs packages and
 * hangs. Measured: the run wedged on the second command it reached.
 *
 * So the route is resolved by reading source, through two hops that both carry a
 * literal and are both floored:
 *
 *   1. Each `Command` is tied to the FILE AND LINE that created it, by wrapping
 *      `Command.prototype.command` and reading the stack — exact, and it needs no
 *      assumption that source order matches registration order.
 *   2. Its source slice names SDK calls, `client.<resource>.<method>(…)`, and the
 *      SDK's own resource files carry the verb and path as literals
 *      (`this.http.request("POST", "/folders")`). That pair keys the Public API
 *      v1 descriptor, which owns the Body, Params and PathVars schemas.
 *
 * A command whose route does not resolve is COUNTED and reported, never skipped —
 * it is the honest measure of how far this arm can see.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** `packages/cli/src`, resolved from this file rather than from `process.cwd()`. */
export const CLI_SRC = path.resolve(HERE, "../../src");
/** `packages/sdk/src` — the resource files that carry the verb and path. */
export const SDK_SRC = path.resolve(HERE, "../../../sdk/src");

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE POPULATION
// ─────────────────────────────────────────────────────────────────────────────

/** `Command` → `<absolute file>|<line>` of the `.command()` call that made it. */
const ORIGIN = new WeakMap<Command, string>();
let originInstalled = false;

/**
 * Tie every command commander creates to the source line that created it.
 *
 * Wrapping the prototype rather than matching source order: a file declares a
 * group and then its children, but nothing enforces that, and an ordering
 * assumption fails SILENTLY by attributing one command's source to another. The
 * stack frame is exact or absent, and absent is reported.
 */
/**
 * Whether the recorder below actually captures a stack, or just gets out of the way.
 *
 * 🚨 THIS FLAG IS THE WHOLE COST OF THE HELP SCAN. `new Error().stack` is captured
 * once per `.command()` call, so a tree of 643 commands pays 643 stack captures —
 * **26.14ms of a 29.95ms build, 87.3%** (measured 2026-08-31, 40 builds a side).
 * `runHelpTruthScan` builds one tree it reads origins from and then 1333 throwaway
 * trees it does not, so the throwaway ones were paying for a side table nothing
 * ever read.
 *
 * DEFAULTS TO ON, and that direction is deliberate: a caller that forgets to say
 * anything gets the recording behaviour, and only a call site proved not to read
 * `TreeNode.file`/`.line` opts out. The failure of a wrong opt-out is then a
 * missing origin — loud, because {@link sourceSlices} silently drops a node with
 * no file and the scan's own `locatedNodes` floor would fall.
 */
let recordingOrigins = true;

export function installOriginRecorder(): void {
  if (originInstalled) return;
  originInstalled = true;
  const real = Command.prototype.command;
  (Command.prototype as unknown as { command: unknown }).command = function (
    this: Command,
    ...args: unknown[]
  ) {
    const created = (real as (...a: unknown[]) => Command).apply(this, args);
    if (!recordingOrigins) return created;
    const frame = (new Error().stack ?? "")
      .split("\n")
      .slice(2)
      .find((l) => l.includes(`${path.sep}commands${path.sep}`));
    if (frame) {
      // The parenthesised form FIRST, and as its own regex. As one alternation
      // the bare `at <file>:<line>` branch matches earlier in the string and
      // swallows the function name into the path — which produced a file called
      // `registerAccessCardCommands (/…/access-card.ts` that still LOOKED right
      // once the directory prefix was trimmed for display.
      const m =
        /\(([^()]*?):(\d+):\d+\)\s*$/.exec(frame) ?? /\bat\s+([^\s()]*?):(\d+):\d+\s*$/.exec(frame);
      if (m?.[1] && m[2]) ORIGIN.set(created, `${m[1]}|${m[2]}`);
    }
    return created;
  };
}

/**
 * The real root program, freshly built.
 *
 * Fresh on every call, because commander stores parsed option values on the
 * `Command` objects themselves — one shared tree would let one example's
 * arguments satisfy the next example's required options and turn a real defect
 * green.
 */
export function buildProgram(options: { recordOrigins?: boolean } = {}): Command {
  installOriginRecorder();
  // Saved and restored rather than set-then-forced-true, so a nested build cannot
  // strand the flag off and silently unlocate every later tree.
  const previous = recordingOrigins;
  recordingOrigins = options.recordOrigins ?? true;
  try {
    const program = buildRootProgram();
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    if (program.commands.length === 0) {
      throw new Error("buildRootProgram() registered no commands — the population is empty");
    }
    return program;
  } finally {
    recordingOrigins = previous;
  }
}

/**
 * Does this tree carry command origins? For the CONTROL that says
 * `recordOrigins: false` actually did something — an optimisation that is
 * secretly a no-op is indistinguishable from one that works, if you only time it.
 */
export function originCount(root: Command): number {
  return walkTree(root).filter((n) => n.file !== undefined).length;
}

/**
 * How many root registrars `command-universe` discovers — for the CONTROL that
 * compares the two derivations. Memoised: that function re-reads the directory
 * and re-`import()`s every module on each call.
 */
let cachedRegistrars: Awaited<ReturnType<typeof discoverRootRegistrars>> | undefined;
export async function registrarCount(): Promise<number> {
  cachedRegistrars ??= await discoverRootRegistrars();
  return cachedRegistrars.length;
}

export interface TreeNode {
  /** `["workflow", "node", "create"]` — what a caller types after `nexus`. */
  readonly path: readonly string[];
  readonly cmd: Command;
  /** A command with no subcommands of its own: where a caller lands. */
  readonly isLeaf: boolean;
  /** Absolute path of the module that registered it, when the stack named one. */
  readonly file?: string;
  /** 1-based line of the `.command()` call. */
  readonly line?: number;
}

/** Every command under the root, depth-first. Commander's own `help` excluded. */
export function walkTree(root: Command): TreeNode[] {
  const out: TreeNode[] = [];
  const visit = (cmd: Command, prefix: readonly string[]): void => {
    for (const sub of cmd.commands) {
      if (sub.name() === "help") continue;
      const p = [...prefix, sub.name()];
      const children = sub.commands.filter((c) => c.name() !== "help");
      const origin = ORIGIN.get(sub)?.split("|");
      out.push({
        path: p,
        cmd: sub,
        isLeaf: children.length === 0,
        file: origin?.[0],
        line: origin ? Number(origin[1]) : undefined
      });
      visit(sub, p);
    }
  };
  visit(root, []);
  return out;
}

/**
 * The source text belonging to one command: from its own `.command()` line to the
 * next command registered in the same FILE, or the end of it.
 *
 * A group's slice therefore stops at its first child, which is what makes an SDK
 * call found inside it belong to the group rather than to a subcommand.
 */
export function sourceSlices(nodes: readonly TreeNode[]): Map<TreeNode, string> {
  const byFile = new Map<string, TreeNode[]>();
  for (const n of nodes) {
    if (!n.file || !n.line) continue;
    const list = byFile.get(n.file) ?? [];
    list.push(n);
    byFile.set(n.file, list);
  }
  const out = new Map<TreeNode, string>();
  for (const [file, list] of byFile) {
    const lines = readFileSync(file, "utf8").split("\n");
    const sorted = [...list].sort((a, b) => a.line! - b.line!);
    for (let i = 0; i < sorted.length; i++) {
      const from = sorted[i]!.line! - 1;
      const to = i + 1 < sorted.length ? sorted[i + 1]!.line! - 1 : lines.length;
      out.set(sorted[i]!, lines.slice(from, to).join("\n"));
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. READING THE HELP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The bytes a caller reads from `--help`.
 *
 * `outputHelp()`, never `helpInformation()`. Every `Examples:` and `Notes:` block
 * in this CLI is an `addHelpText("after", …)` hook, and commander appends those
 * on the OUTPUT path only. A gate reading `helpInformation()` sees the generated
 * usage and options and NONE of the prose it claims to police — green by
 * construction, which is the exact false green this whole file is against.
 */
export function helpOf(cmd: Command): string {
  let captured = "";
  cmd.configureOutput({
    writeOut: (s: string) => {
      captured += s;
    },
    writeErr: (s: string) => {
      captured += s;
    }
  });
  cmd.outputHelp();
  return captured;
}

/**
 * Every `$ …` example in a help block, with wrapped lines rejoined.
 *
 * A long example is written across two lines with a trailing backslash, exactly
 * as it would be typed. Reading the first line alone yields a truncated command
 * that fails to parse — 4 false findings on the first run of this scanner, every
 * one a continuation no reader would ever have hit.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE PREFIX RULE USED TO BE `$ nexus `, AND IT EXCLUDED THE HARDEST EXAMPLES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus` is not always the first word of the line a reader copies. It sits
 * downstream of a pipe (`cat prompt.md | nexus agent create … --prompt -`) and
 * inside a command substitution (`eval "$(nexus auth switch work --session)"`).
 * Requiring the line to START with it dropped 22 printed invocations, measured
 * 2026-08-15 — and the exclusion was not random. TWELVE of the 22 were the
 * `-`-stdin forms (`--body -`, `--prompt -`, `--content -`, `--input -`,
 * `--file -`, `--message -`), because a document piped into a command is written
 * with the pipe on the same line. Those are exactly the examples a reader copies
 * rather than reads — the body shape is the hard part — and R1 could not see one
 * of them.
 *
 * NEX-3714 is the class: `task create`'s body example was reported unrunnable,
 * and the FIRST example on that command
 * (`$ cat task-prompt.md | nexus task create …`) was outside every rule here.
 *
 * So the population is now "a shell line that invokes `nexus`", and
 * {@link invocationsIn} does the extraction. A line that names no `nexus`
 * COMMAND — `$ rm ~/nexus/support-docs/notes/probe.md` names a path — yields no
 * invocation and is not one.
 */
export function examplesIn(help: string): string[] {
  const lines = help.split("\n").map((l) => l.trim());
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;
    if (!line.startsWith("$ ")) continue;
    while (line.endsWith("\\") && i + 1 < lines.length) {
      line = `${line.slice(0, -1).trim()} ${lines[++i]!}`;
    }
    out.push(line);
  }
  return [...new Set(out)];
}

/** One `nexus …` invocation lifted out of the shell line that prints it. */
export interface Invocation {
  /** Everything after the `nexus` token — what commander is handed. */
  readonly argv: string[];
  /** A `#`, `;`, `&&` or ` >` cut the tail of this invocation short. */
  readonly truncated: boolean;
  /**
   * What an upstream stage puts on this command's stdin, when the example says
   * so. `echo '<doc>' | nexus …` states it exactly; `cat file.json | nexus …`
   * does not, and `undefined` is that difference rather than an empty document.
   */
  readonly stdin?: string;
  /**
   * The token an upstream `xargs` REWRITES before this command ever runs — `{}`
   * under `xargs -I{}`. Whatever the previous stage printed goes there, so the
   * token itself never reaches the CLI and no format rule may judge it.
   */
  readonly substituted?: string;
}

/** Split on `|` that is not inside quotes. Quotes are KEPT for re-tokenising. */
function pipelineStages(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (const ch of line) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "|") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * The inside of every `$( … )`, so a substituted invocation is still one.
 *
 * `cfg=$(nexus agent-tool get … --json | jq -c '.config')` and
 * `eval "$(nexus auth switch work --session)"` both run a real command that a
 * reader will hit, and in both the `nexus` token is buried in a word rather than
 * standing alone — so neither is found by looking at argv positions.
 */
function substitutions(line: string): { inner: string[]; masked: string } {
  const inner: string[] = [];
  let masked = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== "$" || line[i + 1] !== "(") {
      masked += line[i];
      continue;
    }
    let depth = 1;
    let j = i + 2;
    for (; j < line.length && depth > 0; j++) {
      if (line[j] === "(") depth++;
      else if (line[j] === ")") depth--;
    }
    if (depth > 0) {
      masked += line[i]; // unbalanced: not a substitution, leave it alone
      continue;
    }
    inner.push(line.slice(i + 2, j - 1));
    // 🚨 THE OUTER LINE KEEPS ONE TOKEN WHERE THE SUBSTITUTION WAS, because a
    // shell hands the outer command ONE argument here however many words the
    // inner one spans. `--name $(nexus x get 1)` unquoted otherwise tokenises
    // into four, and the outer command is then refused for excess arguments —
    // a defect in the scanner reported as a defect in the help.
    masked += "$SUBSTITUTION";
    i = j - 1;
  }
  return { inner, masked };
}

/** The document an upstream `echo '<doc>'` stage puts on stdin, if it is one. */
function echoedDocument(stage: string): string | undefined {
  const { argv } = tokenize(stage);
  if (argv[0] !== "echo") return undefined;
  const words = argv.slice(1).filter((w) => w !== "-n" && w !== "-e");
  return words.length > 0 ? words.join(" ") : undefined;
}

/**
 * The token `xargs` will REPLACE with each line it reads, if this stage is one.
 *
 * `… | xargs -n1 -I{} nexus prompt-assistant delete-thread {} --yes` is a
 * genuinely runnable line whose `{}` is never sent: xargs rewrites it per input
 * line, so the id the route receives is whatever the previous stage printed.
 * Judging `{}` against the slot's UUID format reports the SCANNER'S reading of a
 * shell feature as a defect in the help — the same class as the unquoted `$( … )`
 * masking above, and it arrived the same way, from a printed example that only
 * became visible once the population widened.
 *
 * Both spellings every xargs accepts: `-I<repl>` and `-I <repl>`, plus `-i` and
 * GNU's `--replace`, whose replacement defaults to `{}`.
 */
function xargsReplacement(argv: readonly string[]): string | undefined {
  if (argv[0] !== "xargs") return undefined;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith("-I") && token.length > 2) return token.slice(2);
    if (token === "-I") return argv[i + 1];
    if (token.startsWith("--replace=")) return token.slice("--replace=".length);
    if (token === "-i" || token === "--replace") return "{}";
  }
  return undefined;
}

/**
 * Every `nexus …` invocation a printed example contains.
 *
 * A shell line can hold more than one — `cfg=$(nexus agent-tool get …)` on one
 * line, the command that uses `$cfg` on the next — and each is separately
 * runnable, so each is separately checked.
 *
 * A stage counts as an invocation when one of its TOKENS is exactly `nexus`.
 * Substring matching would promote `rm ~/nexus/support-docs/…` into a command
 * and then report the refusal of a path as a help defect.
 */
export function invocationsIn(example: string): Invocation[] {
  const line = example.replace(/^\$\s*/, "");
  const { inner, masked } = substitutions(line);
  const out: Invocation[] = [];
  for (const candidate of [masked, ...inner]) {
    const stages = pipelineStages(candidate);
    for (let i = 0; i < stages.length; i++) {
      const { argv, truncated } = tokenize(stages[i]!);
      const at = argv.indexOf("nexus");
      if (at === -1) continue;
      out.push({
        argv: argv.slice(at + 1),
        // A pipe AFTER the invocation (`… --json | jq`) cut its tail; a pipe
        // BEFORE it did not, and the old tokenizer reported the second as a
        // truncation because it counted pipes rather than position.
        truncated: truncated || i < stages.length - 1,
        stdin: i > 0 ? echoedDocument(stages[i - 1]!) : undefined,
        // Read from the xargs prefix ONLY, never from the invocation's own
        // flags: `nexus … -I x` is this CLI's argument, not the shell's.
        substituted: xargsReplacement(argv.slice(0, at))
      });
    }
  }
  return out;
}

/**
 * Split an example the way a shell would, so the tokens are what commander gets.
 *
 * ⚠️ `<` and `>` are NOT redirects here. `--baseline <run-uuid>` is this CLI's
 * placeholder convention and appears in hundreds of examples; treating `>` as a
 * redirect truncated 6 of them mid-flag and produced 6 false "required option not
 * specified" findings on the first run. A real redirect in this corpus is always
 * written ` > file`, so the cut requires whitespace BEFORE the operator.
 */
export function tokenize(command: string): { argv: string[]; truncated: boolean } {
  const line = command.replace(/^\$\s*/, "");
  const argv: string[] = [];
  let cur = "";
  let started = false;
  let quote: '"' | "'" | null = null;
  let truncated = false;

  const flush = (): void => {
    if (started) argv.push(cur);
    cur = "";
    started = false;
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      else {
        cur += ch;
        started = true;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (ch === "\\" && i + 1 < line.length) {
      cur += line[++i];
      started = true;
      continue;
    }
    if (ch === "#" || ch === "|" || ch === ";" || (ch === "&" && line[i + 1] === "&")) {
      truncated = true;
      break;
    }
    if (ch === ">" && (i === 0 || /\s/.test(line[i - 1]!))) {
      truncated = true;
      break;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    cur += ch;
    started = true;
  }
  flush();
  return { argv, truncated };
}

/**
 * A token no reader would paste verbatim, so no format rule may judge it.
 *
 * Three shapes, all measured in the shipped help: the `<agent-uuid>` convention;
 * an ELIDED id, written `4444...` because the full UUID would not fit the line (5
 * false findings before this arm existed); and the literal `null`, which several
 * commands document as the sentinel that moves a thing to the root.
 */
export function isPlaceholder(token: string): boolean {
  if (token === "" || token === "null") return true;
  if (/^<.*>$/.test(token)) return true;
  return token.includes("...") || token.includes("…");
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. THE ROUTE, AND THE CONTRACT BEHIND IT
// ─────────────────────────────────────────────────────────────────────────────

interface ZodLike {
  safeParse(value: unknown): { success: boolean; error?: unknown };
}

export interface Descriptor {
  readonly name: string;
  readonly method: string;
  readonly path: string;
  readonly Body?: ZodLike;
  readonly Params?: ZodLike;
  readonly PathVars?: ZodLike;
}

/** The Public API v1 descriptors, keyed `METHOD <contract path>`. */
export function descriptorIndex(): Map<string, Descriptor> {
  const index = new Map<string, Descriptor>();
  for (const [name, value] of Object.entries(
    ZPublicApiV1 as Record<string, Omit<Descriptor, "name">>
  )) {
    if (typeof value?.method !== "string" || typeof value?.path !== "string") continue;
    index.set(`${value.method.toUpperCase()} ${value.path}`, { ...value, name });
  }
  if (index.size === 0) throw new Error("ZPublicApiV1 yielded no descriptors");
  return index;
}

/**
 * `client.<property>.<method>` → the verb and path the SDK sends.
 *
 * Two literal scans over `packages/sdk/src`: `client.ts` maps the property to its
 * resource class, and each `resources/*.ts` maps a method to the
 * `this.http.request*("VERB", "…/path")` pair inside it. Both are the shape the
 * SDK's own `v1-routes-have-an-sdk-method.test.ts` already relies on, so this
 * fails CLOSED with it — a refactor that assembles paths from fragments turns
 * routes UNRESOLVED here and red there, rather than quietly wrong in either.
 */
export function sdkRouteIndex(): Map<string, { method: string; path: string }> {
  const clientText = readFileSync(path.join(SDK_SRC, "client.ts"), "utf8");
  const classOf = new Map<string, string>();
  for (const [, prop, cls] of clientText.matchAll(
    /this\.([A-Za-z][\w]*)\s*=\s*new\s+([A-Za-z][\w]*Resource)\s*\(/g
  )) {
    classOf.set(prop!, cls!);
  }
  if (classOf.size === 0) throw new Error("no `this.x = new XResource(` assignments in client.ts");

  const routes = new Map<string, Map<string, { method: string; path: string }>>();
  const dir = path.join(SDK_SRC, "resources");
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const text = readFileSync(path.join(dir, file), "utf8");
    for (const [cls, bodyText] of classBodies(text)) {
      const methods = routes.get(cls) ?? new Map<string, { method: string; path: string }>();
      for (const [name, from, to] of methodRanges(bodyText)) {
        // The WHOLE template, `${…}` slots included. Cutting at the first `$`
        // left `/folders/` for `/folders/${folderId}`, and the prefix fallback
        // that needed then resolved `deployment embed-config-update` onto
        // `DeploymentUpdate` — a descriptor for a different route, whose schema
        // then judged the example. A wrong descriptor is worse than none.
        const call =
          /this\.http\.request\w*(?:<[\s\S]*?>)?\s*\(\s*"([A-Z]+)"\s*,\s*[`"]([^`"]*)[`"]/.exec(
            bodyText.slice(from, to)
          );
        if (!call) continue;
        methods.set(name, { method: call[1]!, path: call[2]! });
      }
      routes.set(cls, methods);
    }
  }

  // A resource can own SUB-RESOURCES, and they are not declared in `client.ts`.
  // `this.versions = new VersionsResource(http)` lives inside
  // `resources/agents.ts`, so the `client.ts` pass above cannot see it and
  // `client.agents.versions.list` resolves to nothing. Four namespaces read as
  // contract-blind for exactly this reason while their descriptors existed.
  const nestedOf = new Map<string, Map<string, string>>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const text = readFileSync(path.join(dir, file), "utf8");
    for (const [cls, bodyText] of classBodies(text)) {
      const subs = nestedOf.get(cls) ?? new Map<string, string>();
      for (const [, prop, sub] of bodyText.matchAll(
        /this\.([A-Za-z][\w]*)\s*=\s*new\s+([A-Za-z][\w]*Resource)\s*\(/g
      )) {
        subs.set(prop!, sub!);
      }
      nestedOf.set(cls, subs);
    }
  }

  const out = new Map<string, { method: string; path: string }>();
  for (const [prop, cls] of classOf) {
    for (const [name, route] of routes.get(cls) ?? []) out.set(`${prop}.${name}`, route);
    for (const [subProp, subCls] of nestedOf.get(cls) ?? []) {
      for (const [name, route] of routes.get(subCls) ?? [])
        out.set(`${prop}.${subProp}.${name}`, route);
    }
  }
  if (out.size === 0) throw new Error("the SDK route scan resolved no `client.x.y` calls");
  return out;
}

/** `class XResource … { … }` bodies, brace-matched rather than regex-terminated. */
function* classBodies(text: string): Generator<[string, string]> {
  for (const m of text.matchAll(/class\s+([A-Za-z][\w]*Resource)\b[^{]*\{/g)) {
    const open = m.index! + m[0].length - 1;
    let depth = 0;
    let end = text.length;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    yield [m[1]!, text.slice(open + 1, end)];
  }
}

/** `async name(…)` / `name(…)` members of a class body, and where each ends. */
function* methodRanges(body: string): Generator<[string, number, number]> {
  const starts: { name: string; at: number }[] = [];
  for (const m of body.matchAll(
    /^\s{2}(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([a-z][\w]*)\s*(?:<[^>]*>)?\s*\(/gm
  )) {
    starts.push({ name: m[1]!, at: m.index! });
  }
  for (let i = 0; i < starts.length; i++) {
    yield [starts[i]!.name, starts[i]!.at, i + 1 < starts.length ? starts[i + 1]!.at : body.length];
  }
}

/**
 * `HttpClient` sends to `${baseUrl}/api/public/v1${path}`, and the contract
 * declares `/public/v1/…`. One prefix separates the two, written once.
 */
const CONTRACT_PREFIX = "/public/v1";

/**
 * The descriptor for one SDK route, matched SEGMENT BY SEGMENT.
 *
 * The SDK writes `/folders/${folderId}` and the contract writes
 * `/public/v1/folders/:folderId`, so the two agree exactly once a `${…}` slot and
 * a `:var` are both read as "one variable segment". EXACT, deliberately: an
 * earlier prefix-tolerant version matched three commands onto a sibling route's
 * descriptor and judged their examples against the wrong schema.
 *
 * ⚠️ A SEGMENT CAN CARRY A TRAILING INTERPOLATION THAT IS NOT PART OF THE PATH.
 * `skills.ts` sends `` `/tools/${id}/initiate-client-credentials${query}` ``, so
 * the last segment reads `initiate-client-credentials${query}` — not a variable
 * (it does not START with `${`) and not equal to the contract's literal either.
 * The match failed and the command was reported as having NO DESCRIPTOR, when
 * `/public/v1/tools/:toolId/initiate-client-credentials` had existed all along.
 * {@link pathLiteral} takes the part before the first `${`, which is the real
 * segment. A segment that IS a slot is untouched, so `${id}${query}` still reads
 * as one variable and still matches a `:var`.
 */
export function descriptorFor(
  index: Map<string, Descriptor>,
  route: { method: string; path: string }
): Descriptor | undefined {
  const want = `${CONTRACT_PREFIX}${route.path}`.replace(/\/$/, "").split("/");
  for (const d of index.values()) {
    if (d.method !== route.method) continue;
    const got = d.path.replace(/\/$/, "").split("/");
    if (got.length !== want.length) continue;
    let ok = true;
    for (let i = 0; i < want.length && ok; i++) {
      const w = want[i]!;
      const g = got[i]!;
      const wVar = w.startsWith("${") || w.startsWith(":");
      const gVar = g.startsWith(":");
      ok = wVar || gVar ? wVar && gVar : pathLiteral(w) === g;
    }
    if (ok) return d;
  }
  return undefined;
}

/**
 * The literal part of a path segment, dropping a trailing `${…}` interpolation.
 *
 * Only reached for a segment that is NOT itself a slot, so this cannot turn a
 * variable into a literal — `descriptorFor` has already decided that above.
 */
function pathLiteral(segment: string): string {
  const at = segment.indexOf("${");
  return at === -1 ? segment : segment.slice(0, at);
}

/**
 * EVERY `client.<prop>.<method>(` a command's own source slice performs.
 *
 * All of them, not the first: `agent delete` reads the agent before deleting it,
 * so the first call is `agents.get` and a gate keyed on it reports a DELETE
 * example against a GET descriptor. The rules take the CONSENSUS of the set and
 * abstain when it disagrees, which is the only answer a text scan has earned.
 */
export function sdkCallsIn(slice: string): string[] {
  return [
    ...new Set(
      [
        ...slice.matchAll(/\bclient\.([A-Za-z][\w]*)\.([A-Za-z][\w]*)(?:\.([A-Za-z][\w]*))?\s*\(/g)
      ].map((m) => (m[3] ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}`))
    )
  ];
}

/**
 * EVERY raw transport call a command's own source slice performs, in the two
 * spellings the CLI actually uses.
 *
 * This is the DELIBERATE COMPLEMENT to {@link sdkCallsIn}: it finds the commands
 * that reach the API without going through an SDK resource at all. Both spellings
 * are real and neither is a hypothetical —
 *
 *   http().request("DELETE", `/agents/${id}`)             // positional
 *   { method: "GET", path: "/api/vibe/cluster" }          // object literal
 *
 * — and the DIFFERENCE between them is the whole reason this exists. A route
 * found here that RESOLVES to a v1 descriptor means the contract is present and
 * the CLI is bypassing its own SDK, which is fixable. A route that resolves to
 * nothing means the command talks to a surface the v1 contract does not describe,
 * which is correct and permanent. Without this function both look identical to
 * `sdkCallsIn` — it finds no `client.x.y(` either way — and a namespace with a
 * fully specified contract reads exactly like one with no API at all.
 */
export function transportCallsIn(slice: string): { method: string; path: string }[] {
  const out: { method: string; path: string }[] = [];
  const seen = new Set<string>();
  const push = (method: string, path: string): void => {
    const key = `${method} ${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ method, path });
  };

  for (const m of slice.matchAll(
    /\.request\w*(?:<[\s\S]*?>)?\s*\(\s*"([A-Z]+)"\s*,\s*[`"]([^`"]*)[`"]/g
  )) {
    push(m[1]!, m[2]!);
  }
  // The object form names its two keys in either order, so both are matched
  // rather than assuming the one this codebase happens to write today.
  for (const m of slice.matchAll(/method:\s*"([A-Z]+)"\s*,\s*path:\s*[`"]([^`"]*)[`"]/g)) {
    push(m[1]!, m[2]!);
  }
  for (const m of slice.matchAll(/path:\s*[`"]([^`"]*)[`"]\s*,\s*method:\s*"([A-Z]+)"/g)) {
    push(m[2]!, m[1]!);
  }
  return out;
}

/** The `:pathVar` names a descriptor path declares, in order. */
export function pathVarsOf(descriptor: Descriptor): string[] {
  return descriptor.path
    .split("/")
    .filter((s) => s.startsWith(":"))
    .map((s) => s.slice(1));
}

/**
 * Validate ONE field against a schema and report only that field's issues.
 *
 * Never the whole object: a command builds its body from `--body` MERGED with its
 * own flags, so a payload missing a field the flag supplies is correct and a
 * whole-object `safeParse` would call it a defect. Filtering to the key under
 * test asks the only question the help can answer — is THIS value, spelled THIS
 * way, one the route accepts.
 */
export function fieldIssues(
  schema: ZodLike,
  key: string,
  value: unknown
): { code: string; text: string }[] {
  const result = schema.safeParse({ [key]: value });
  if (result.success) return [];
  const error = result.error as {
    issues?: { path: (string | number)[]; code?: string; message: string }[];
  };
  return (error.issues ?? [])
    .filter((i) => i.path[0] === key)
    .map((i) => ({ code: i.code ?? "unknown", text: `${i.path.join(".")}: ${i.message}` }));
}

/**
 * Is this issue about the SHAPE OF AN IDENTIFIER — a UUID the route demands?
 *
 * The discriminator matters because the two sides of an example are not equally
 * readable. A key inside `--body '{…}'` reaches the API untouched, so ANY refusal
 * of it is a true finding. A FLAG value does not: this CLI splits `--labels a,b`
 * into an array, parses `--metadata k=v` into a record, expands
 * `--time-period 7d` into `last_7_days`, and reads `--parent-id null` as the root
 * sentinel. Judging a raw flag against the field's full schema therefore fires on
 * CORRECT help — 8 measured false findings in 55 before this narrowing.
 *
 * An id has no such transform anywhere in this CLI, so the format arm is the part
 * of a flag that can be judged from the outside. That is why the ENUM arm of the
 * brief's rule 3 is NOT shipped for flags: it is not statically decidable here,
 * and a gate that cries wolf is switched off within the day.
 */
export function isIdFormatIssue(issue: { code: string; text: string }): boolean {
  return issue.code === "invalid_format" || /\buuid\b/i.test(issue.text);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PARSING ONE EXAMPLE
// ─────────────────────────────────────────────────────────────────────────────

export type ParseOutcome =
  | {
      readonly kind: "ok";
      readonly operands: string[];
      /** The command the example SELECTED — not the help block it was found in. */
      readonly selected?: string;
      /** That command's own `<arg>` descriptions, in order. */
      readonly argumentDescriptions: string[];
    }
  | { readonly kind: "refused"; readonly code: string; readonly message: string };

/**
 * Parse one example against a freshly built tree, with every action replaced.
 *
 * EVERY command's action, not only each leaf's: `nexus docs` has a real action
 * AND subcommands, and on the first run of this scanner it executed and fetched
 * the live documentation site into the test output.
 *
 * The replacement action is also how the positional OPERANDS are recovered.
 * Commander hands an action `(arg1, …, argN, options, command)`, so the leading
 * arguments are exactly what the caller typed in the `<id>` slots — which is what
 * rule 4 needs and what no amount of re-tokenising can reliably rebuild.
 *
 * ── STDIN IS SUPPLIED, NOT INHERITED ─────────────────────────────────────────
 *
 * Replacing the actions stops the CLI's own `-` readers, but NOT the one above
 * them: `applyBodySatisfiesRequired` resolves `--body` in a pre-action hook, so a
 * `--body -` example on a command with required flags reads standard input while
 * commander is still deciding whether to run at all. Inheriting the runner's
 * stdin there is a hang — an fd that never emits `end` leaves that promise
 * unsettled with the process still held open by the test runner — and a gate
 * that hangs is a gate somebody switches off.
 *
 * So every parse gets its own stdin: the document the example states it pipes
 * in, or an empty one that has ALREADY ENDED. Nothing here reads the caller's
 * terminal, and the verdict for an example that states its document is the
 * verdict a reader would get.
 *
 * The `--body` memo is cleared for the same reason. It is keyed on the raw flag
 * value, and the raw value for every piped body in the package is the identical
 * `"-"` — so without the reset the first document read answers for all of them.
 */
export async function parseExample(
  program: Command,
  args: string[],
  stdin = ""
): Promise<ParseOutcome> {
  let operands: string[] = [];
  let selected: Command | undefined;
  const pathOf = new Map<Command, string>();
  for (const node of walkTree(program)) {
    pathOf.set(node.cmd, node.path.join(" "));
    node.cmd.exitOverride();
    node.cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    node.cmd.action((...handed: unknown[]) => {
      selected = handed[handed.length - 1] as Command;
      operands = handed.slice(0, Math.max(0, handed.length - 2)).flatMap((a) => {
        if (typeof a === "string") return [a];
        if (Array.isArray(a)) return a.filter((x): x is string => typeof x === "string");
        return [];
      });
    });
  }

  // The root's `preAction` hook resolves a profile and prints a context banner
  // straight to stdout, past commander's own output hooks. Muting is about the
  // TEST OUTPUT and never about the verdict: that hook already swallows a missing
  // profile in its own try/catch, and nothing here reads what it printed.
  const stdout = process.stdout.write.bind(process.stdout);
  const stderr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (() => true) as never;
  process.stderr.write = (() => true) as never;
  const realStdin = Object.getOwnPropertyDescriptor(process, "stdin");
  Object.defineProperty(process, "stdin", {
    value: Readable.from([Buffer.from(stdin, "utf-8")]),
    configurable: true
  });

  /**
   * JSON MODE IS PROCESS-GLOBAL AND STICKY, SO IT IS THE ONE PIECE OF STATE THIS
   * FUNCTION USED TO FLIP AND NOT PUT BACK.
   *
   * The wrapped `parse`/`parseAsync` call `setJsonMode(true)` whenever the argv
   * asks for `--json`, and `setJsonMode` writes a module-level flag in
   * `src/output.ts` — not per-program state. So the FIRST example carrying
   * `--json` armed it for the rest of the scan, with two consequences:
   *
   *   1. Every later `helpOf()` then rendered through the JSON contract's
   *      `outputHelp` wrapper, which emitted `{"help":{…,"text":""}}` to stdout
   *      — 638 documents per run, on this tree. The text is EMPTY because
   *      `helpOf` installs its own `writeOut` to capture the render, so the
   *      contract's `helpCapture` never sees a byte. Nothing reads those
   *      documents; they are pure noise, and vitest ships every one of them to
   *      the main process over the same birpc channel it reports results on.
   *   2. Worse, every later `parseExample` ran with JSON mode armed by an
   *      unrelated example. A rule verdict that depended on the mode would have
   *      been decided by example ORDER.
   *
   * `json-contract-is-total.test.ts` already restores it in its own `finally`
   * for exactly this reason. Saving and restoring rather than forcing `false`
   * keeps a caller that deliberately armed the mode working.
   */
  const realJsonMode = isJsonMode();
  resetResolvedBodies();
  let refusal: ParseOutcome | undefined;
  try {
    await program.parseAsync(args, { from: "user" });
  } catch (err) {
    const e = err as CommanderError;
    if (e?.code !== "commander.helpDisplayed" && e?.code !== "commander.version") {
      refusal = {
        kind: "refused",
        code: e?.code ?? "threw",
        message: (e?.message ?? String(err)).replace(/^error:\s*/, "")
      };
    }
  } finally {
    process.stdout.write = stdout as never;
    process.stderr.write = stderr as never;
    // The descriptor is an own accessor on `process` in every supported node, so
    // the else-branch is unreachable today. Deleting rather than leaving the
    // stub installed is the only cleanup that cannot outlive this call: a stub
    // that survives is read by every later parse AND by the runner itself.
    if (realStdin) Object.defineProperty(process, "stdin", realStdin);
    else delete (process as unknown as { stdin?: unknown }).stdin;
    setJsonMode(realJsonMode);
    resetResolvedBodies();
  }
  if (refusal) return refusal;

  const registered =
    (selected as unknown as { registeredArguments?: { description?: string }[] } | undefined)
      ?.registeredArguments ?? [];
  return {
    kind: "ok",
    operands,
    selected: selected ? pathOf.get(selected) : undefined,
    argumentDescriptions: registered.map((a) => a.description ?? "")
  };
}

/** The `--flag value` pairs an example passes, long names only, `--` stripped. */
export function flagValuesIn(argv: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq > 0) {
      out.set(token.slice(2, eq), token.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) out.set(token.slice(2), next);
  }
  return out;
}

/** `--parent-id` → `parentId`, the spelling every body field uses. */
export function camel(flag: string): string {
  return flag.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
