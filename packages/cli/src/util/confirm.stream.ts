/**
 * The stream a QUESTION is written on.
 *
 * 🚨 IT IS NOT `process.stdout`, AND THIS IS THE OTHER HALF OF READING STDIN.
 * Deciding on stdin makes `nexus <destructive> > log` from a real keyboard ask
 * — correctly, because the operator is right there and can answer. Writing the
 * question on stdout then sends it into the log file, so the terminal shows
 * NOTHING while the process waits for a keystroke. To the operator that is
 * indistinguishable from the hang this whole change removes, and it appears in
 * exactly the case the change set out to support.
 *
 * A prompt is interaction, not output. stderr is where interaction goes: it is
 * unredirected in the common case, it is not the pipe a caller parses, and it
 * keeps a question out of a `--json` document by construction.
 *
 * stdout is used for the one combination where stderr cannot be seen and stdout
 * can. When neither is a terminal the choice cannot matter — `confirmDestructive`
 * has already refused before reaching here, and the local parsers that call this
 * refuse on the same test.
 */
export function promptStream(): NodeJS.WriteStream {
  return process.stdout.isTTY && !process.stderr.isTTY ? process.stdout : process.stderr;
}

/**
 * Write one line of the CONVERSATION — anything a person needs in order to
 * answer, or to understand the answer they just gave.
 *
 * 🚨 THE QUESTION IS NOT THE ONLY HALF THAT HAS TO BE VISIBLE. A spend gate
 * printed its cost-safety status and its message with `console.log` and asked
 * through {@link promptStream}: with stdout redirected the operator got a bare
 * "accept the additional spend? [y/N]" and none of the figures it refers to, and
 * on decline lost the re-run line as well. Splitting a dialogue across two
 * streams is the same defect as asking on the wrong one, one step later.
 *
 * The rule that decides which function to call: a RESULT goes to `console.log`,
 * because a caller parses it. A PROMPT, its preamble and its acknowledgement go
 * here, because a person reads them.
 */
export function promptLine(text = ""): void {
  promptStream().write(`${text}\n`);
}
