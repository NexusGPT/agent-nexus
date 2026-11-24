/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠️ THIS FILE IS MIRRORED, BYTE FOR BYTE, BETWEEN `@agent-nexus/cli` AND
 *    `@agent-nexus/mcp-server`.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Both packages ask a human for an API key and write the SAME
 * `~/.nexus-mcp/config.json`, and there is no dependency edge between them:
 * neither depends on the other, and `@agent-nexus/cli` declares no `main`,
 * `types` or `exports` at all, so nothing can import from it. This predicate
 * cannot be shared by import. `nexus-mcp login > out.log` blocked on a question
 * written into the log file for exactly that reason — the reasoning below
 * already existed, one package away, and could not be reached.
 *
 * It is shared by COPY, and `confirm.stream.mirrored.test.ts` in
 * `packages/mcp-server/src` fails when the copies drift, and when one side gains
 * a `confirm.stream.*` file the other lacks. That gate is the enforceable form
 * of "one predicate" across a boundary with no edge to route through — the same
 * arrangement, for the same reason, as the `secret-file.*` family beside this
 * file in both packages, whose header carries the argument in full.
 *
 * There are no imports below, and that is load-bearing rather than incidental:
 * it is what lets the copies be byte-IDENTICAL rather than merely equivalent, so
 * the gate can compare content instead of behaviour.
 *
 * debt: duplicated across two independently published binaries instead of
 *       extracted. A shared workspace package for one `process.std*.isTTY`
 *       predicate costs every worktree a build target in its reconcile and every
 *       release a third version to coordinate; adding `exports` to
 *       `@agent-nexus/cli` would turn a published binary into a library.
 *       Ceiling: TWO byte-identical copies of a PURE PLATFORM predicate — it
 *       reads `process.std*` and nothing else, imports nothing, and knows
 *       nothing about either package's domain.
 *       Upgrade trigger: EITHER a third site needs it, OR one of the two needs
 *       this to behave differently, or it acquires an import. That second half
 *       fires with only two copies in the tree — byte equality is then the wrong
 *       invariant, and the cure is extraction with a parameter rather than a
 *       third copy.
 */

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
 * Whether asking here would HANG: somebody is waiting, and no stream can show
 * them the question.
 *
 * 🔴 IT IS NOT `!canAsk()`, AND THE DIFFERENCE IS A SHIPPED MODE. {@link canAsk}
 * also demands a terminal on STDIN, so it is false for every piped run — and a
 * pipe hangs on nothing, because the answer arrives off it and no question has to
 * be read by anybody. `printf 'nxs_…\nwork\n' | nexus auth login` is what the
 * login prompter's line queue exists for, and `nexus eval conv new`'s help says
 * "SCRIPTED STDIN WORKS" with the published CHANGELOG agreeing. A gate spelled
 * `!canAsk()` refuses all of them, and it passes every arm that only asks whether
 * a refusal happens.
 *
 * So this is {@link canAsk}'s QUESTION half, asked only when stdin is a terminal
 * and a person is therefore waiting for something to appear.
 *
 * 🚨 ASK IT BEFORE THE FIRST IRREVERSIBLE ACT, NOT AT THE READ. A refusal that
 * arrives after a browser window has opened, or after a remote draft has been
 * created, is a side effect plus an error rather than a refusal — measured on
 * both, and the fix was to hoist the call rather than to change this condition.
 * At the read it stays as defence in depth for whatever prompts come later.
 */
export function askWouldHang(): boolean {
  return process.stdin.isTTY === true && !canAsk();
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
