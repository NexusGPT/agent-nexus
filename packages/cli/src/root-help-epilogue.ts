import { ROOT_EPILOGUE_BODY_AND_SCOPES } from "./root-help-epilogue.body";
import { ROOT_EPILOGUE_COMPATIBILITY } from "./root-help-epilogue.compatibility";
import { ROOT_EPILOGUE_FAILURE } from "./root-help-epilogue.failure";
import { ROOT_EPILOGUE_FLAGS } from "./root-help-epilogue.flags";

/**
 * The root epilogue — the contract that holds for EVERY command.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE STANDARD THIS HELP IS WRITTEN TO (NEX-3626)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `--help` carries exactly the instruction a prompt would carry, in full. The
 * test is operational: paste a command's `--help` into an agent prompt with no
 * other source available, and the agent must use that command correctly FIRST
 * TIME — including the cases where it would otherwise silently do the wrong
 * thing. If Nexus documentation states something about a command that its
 * `--help` does not, the help is incomplete by definition.
 *
 * What that means per command, and what {@link help-completeness.test.ts}
 * enforces for the namespaces that have been converted:
 *
 *   - an `Examples:` block of REAL invocations, and a `Notes:` block;
 *   - every precondition, and the scope the call needs;
 *   - the exact body shape — which field sits where, and what type it is;
 *   - what a value MEANS, and specifically what null means as distinct from
 *     zero and from absent;
 *   - the destructive consequence, NAMED, including effects on objects the
 *     caller never mentioned;
 *   - what a SILENT FAILURE looks like — the call that answers 2xx and does
 *     not do the thing;
 *   - how to VERIFY the call did what it claims.
 *
 * The form is `nexus role`'s: imperative, consequence-first sentences in a
 * `Notes:` block. `role attach` is the model — "THIS IS A MOVE, NOT AN ADD. A
 * system belongs to exactly ONE Role, so this revokes the previous Role's claim
 * AND the access its members had through it." Copy that. Do not invent a second
 * convention beside it.
 *
 * Facts that hold for MORE THAN ONE command belong here in the root epilogue
 * rather than being repeated per command; facts about one command belong on
 * that command, where the reader is when they need them.
 *
 * ── 🚨 THE COMPOSITION IS BYTE-EXACT, AND TWO SPECS READ IT ──────────────────
 *
 * The four sections are joined by a BLANK LINE, with one leading newline and a
 * trailing two spaces, because that is exactly what the single template literal
 * this replaced contained — `--help` output is compared byte for byte by
 * `cli-surface.codegen.test.ts` and by the generated docs pages, so a changed
 * blank line reads as a surface regression.
 *
 * `exit-code-taxonomy.test.ts` and `request-body-flag-spelling.test.ts` assert
 * against THIS CONSTANT rather than against a source file's bytes. That is the
 * stronger subject: it is the string the program actually installs, so a section
 * dropped from the composition above is a red build, where a text scan over one
 * section's file could not see it.
 */
export const ROOT_EPILOGUE = `
${[
  ROOT_EPILOGUE_FLAGS,
  ROOT_EPILOGUE_FAILURE,
  ROOT_EPILOGUE_BODY_AND_SCOPES,
  ROOT_EPILOGUE_COMPATIBILITY
].join("\n\n")}
  `;
