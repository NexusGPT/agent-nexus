// ---------------------------------------------------------------------------
// Warning output
// ---------------------------------------------------------------------------

import { color } from "./output-color";

/**
 * Print a prominent warning to STDERR. Always written (even in --json mode and
 * non-TTY) because warnings flag hazards a caller must not miss — but kept off
 * stdout so it never contaminates a `--json` document (NEX-2176). Lines after
 * the first are dimmed continuation/hint text.
 */
export function printWarning(message: string, ...hints: string[]): void {
  process.stderr.write(color.yellow(`⚠ ${message}`) + "\n");
  for (const hint of hints) {
    process.stderr.write(color.dim(`  ${hint}`) + "\n");
  }
}
