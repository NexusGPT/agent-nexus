// ---------------------------------------------------------------------------
// Colors (ANSI 24-bit)
// ---------------------------------------------------------------------------

/**
 * Decided ONCE, when this module loads, and never re-read.
 *
 * A spec that wants coloured output has to set the environment before the first
 * import of this file — a `process.env.NO_COLOR` written inside a test body
 * arrives too late and changes nothing. Several specs say so at their own call
 * sites, which is where it reaches whoever is about to be surprised by it.
 */
const NO_COLOR =
  !!process.env.NO_COLOR || process.argv.includes("--no-color") || !process.stdout.isTTY;

function c(code: string, text: string): string {
  return NO_COLOR ? text : `\x1b[${code}m${text}\x1b[0m`;
}

export const color = {
  orange: (t: string) => c("38;2;245;70;26", t),
  teal: (t: string) => c("38;2;0;183;165", t),
  dim: (t: string) => c("2", t),
  bold: (t: string) => c("1", t),
  red: (t: string) => c("31", t),
  green: (t: string) => c("32", t),
  yellow: (t: string) => c("33", t),
  cyan: (t: string) => c("36", t)
};
