import type { ExitCategory } from "./exit-code-categories";
import { EXIT_CODES } from "./exit-code-table";

/**
 * An error that CARRIES its category, for a throw site far from `handleError`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A BARE `throw new Error("Run: nexus auth login")` IS AN AUTH REFUSAL THAT
 *    REACHES THE CALLER AS `CLI_UNKNOWN_ERROR` AND EXIT 1.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The config layer threw exactly that for "no profiles configured" and for "no
 * active profile set" — the two most common first-run failures in the whole CLI.
 * `config-profile-lookup.ts` is where those two now mint this class instead.
 * `handleError`'s last branch is `err instanceof Error`, so both arrived stamped
 * `CLI_UNKNOWN_ERROR`: a script could not distinguish "you are not logged in"
 * from a crash, on the one failure with a one-command remedy.
 *
 * The class is here rather than in `errors.ts` so a module that only needs to
 * THROW does not have to import the whole reporting layer. It reaches the
 * taxonomy and the category vocabulary and nothing else.
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
