import type { Command } from "commander";
import { describe, expect, it } from "vitest";

import { captureHelp, deriveCommandLeaves } from "./command-universe";
import { buildRootProgram } from "./root-program";

/**
 * THE TRACKS HELP MUST DISCLOSE THE PAGE IT IS SHOWING YOU, AND NAME THE VERB
 * THAT MINTS EVERY ID IT DEMANDS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS FOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The sibling gate {@link ../tracks-claim-help-names-the-agent-verb.test.ts}
 * closed ONE screen — `tracks task claim` — against ONE dead end. This file
 * closes the rest of the same class, plus the paging half that produced it.
 *
 * ── HALF ONE: A PAGE THAT DOES NOT SAY IT IS A PAGE ──────────────────────────
 *
 * `clampReadySetLimit` takes 50 when no `--limit` arrives, and it backs three
 * reads: `tracks list`, `tracks ready` and `tracks task ready`. Three more
 * `--limit` screens in this namespace already disclosed that default in exactly
 * these words; those three did not. The cost is not cosmetic:
 *
 *   - `tracks ready` prints an absence list — DONE, BLOCKED, archived,
 *     dependency-held — that reads as EXHAUSTIVE and omitted the one cause that
 *     needs no flag to fire. Its response carries no `total` and no `hasMore`,
 *     so a full page and a finished board are the same fifty rows.
 *   - `tracks task ready` said "truncated by --limit", which a reader who never
 *     typed `--limit` correctly reads as not applying to them.
 *   - `tracks create` went further and promised the new track "comes back as
 *     ready work on the very next call" — false precisely for the track just
 *     created, because a new track takes the highest number and the ready set
 *     sorts number ASCENDING. It is guaranteed last in line.
 *
 * ── HALF TWO: AN ID THE SCREEN DEMANDS AND CANNOT PRODUCE ────────────────────
 *
 * `tracks event append --agent` is REQUIRED and uuid-only. `tracks diary append`
 * takes `--agent`, `--task` and `--workspace`. None of those screens named the
 * verb that mints one, and both sit under a DIFFERENT PARENT from
 * `tracks agent`, so the reader cannot even find it by backing up one level —
 * strictly worse than the dead end `task claim` was filed for.
 *
 * ── WHY EVERY POINTER IS ASSERTED BOTH WAYS ──────────────────────────────────
 *
 * Same reasoning as the claim gate, and it is the whole reason this is a test
 * rather than prose: "the help names it" alone goes green over a sentence naming
 * a command that does not exist, and an instruction that refuses in the reader's
 * hands is worse than a visible dead end. "the command resolves" alone goes
 * green over a screen that never mentions it. Both arms, or neither is worth
 * running.
 *
 * ── THE CONTROLS ─────────────────────────────────────────────────────────────
 *
 * Three, and none is decoration:
 *
 *   1. The leaf-walk floor. A broken walk returns nothing, and every `resolves`
 *      arm would then report a perfectly registered command as missing — the
 *      same red a genuine rename gives, pointing at the wrong file.
 *   2. The screens really do still take the flag under test. If `--agent` stops
 *      being required on `event append`, this gate is asserting prose about a
 *      problem that no longer exists and should fail rather than rot.
 *   3. THE TWO SCREENS THAT ALREADY DISCLOSED THE DEFAULT. `diary list` and
 *      `event list` carried the sentence before this change, so they are a
 *      POSITIVE CONTROL ON THE MATCHER ITSELF: if `flatHelpAt` broke, or the
 *      wording drifted, they red alongside the new three and the failure is
 *      legible as "the harness moved", not "the prose regressed".
 *
 *      ⚠️ `event feed` IS DELIBERATELY NOT IN THAT CONTROL, and it was in the
 *      first draft of this file on an assumption that measuring refuted. It has
 *      never carried the sentence, and it is not backed by `clampReadySetLimit`
 *      either — its page size is applied by its own cursor contract. It needs no
 *      such sentence: its help documents the whole walk ("feed nextCursor back
 *      and stop only when it is null", and a full page ALWAYS returns a cursor),
 *      so an undisclosed page size there cannot masquerade as a complete set.
 *      That is the difference this gate is actually about — not the number, but
 *      whether the screen leaves a partial answer readable as a whole one.
 */

/** The exact sentence three screens in this namespace already used. Do not invent a fourth spelling. */
const DEFAULT_LIMIT_SENTENCE = "--limit DEFAULTS TO 50 SERVER SIDE";

/** The verbs that mint and list an agent id. */
const AGENT_MINT_PATH = "tracks agent open";
const AGENT_LIST_PATH = "tracks agent list";

/**
 * The rendered `--help` at a path in the REAL root program, whitespace collapsed.
 *
 * Flattened because help is WRAPPED: commander re-flows prose to the terminal
 * width, so a phrase that is one line in the source arrives split across two
 * with an indent in the middle. A raw `includes` on a multi-word sentence is
 * then a test that passes or fails on column position, which is a gate nobody
 * can keep green on purpose.
 */
function flatHelpAt(path: string): string {
  let node: Command = buildRootProgram();
  for (const segment of path.split(" ")) {
    const next: Command | undefined = node.commands.find(
      (child) => child.name() === segment || child.aliases().includes(segment)
    );
    if (next === undefined) {
      throw new Error(`no command registered at "${path}" — the walk stopped at "${segment}"`);
    }
    node = next;
  }
  return captureHelp(node).replace(/\s+/g, " ");
}

