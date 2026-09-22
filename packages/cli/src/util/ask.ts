/**
 * ONE PLACE THAT OPENS A READLINE INTERFACE, SO ONE PLACE CLOSES IT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 AN INTERFACE LEFT OPEN HOLDS STDIN, AND A PROCESS HOLDING STDIN NEVER EXITS.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Three sites in this package hand-rolled the same six lines — create, ask,
 * normalise, close — and the copies did not agree. `confirmDestructive` and the
 * skills-target prompt closed in a `finally`; the spend prompt in
 * `commands/apps/_shared/confirm-overage-interactively.ts` closed on the HAPPY
 * PATH ONLY, under a comment claiming it was the "same readline idiom as the
 * destructive-delete confirmations elsewhere in the CLI". A read that threw
 * there left stdin held and the CLI alive with nothing left to answer it — a
 * hang, on a spend gate, where the whole point is to refuse safely.
 *
 * The third copy getting it right is what makes this drift rather than
 * necessity, and it is why the repair is an extraction and not a third `finally`
 * typed into a third file. A `finally` cannot be forgotten in a function that
 * does not exist.
 *
 * ── THE ANSWER IS TRIMMED HERE, FOR THE SAME REASON ─────────────────────────
 *
 * The spend prompt ran `.toLowerCase()` with no `.trim()`, so `"y "` read as NO
 * — and so did a CRLF `"y\r"`, which is what a Windows terminal delivers and
 * what anyone piping a file with CRLF line endings delivers. The operator types
 * `y`, is told the deploy was aborted, and nothing in the output says why.
 * Trimming at the read means no caller can answer that question differently.
 *
 * ── WHY `output` IS A PARAMETER ─────────────────────────────────────────────
 *
 * The stream a question is written on is `promptStream()` in `./confirm`, and
 * `confirmDestructive` lives in that same file. Importing it here would close a
 * cycle, which `import/no-cycle` refuses; passing the stream in keeps this the
 * primitive both layers sit on rather than a peer of one of them.
 */

/**
 * Ask one question and return the trimmed answer.
 *
 * `question` is written VERBATIM — this function adds no punctuation, no
 * bracketed default and no trailing space, because a caller asking `[1/2/3]` and
 * a caller asking `[y/N]` render their own.
 */
export async function askLine(question: string, output: NodeJS.WritableStream): Promise<string> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/**
 * Ask a y/N question. True only for a literal `y`, in any case, with any
 * surrounding whitespace or carriage return.
 *
 * ⚠️ NOT A CONFIRMATION. It decides nothing about `--yes`, about the absence of
 * a terminal, or about what a refusal owes the caller — {@link
 * import("./confirm").confirmDestructive} owns all three and is what a
 * destructive command calls. This is the keystroke underneath it.
 */
export async function askYesNo(question: string, output: NodeJS.WritableStream): Promise<boolean> {
  return (await askLine(`${question} [y/N] `, output)).toLowerCase() === "y";
}
