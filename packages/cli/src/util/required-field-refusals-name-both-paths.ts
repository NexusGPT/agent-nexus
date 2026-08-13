import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A REFUSAL FROM A BODY-TAKING COMMAND MUST NAME BOTH WAYS TO SUPPLY THE FIELD.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE CLASS THIS CLOSES, AND WHY IT IS NOT THE ONE THE SEAM CLOSED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `applyBodySatisfiesRequired` fixed every requirement commander ENFORCES: a
 * `requiredOption` is now satisfiable from `--body`, and the refusal it emits
 * names both paths. That mechanism is derived from the command tree, so it needs
 * no list and cannot be forgotten.
 *
 * It reaches nothing that an ACTION checks by hand. `if (!opts.x) { … }` inside
 * an action body is invisible to the tree, and it produces the identical user
 * experience: a command refusing a field the operator DID supply, in the body,
 * with a message naming the one path they did not use. Same defect, one layer
 * down, and no amount of work on the seam finds it.
 *
 * ── WHY THIS GATE IS ABOUT THE MESSAGE ───────────────────────────────────────
 *
 * The obvious gate is a lint rule on `if (!opts.<x>) throw`. It cannot work, and
 * the reason is worth writing down rather than rediscovering: deciding whether
 * `<x>` is a REQUEST FIELD or a CLI-BEHAVIOUR FLAG is semantic. `--yes`,
 * `--watch`, `--follow` and `--from-dir` are all presence-tested correctly and
 * none of them can ever come from a body. A rule that cannot tell those from
 * `--mode` fires on correct code, and a guard that cries wolf is switched off
 * inside a day — after which the real violations flow again.
 *
 * The MESSAGE has no such ambiguity. Every instance of the defect ships one, it
 * is the whole of what the operator experiences, and "does this sentence name
 * --body" is syntax rather than judgement. So the gate reads messages.
 *
 * 🚨 **WHAT THIS DELIBERATELY DOES NOT CATCH.** A check whose LOGIC ignores the
 * body while its MESSAGE names `--body` passes here and is still broken. That
 * hole is real and unclosable by this instrument; the behavioural sweep is what
 * finds it — supply every field inside `--body` and see which commands still
 * refuse. That sweep executes arbitrary leaves, several of which are destructive
 * or interactive (which is why this package maintains a disposition list at all),
 * so it is not safe to run as a unit test and is not one.
 *
 * ── THE TWO CORRECT IDIOMS ALREADY IN THIS CODEBASE ──────────────────────────
 *
 *   readStringField(opts.mode, base, "mode")   // flag first, then the body
 *   requireAll(body, [{ field, flag }], hint)  // check the MERGED object
 *
 * Both read the body. Neither is required by this gate — a hand-written check
 * that reads the merged body is equally fine. What is required is that the
 * refusal tells the operator the truth about how to satisfy it.
 */

/** A refusal that says a field is absent, as opposed to malformed. */
const PRESENCE_REFUSAL = /\b(?:is|are) required\b|\bMissing required (?:flag|field)/;

/** The refusal names a specific flag the operator should have typed. */
const NAMES_A_FLAG = /--[a-z][a-z0-9-]*/;

/** The refusal also names the body. */
const NAMES_THE_BODY = /--body\b|--data\b/;

export interface Refusal {
  file: string;
  line: number;
  message: string;
}

/**
 * Slice out each `.action(` callback body by brace matching.
 *
 * Crude on purpose: the alternative is a TypeScript program, and this only needs
 * to know which text belongs to which action. Brace counting ignores braces
 * inside strings and comments, so a slice can end late — that widens what is
 * scanned and never narrows it, which is the safe direction for a gate.
 */
function actionBodies(source: string): Array<{ start: number; text: string }> {
  const out: Array<{ start: number; text: string }> = [];
  const marker = ".action(";
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) return out;
    let depth = 0;
    let i = at + marker.length - 1;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({ start: at, text: source.slice(at, i + 1) });
    from = i + 1;
  }
}

/**
 * Does the fluent chain this action terminates declare a JSON body flag?
 *
 * The chain runs from the nearest preceding `.command(` to the `.action(`, which
 * is how every command in this package is written.
 */
function chainTakesJsonBody(source: string, actionStart: number): boolean {
  const commandAt = source.lastIndexOf(".command(", actionStart);
  if (commandAt === -1) return false;
  const chain = source.slice(commandAt, actionStart);
  return /\.option\(\s*"--(?:body|data) <json/.test(chain);
}

const lineOf = (source: string, index: number): number => source.slice(0, index).split("\n").length;

/**
 * Every presence refusal, from a body-taking command, that names a flag without
 * naming the body.
 */
export function findRefusalsNamingOnePath(commandsDir: string): Refusal[] {
  const out: Refusal[] = [];
  for (const file of readdirSync(commandsDir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort()) {
    const source = readFileSync(join(commandsDir, file), "utf-8");
    for (const { start, text } of actionBodies(source)) {
      if (!chainTakesJsonBody(source, start)) continue;
      // Every string or template literal in the action, one per match.
      for (const m of text.matchAll(/(?:`(?:[^`\\]|\\.)*`)|(?:"(?:[^"\\]|\\.)*")/g)) {
        const literal = m[0];
        if (!PRESENCE_REFUSAL.test(literal)) continue;
        if (!NAMES_A_FLAG.test(literal)) continue;
        if (NAMES_THE_BODY.test(literal)) continue;
        out.push({
          file,
          line: lineOf(source, start + (m.index ?? 0)),
          message: literal.length > 140 ? `${literal.slice(0, 140)}…` : literal
        });
      }
    }
  }
  return out;
}

/**
 * A refusal is allowed to name one path only when the field genuinely cannot
 * come from the body. Each entry carries the reason, because an allowlist whose
 * entries are unexplained is a list of things nobody can ever remove.
 */
export const REFUSALS_ALLOWED_TO_NAME_ONE_PATH: ReadonlyArray<{
  readonly file: string;
  readonly fragment: string;
  readonly reason: string;
}> = [];
