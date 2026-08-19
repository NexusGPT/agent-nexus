/**
 * THE EXIT-CODE TAXONOMY. ONE DECLARATION, AND EVERY EXIT PATH READS IT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A NUMBER THAT MEANS TWO THINGS IS WORSE THAN A NUMBER THAT MEANS NOTHING.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Before this file the CLI had FOUR exit maps and no agreement between them:
 *
 *   - `handleError` in `errors.ts` returned `1` on every branch, at 467 call
 *     sites. A caller could not tell "not found" from "your key is wrong" from
 *     "the API was down" without parsing the document.
 *   - `handleAdminError` in `util/admin-errors.ts` mapped HTTP status to
 *     2/3/4/5/6 at 21 call sites — auth, permission, not-found, invalid-state,
 *     server-error.
 *   - `commands/upgrade.ts` used `2` for "installed and your PATH still resolves
 *     the old copy" and `3` for "installed and I could not check it FOR you".
 *     Those are the SAME NUMBERS the admin tree spends on auth and permission,
 *     meaning something unrelated, and `nexus upgrade --help` published them.
 *   - `commands/vibe-app-logs.ts` exited `130` on a second Ctrl-C.
 *
 * And the root `--help` epilogue said "EVERY failure exits 1", which was true of
 * exactly one of the four.
 *
 * ── WHY A CATEGORY AND NOT A NUMBER ──────────────────────────────────────────
 *
 * The map below is keyed by a CLOSED UNION of category names, never by an
 * integer. A call site names the category it is in; the number is looked up. So
 * a new exit path cannot invent a number, cannot reuse one that already means
 * something else, and cannot be reviewed by squinting at an integer literal.
 * Same reasoning as {@link import("./errors").FailureCause}, which is the
 * vocabulary for the error CODE — these two are deliberately parallel, and
 * `exitCodeForFailureCause` below is the single place they meet.
 *
 * ── THE NUMBERS WE DO NOT OWN ────────────────────────────────────────────────
 *
 * 🚨 `130` IS SIGINT AND IT IS NOT OURS TO ASSIGN. It is `128 + 2`, the shell's
 * own encoding of "killed by signal 2". It is declared here so that nothing else
 * can claim it, not because this CLI chose it.
 *
 * Everything from `126` up belongs to the shell and to signals: `126` is "found
 * and not executable", `127` is "not found", `128 + n` is "killed by signal n".
 * A CLI that emits one of those tells a script a lie about its own process.
 * `exitCodeTaxonomyViolations()` refuses any declared code in that band except
 * `130`, and `exit-code-taxonomy.test.ts` runs it.
 *
 * ── HOW THE NUMBERS WERE CHOSEN ──────────────────────────────────────────────
 *
 * `2` through `6` are the admin tree's existing meanings, kept BYTE-IDENTICAL,
 * because 21 call sites and a published table already use them and those five
 * meanings are general enough to be the whole CLI's. `7` through `11` are new
 * and were free. `upgrade`'s private `2` and `3` moved to `10` and `11` — one
 * command's local vocabulary does not get to squat on numbers that mean
 * something else everywhere else in the same binary.
 */

/**
 * Every outcome this CLI can exit with, named.
 *
 * A closed union, so a call site cannot spell one wrong and a new one cannot be
 * added without this file changing. The gate's obligation set is derived from
 * `EXIT_CODES`' own keys, so a category deleted here fails the suite by NAME
 * rather than quietly shrinking the population it is measured against.
 */
