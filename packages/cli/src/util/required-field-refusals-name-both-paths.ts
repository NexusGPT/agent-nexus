import { readFileSync } from "node:fs";
import { join } from "node:path";

import { listFilesRecursively } from "./list-files-recursively";
import {
  actionBodies,
  chainTakesJsonBody,
  lineOf
} from "./required-field-refusals-name-both-paths.scan";

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
 * body while its MESSAGE names `--body` passes here and is still broken. Only the
 * behavioural sweep finds it — supply every field in `--body`, see what still
 * refuses — and it runs arbitrary leaves, some destructive or interactive (hence
 * this package's disposition list), so it is not, and cannot be, a unit test.
 *
 * ── THE TWO CORRECT IDIOMS ALREADY IN THIS CODEBASE ──────────────────────────
 *
 *   readStringField(opts.mode, base, "mode")   // flag first, then the body
 *   requireAll(body, [{ field, flag }], hint)  // check the MERGED object
 *
 * Both read the body; neither is required — a hand-written check reading the merged
 * body is fine. What is required is a refusal telling the truth about how to satisfy it.
 *
 * ── THE POPULATION ───────────────────────────────────────────────────────────
 *
 * 🔴 DERIVED, never a hand-written list and never a path key:
 * {@link listCommandSources} walks `commandsDir` recursively, so a command added
 * in a new subdirectory is in the population the moment it exists, and moving a
 * file cannot drop it out. The source-text slicing that turns each file into
 * regions is `required-field-refusals-name-both-paths.scan.ts`.
 */

/** A refusal that says a field is absent, as opposed to malformed. */
const PRESENCE_REFUSAL = /\b(?:is|are) required\b|\bMissing required (?:flag|field)/;

/** The refusal names a specific flag the operator should have typed. */
const NAMES_A_FLAG = /--[a-z][a-z0-9-]*/;

/** The refusal also names the body. */
const NAMES_THE_BODY = /--body\b|--data\b/;

export interface Refusal {
  /** Relative to the scanned directory, so a command in a subdirectory is named by its path. */
  file: string;
  line: number;
  message: string;
}

/** Every command source under `commandsDir`, at any depth, relative to it. */
export function listCommandSources(commandsDir: string): string[] {
  return listFilesRecursively(commandsDir, (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
}

/**
 * Every presence refusal, from a body-taking command, naming a flag but not the
 * body. `files` lets a caller assert the population read: a walk that found no
 * file reads exactly like a clean tree. Omitted, it is `listCommandSources`.
 */
export function findRefusalsNamingOnePath(
  commandsDir: string,
  files: readonly string[] = listCommandSources(commandsDir)
): Refusal[] {
  const out: Refusal[] = [];
  for (const file of files) {
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
