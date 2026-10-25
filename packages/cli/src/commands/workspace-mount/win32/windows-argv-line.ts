/**
 * One command line as the Windows C runtime (and Go's `os.Args`) reads it
 * back into the same arguments: a bare word stays bare; a word with a space,
 * a tab or a quote is wrapped in quotes, with each quote inside escaped and
 * the backslashes before a quote (or before the closing quote) doubled.
 *
 * This is what `Start-Process -ArgumentList` hands rclone verbatim; rclone's
 * own parse of it is the C runtime's, so `--volname "General Context (Acme)"`
 * arrives as one argument.
 */
export function windowsArgvLine(args: readonly string[]): string {
  return args.map(quoteArg).join(" ");
}

function quoteArg(arg: string): string {
  if (arg !== "" && !/[\s"]/.test(arg)) return arg;
  let out = '"';
  let backslashes = 0;
  for (const ch of arg) {
    if (ch === "\\") {
      backslashes += 1;
      continue;
    }
    if (ch === '"') {
      out += `${"\\".repeat(backslashes * 2 + 1)}"`;
      backslashes = 0;
      continue;
    }
    out += `${"\\".repeat(backslashes)}${ch}`;
    backslashes = 0;
  }
  return `${out}${"\\".repeat(backslashes * 2)}"`;
}