describe("tracks help discloses its page and names the verbs that mint its ids", () => {
  it("CONTROL: the leaf walk found the whole tree, not a fragment", async () => {
    const leaves = await deriveCommandLeaves();

    expect(leaves.length).toBeGreaterThan(400);
  });

  // ── the default-limit disclosure ─────────────────────────────────────────

  it.each([["tracks diary list"], ["tracks event list"]])(
    "CONTROL: `%s` already disclosed the default, so a red here is the matcher, not the prose",
    (path) => {
      expect({ path, discloses: flatHelpAt(path).includes(DEFAULT_LIMIT_SENTENCE) }).toEqual({
        path,
        discloses: true
      });
    }
  );

  it.each([["tracks list"], ["tracks ready"], ["tracks task ready"]])(
    "`%s` discloses that its page defaults to 50 rows server side",
    (path) => {
      // All three are backed by `clampReadySetLimit`, which takes 50 when the
      // flag is absent — so the truncation fires for a caller who passed nothing.
      expect({ path, discloses: flatHelpAt(path).includes(DEFAULT_LIMIT_SENTENCE) }).toEqual({
        path,
        discloses: true
      });
    }
  );

  it.each([["tracks ready"], ["tracks task ready"]])(
    "`%s` says its answer reports a cut page, and points at the footer that shows it",
    (path) => {
      // Both responses carry `hasMore`, read one row past the page, and the
      // footer under the table renders it. The help has to name the footer and
      // not merely the field: the field is what `--json` sees, and the footer is
      // the only place a person does.
      const help = flatHelpAt(path);

      expect({ path, names: help.includes("hasMore"), points: help.includes("footer") }).toEqual({
        path,
        names: true,
        points: true
      });
    }
  );

  it.each([["tracks ready"], ["tracks task ready"]])(
    "`%s` still says it has no total and no cursor, which remains true",
    (path) => {
      // The routes gained a truncation SIGNAL, not a paged surface. Reading the
      // new field as "these are now pageable" is the misread this pins against:
      // there is no total to divide by and no cursor to walk, and `tracks list`
      // stays the paged surface.
      expect({ path, admits: flatHelpAt(path).includes("no total and no cursor") }).toEqual({
        path,
        admits: true
      });
    }
  );

  it("`tracks ready` lists falling off the page among the reasons a track is absent", () => {
    const help = flatHelpAt("tracks ready");

    // The absence list reads as exhaustive, so an omission from it is read as
    // impossible rather than as unlisted.
    expect(help).toContain("ABSENT WHEN IT FELL OFF");
  });

  it("`tracks create` no longer promises the new track is on the next ready page", () => {
    const help = flatHelpAt("tracks create");

    // The claim was true about the PREDICATE and false about the PAGE, and a new
    // track is the single worst case: highest number, ascending sort, last in line.
    expect(help).not.toContain("comes back as ready work on the very next call");
  });

  it("`tracks create` says why the track it just made can be off the first page", () => {
    const help = flatHelpAt("tracks create");

    expect(help).toContain("LAST in line");
  });

  // ── the cursor, and the fields that were already on the wire ─────────────

  it("`tracks list` registers --cursor, so a nextCursor has a flag to go back into", () => {
    // The token has been in the `--json` document since this command shipped and
    // no flag accepted it, which put every track past row 200 out of reach.
    expect(flatHelpAt("tracks list")).toContain("--cursor <cursor>");
  });

  it("CONTROL: `tracks event feed` still registers --cursor", () => {
    // The one tracks read that always had it. If this reds, the option matcher
    // moved rather than the registration.
    expect(flatHelpAt("tracks event feed")).toContain("--cursor <cursor>");
  });

  // ── the id pointers ──────────────────────────────────────────────────────

  it("CONTROL: `tracks event append` really does still require an agent id", () => {
    expect(flatHelpAt("tracks event append")).toContain("--agent <agentId>");
  });

  it("CONTROL: `tracks diary append` really does still take the three ids", () => {
    const help = flatHelpAt("tracks diary append");

    expect({
      agent: help.includes("--agent <agentId>"),
      task: help.includes("--task <taskId>"),
      workspace: help.includes("--workspace <workspaceId>")
    }).toEqual({ agent: true, task: true, workspace: true });
  });

  it.each([
    ["tracks event append", AGENT_MINT_PATH],
    ["tracks event append", AGENT_LIST_PATH],
    ["tracks diary append", AGENT_MINT_PATH],
    ["tracks diary append", AGENT_LIST_PATH],
    ["tracks diary append", "tracks task list"],
    ["tracks diary append", "workspace list"]
  ])("`%s` names `nexus %s` as the source of an id it takes", (screen, target) => {
    // The full invocation as a reader would type it. Asserting the bare path
    // would be satisfied by the words turning up in unrelated prose.
    expect({ screen, target, named: flatHelpAt(screen).includes(`nexus ${target}`) }).toEqual({
      screen,
      target,
      named: true
    });
  });

  it.each([[AGENT_MINT_PATH], [AGENT_LIST_PATH], ["tracks task list"], ["workspace list"]])(
    "and `nexus %s` resolves to a command this CLI registers",
    async (target) => {
      const leaves = new Set(await deriveCommandLeaves());

      expect({ target, registered: leaves.has(target) }).toEqual({ target, registered: true });
    }
  );
});
