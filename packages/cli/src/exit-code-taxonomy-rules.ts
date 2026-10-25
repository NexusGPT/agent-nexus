import type { ExitCategory } from "./exit-code-categories";
import { EXIT_CATEGORIES, EXIT_CODES } from "./exit-code-table";

/**
 * Everything wrong with the taxonomy as declared, named.
 *
 * Exported rather than inlined into the spec so the rules are readable beside
 * the declaration they constrain, and so a future gate elsewhere can reuse them.
 * An empty array is the only passing result.
 *
 * It is the one reader here that judges the DECLARATION rather than using it,
 * which is why it sits beside `exit-codes.ts` instead of inside it: the file a
 * gate audits should not be the file the gate lives in.
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

    const counterpart = seen.get(code);
    if (counterpart !== undefined) {
      problems.push(`"${category}" and "${counterpart}" both claim exit ${String(code)}`);
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
