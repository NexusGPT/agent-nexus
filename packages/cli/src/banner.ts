const NO_COLOR =
  !!process.env.NO_COLOR || process.argv.includes("--no-color") || !process.stdout.isTTY;

function c(code: string, text: string): string {
  return NO_COLOR ? text : `\x1b[${code}m${text}\x1b[0m`;
}

const teal = (t: string) => c("38;2;0;183;165", t);
const dim = (t: string) => c("2", t);
const bold = (t: string) => c("1", t);

const WORDMARK = [
  "  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗",
  "  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝",
  "  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗",
  "  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║",
  "  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║",
  "  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝"
];

/**
 * Return the banner string. Used by Commander's addHelpText.
 */
export function getBanner(version: string): string {
  const lines: string[] = [""];

  for (const line of WORDMARK) {
    lines.push(bold(line));
  }

  lines.push("");
  lines.push(
    dim("  The AI agent platform") + "  " + teal("v" + version) + "  " + teal("░ ALPHA ░")
  );
  lines.push("");

  return lines.join("\n");
}

export function printBanner(version: string): void {
  // Skip banner in non-TTY (piped) mode
  if (!process.stdout.isTTY) return;

  console.log();

  for (const line of WORDMARK) {
    console.log(bold(line));
  }

  console.log();
  console.log(
    dim("  The AI agent platform") + "  " + teal("v" + version) + "  " + teal("░ ALPHA ░")
  );
  console.log();
}