export type ExitCategory =
  /** The command completed. It does not always mean the thing happened. */
  | "success"
  /**
   * A failure with no more specific category. THE GENUINE FALLBACK, and it must
   * stay one: reaching for it because the category is inconvenient to determine
   * is how the CLI ended up with 467 sites that all said `1`.
   */
  | "failed"
  /** No usable credential, or one the server rejected. HTTP 401. */
  | "not-authenticated"
  /** The credential is good and is not allowed to do this. HTTP 403. */
  | "permission-denied"
  /**
   * The named thing does not exist. HTTP 404, and also a 2xx whose body means
   * "absent" — see `printNotFound` in `errors.ts`.
   */
  | "not-found"
  /**
   * The invocation or its payload was refused. A missing required option, an
   * unknown flag, a value outside a `.choices()` set, HTTP 400 / 409 / 422, and
   * CLI-side cross-field validation that refuses to make the call at all.
   *
   * 409 lives here rather than in its own category because a conflict IS an
   * invalid state for the request as sent, which is the admin tree's own reading
   * of `5`. The `code` field names which conflict.
   */
  | "invalid-input"
  /** The request arrived and the server failed. HTTP >= 500. */
  | "remote-error"
  /**
   * The API could not be reached at all — DNS, TLS, socket, offline. RETRYABLE,
   * and that is the whole reason it is not `failed`: a script that backs off and
   * retries this one is doing the right thing.
   */
  | "connection-failed"
  /**
   * The CLI stopped waiting. NOT a synonym for `connection-failed` — the server
   * may still be completing the request, so a blind retry of a write can
   * duplicate it.
   */
  | "timed-out"
  /**
   * A local operation this CLI performed failed — an install, a config write, a
   * file write, a spawn. Nothing about the caller's input is wrong and no retry
   * against the API helps.
   */
  | "local-failed"
  /**
   * The operation RAN, and the outcome the caller wanted did not happen.
   *
   * Distinct from every failure above, all of which leave the machine as it was.
   * Here something changed and it was not enough — `nexus upgrade` writing a new
   * package to disk while the shell still resolves an older copy is the worked
   * case. RETRYING IS THE TRAP: it repeats the same successful half forever.
   */
  | "outcome-not-reached"
  /**
   * The operation ran and its result COULD NOT BE MEASURED.
   *
   * 🚨 THIS IS NOT A FAILURE AND IT IS NOT A SUCCESS, AND collapsing it into
   * either is the defect it exists to prevent. `nexus upgrade` under `sudo`
   * installs as root and can only read root's environment; reporting that as
   * `outcome-not-reached` names a PATH problem that may not exist, and reporting
   * it as `success` claims a check nobody performed.
   */
  | "unmeasured"
  /**
   * Killed by SIGINT. `128 + 2`, the shell's own encoding — see the file header.
   * Declared so nothing else takes the number; never chosen as a verdict.
   */
  | "interrupted";

/**
 * The taxonomy. THE ONLY PLACE AN EXIT CODE IS WRITTEN AS A NUMBER.
 *
 * `exit-code-taxonomy.test.ts` scans the package for integer exit literals
 * outside this file and fails naming each one, so a call site that invents a
 * number is a red build rather than a review finding.
 */
export const EXIT_CODES = {
  success: 0,
  failed: 1,
  "not-authenticated": 2,
  "permission-denied": 3,
  "not-found": 4,
  "invalid-input": 5,
  "remote-error": 6,
  "connection-failed": 7,
  "timed-out": 8,
  "local-failed": 9,
  "outcome-not-reached": 10,
  unmeasured: 11,
  interrupted: 130
} as const satisfies Readonly<Record<ExitCategory, number>>;

/** Every category name, for a gate that must enumerate rather than count. */
export const EXIT_CATEGORIES = Object.keys(EXIT_CODES) as readonly ExitCategory[];

/** The declared codes, as a set, for membership checks. */
const DECLARED_CODES: ReadonlySet<number> = new Set(Object.values(EXIT_CODES));

/** Is `code` a member of the taxonomy? The gate's core question. */
export function isDeclaredExitCode(code: number): boolean {
  return DECLARED_CODES.has(code);
}

/** The category a declared code names, or `null` when the code is undeclared. */
export function exitCategoryFor(code: number): ExitCategory | null {
  for (const category of EXIT_CATEGORIES) {
    if (EXIT_CODES[category] === code) return category;
  }
  return null;
}

