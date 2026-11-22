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
 * can.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 WHEN NEITHER CAN BE SEEN THERE IS NO STREAM TO ASK ON, AND THAT IS A
 *    REFUSAL RATHER THAN A CHOICE BETWEEN TWO.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus <destructive> >out.log 2>err.log`, typed at a real keyboard: stdin is
 * still a terminal, so a gate on stdin alone passes it straight through. The
 * question is then written into err.log, the terminal shows nothing, and the
 * process blocks on a keystroke nobody was asked for — the hang this file exists
 * to remove, reached through the one stream combination nothing tested. This
 * function returns stderr there, honestly and uselessly; what was missing was a
 * caller willing to treat that as "I cannot ask".
 *
 * {@link canAsk} is that test, and it is ONE function rather than two tests at
 * each ask site on purpose: stdin says whether an ANSWER can arrive, the prompt
 * stream says whether the QUESTION can be read, and a site that checks one of
 * them has a hang on whichever it left out.
 */
export function promptStream(): NodeJS.WriteStream {
  return process.stdout.isTTY && !process.stderr.isTTY ? process.stdout : process.stderr;
}

/**
 * Whether a question can be asked HERE AT ALL — both halves of the conversation,
 * in one answer.
 *
 * ⚠️ EVERY ASK SITE OWES THIS TEST, NOT ONLY THE DESTRUCTIVE ONE. Anything that
 * writes a question through {@link promptLine} and then reads an answer must gate
 * on this; gating on `process.stdin.isTTY` is the half that leaves the hang
 * above reachable, and it reads as the whole test because the answer is the half
 * everyone thinks about.
 *
 * `=== true` on both, because `isTTY` is `boolean | undefined` and an absent
 * property is not a terminal.
 */
export function canAsk(): boolean {
  return process.stdin.isTTY === true && promptStream().isTTY === true;
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
