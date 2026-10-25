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
 *   - `handleAdminError` in `util/admin-errors.handle.ts` mapped HTTP status to
 *     2/3/4/5/6 at 21 call sites — auth, permission, not-found, invalid-state,
 *     server-error.
 *   - `commands/upgrade.ts` used `2` for "installed and your PATH still resolves
 *     the old copy" and `3` for "installed and I could not check it FOR you".
 *     Those are the SAME NUMBERS the admin tree spends on auth and permission,
 *     meaning something unrelated, and `nexus upgrade --help` published them.
 *   - `commands/apps/logs/run-app-logs-follow.ts` exited `130` on a second signal.
 *
 * And the root `--help` epilogue said "EVERY failure exits 1", which was true of
 * exactly one of the four.
 *
 * ── WHY A CATEGORY AND NOT A NUMBER ──────────────────────────────────────────
 *
 * The map is keyed by a CLOSED UNION of category names, never by an integer. A
 * call site names the category it is in; the number is looked up. So a new exit
 * path cannot invent a number, cannot reuse one that already means something
 * else, and cannot be reviewed by squinting at an integer literal.
 * Same reasoning as {@link import("./errors").FailureCause}, which is the
 * vocabulary for the error CODE — these two are deliberately parallel, and
 * `FAILURE_CAUSE_EXIT_CATEGORIES` in `errors-failure-cause.ts` is the single
 * place they meet.
 *
 * ── THE NUMBERS WE DO NOT OWN ────────────────────────────────────────────────
 *
 * 🚨 `130` IS SIGINT AND IT IS NOT OURS TO ASSIGN. It is `128 + 2`, the shell's
 * own encoding of "killed by signal 2". It is declared so that nothing else can
 * claim it, not because this CLI chose it.
 *
 * Everything from `126` up belongs to the shell and to signals: `126` is "found
 * and not executable", `127` is "not found", `128 + n` is "killed by signal n".
 * A CLI that emits one of those tells a script a lie about its own process.
 * {@link exitCodeTaxonomyViolations} refuses any declared code in that band
 * except `130`, and `exit-code-declaration.test.ts` runs it.
 *
 * ── HOW THE NUMBERS WERE CHOSEN ──────────────────────────────────────────────
 *
 * `2` through `6` are the admin tree's existing meanings, kept BYTE-IDENTICAL,
 * because 21 call sites and a published table already use them and those five
 * meanings are general enough to be the whole CLI's. `7` through `11` are new
 * and were free. `upgrade`'s private `2` and `3` moved to `10` and `11` — one
 * command's local vocabulary does not get to squat on numbers that mean
 * something else everywhere else in the same binary.
 *
 * ── THIS FILE IS THE INDEX, AND IT DECLARES NOTHING ─────────────────────────
 *
 * Five modules, one specifier. `./exit-codes` is the only path any caller
 * names — 77 of them — and every line below is an `export … from`, so there is
 * nothing here for a second definition of anything to hide in:
 *
 *   - `exit-code-categories.ts`     {@link ExitCategory}, the names alone
 *   - `exit-code-table.ts`          the numbers, and the lookups over them
 *   - `exit-code-http-status.ts`    the one HTTP-status rule both trees read
 *   - `exit-code-error.ts`          {@link CategorizedCliError}, the carrier
 *   - `exit-code-taxonomy-rules.ts` {@link exitCodeTaxonomyViolations}
 *
 * 🚨 THE RE-EXPORTS ARE WHY THE MAP IS NOT HERE. Four of those five read the
 * numbers; a map declared in this file would make each of them import the
 * module that re-exports it, and `import/no-cycle` refuses that — measured, as
 * six warnings against a package cap of nine. The declaration is therefore a
 * leaf and the index is this file, which is the only arrangement that is both
 * acyclic and a single import path.
 */

export type { ExitCategory } from "./exit-code-categories";
export { CategorizedCliError } from "./exit-code-error";
export { categoryForHttpStatus, exitCodeForHttpStatus } from "./exit-code-http-status";
export {
  EXIT_CATEGORIES,
  EXIT_CODES,
  exitCategoryFor,
  isDeclaredExitCode
} from "./exit-code-table";
export { exitCodeTaxonomyViolations } from "./exit-code-taxonomy-rules";