/**
 * The ONE HTTP-status-to-category rule in this package.
 *
 * `handleError` (the resource tree) and `handleAdminError` (the admin tree) both
 * call it. Two trees reading one function is the whole point: the admin tree's
 * table was correct and private, and a second copy of a correct table is a
 * second thing to drift.
 *
 * ⚠️ A STATUS THIS DOES NOT NAME IS `failed`, NOT AN ERROR. 3xx and the odd 4xx
 * reach a CLI so rarely that inventing a category for them would be a guess with
 * a number attached. The error document's `code` still names what happened.
 */
export function exitCodeForHttpStatus(status: number): number {
  if (status === 401) return EXIT_CODES["not-authenticated"];
  if (status === 403) return EXIT_CODES["permission-denied"];
  if (status === 404) return EXIT_CODES["not-found"];
  if (status === 400 || status === 409 || status === 422) return EXIT_CODES["invalid-input"];
  if (status >= 500) return EXIT_CODES["remote-error"];
  return EXIT_CODES.failed;
}

/**
 * An error that CARRIES its category, for a throw site far from `handleError`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A BARE `throw new Error("Run: nexus auth login")` IS AN AUTH REFUSAL THAT
 *    REACHES THE CALLER AS `CLI_UNKNOWN_ERROR` AND EXIT 1.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `config.ts` threw exactly that for "no profiles configured" and for "no active
 * profile set" — the two most common first-run failures in the whole CLI.
 * `handleError`'s last branch is `err instanceof Error`, so both arrived stamped
 * `CLI_UNKNOWN_ERROR`: a script could not distinguish "you are not logged in"
 * from a crash, on the one failure with a one-command remedy.
 *
 * The class is here rather than in `errors.ts` so a module that only needs to
 * THROW does not have to import the whole reporting layer. This file imports
 * nothing.
 */
export class CategorizedCliError extends Error {
  readonly category: ExitCategory;
  readonly code: string;
  readonly hint: string | null;

  constructor(category: ExitCategory, code: string, message: string, hint?: string) {
    super(message);
    this.name = "CategorizedCliError";
    this.category = category;
    this.code = code;
    this.hint = hint ?? null;
  }

  /** The exit code this error means. */
  get exitCode(): number {
    return EXIT_CODES[this.category];
  }
}

/**
 * Everything wrong with the taxonomy as declared, named.
 *
 * Exported rather than inlined into the spec so the rules are readable beside
 * the declaration they constrain, and so a future gate elsewhere can reuse them.
 * An empty array is the only passing result.
 */
export function exitCodeTaxonomyViolations(): readonly string[] {
  const problems: string[] = [];

  if (EXIT_CATEGORIES.length === 0) {
    problems.push("the taxonomy declares no categories at all");
    return problems;
  }

  if (EXIT_CODES.success !== 0) {
    problems.push(`"success" must be 0, is ${String(EXIT_CODES.success)}`);
  }
  if (EXIT_CODES.failed !== 1) {
    problems.push(`"failed" must be 1, is ${String(EXIT_CODES.failed)}`);
  }
  if (EXIT_CODES.interrupted !== 130) {
    problems.push(`"interrupted" must be 130 (128 + SIGINT), is ${String(EXIT_CODES.interrupted)}`);
  }

  const seen = new Map<number, ExitCategory>();
  for (const category of EXIT_CATEGORIES) {
    const code = EXIT_CODES[category];

    const twin = seen.get(code);
    if (twin !== undefined) {
      problems.push(`"${category}" and "${twin}" both claim exit ${String(code)}`);
    }
    seen.set(code, category);

    if (!Number.isInteger(code) || code < 0 || code > 255) {
      problems.push(`"${category}" is ${String(code)}, which is not a POSIX exit status`);
      continue;
    }

    // 126 and up are the shell's and the kernel's. 130 is declared to RESERVE
    // it, which is the one legitimate reason to sit in that band.
    if (code >= 126 && category !== "interrupted") {
      problems.push(
        `"${category}" is ${String(code)}, inside the shell/signal band (>= 126) it may not claim`
      );
    }
  }

  return problems;
}
