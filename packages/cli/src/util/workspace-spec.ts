/**
 * `<slug>[:<folder>]` — THE ONE PARSE OF A WORKSPACE PATH SPEC.
 *
 * `workspace pull` and `workspace push` take the same argument shape from
 * opposite ends: `pull` reads a SOURCE out of a workspace, `push` writes to a
 * DESTINATION in one. Both split on the FIRST colon, normalise the folder half
 * by dropping empty segments, and leave the slug half untouched.
 *
 * ── WHY THE FIRST COLON AND NOT THE LAST ─────────────────────────────────────
 *
 * The slug is the fixed part and the folder is the free-form part, so a colon
 * inside a folder name belongs to the folder. `indexOf` gives that; `lastIndexOf`
 * would move the boundary whenever a user typed one, and it would do it silently
 * — `a:b:c` would resolve the workspace `a:b` rather than the folder `b:c`, and
 * the refusal would name a workspace nobody asked for.
 *
 * ── WHY EMPTY SEGMENTS ARE DROPPED ───────────────────────────────────────────
 *
 * `slug:`, `slug:/`, `slug://a//b/` and `slug:a/b` are all the caller meaning the
 * same place. Splitting on `/`, discarding the empties and re-joining normalises
 * every one of them to `""` or `a/b`, so the remote path this is joined onto can
 * never carry a doubled or trailing separator.
 *
 * 🚨 THE TWO CALLERS NAME THE SECOND FIELD DIFFERENTLY ON PURPOSE, AND THAT IS
 * WHY THIS RETURNS A NEUTRAL NAME. `pull` calls it the `folder` it reads from and
 * `push` calls it the `prefix` it writes under. Those are the same string and two
 * true descriptions of it, so each caller keeps its own word at its own boundary
 * and the parse keeps neither.
 */

/** A workspace path spec, split. `folder` is `""` when the spec named no folder. */
export interface WorkspaceSpec {
  /** The workspace slug — everything before the first colon, verbatim. */
  readonly slug: string;
  /** The folder inside it, normalised: no leading, trailing or doubled `/`. */
  readonly folder: string;
}

/** Split `<slug>` or `<slug>:<folder>` into its two halves. */
export function parseWorkspaceSpec(spec: string): WorkspaceSpec {
  const colon = spec.indexOf(":");
  if (colon === -1) return { slug: spec, folder: "" };
  const folder = spec
    .slice(colon + 1)
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("/");
  return { slug: spec.slice(0, colon), folder };
}
