/**
 * The contexts the shell reader in `shell-code.testkit.ts` tracks, shared by it
 * and its per-line lexer. It imports nothing, so the public mirror can build it.
 */

/** A lexical context the shell reader is inside, innermost last. */
export type ShellContext =
  /** Code: the script itself, `$(…)`, or a backquote. `closer` ends a nested one. */
  | { readonly kind: "code"; readonly closer?: ")" | "`"; depth: number }
  /** `${…}`: a `#` here is an operator, never a comment. */
  | { readonly kind: "param" }
  /** `$((…))` or `((…))`: a `<<` here is a shift, never a heredoc. */
  | { readonly kind: "arith"; depth: number }
  /** A quoted string, and the line it opened on. */
  | { readonly kind: "single" | "double" | "ansi"; readonly line: number };

export interface PendingHeredoc {
  readonly word: string;
  /** `<<-` ends on a terminator line indented with tabs. */
  readonly stripTabs: boolean;
}
