/**
 * WHAT YOU MAY SCRIPT AGAINST — the stability contract, and the docs pointer.
 *
 * ── THE COMPATIBILITY LINK IS A URL, AND IT HAS TO BE ───────────────────────
 *
 * `COMPATIBILITY.md` is this package's stability contract, and until this block
 * existed the binary never named it. `git grep COMPATIBILITY -- packages/cli/src`
 * is NOT empty — it returns 30 lines across 9 files — and every one of them is a
 * comment, a test description, a test assertion message, a test's own path
 * constant, or a ledger `note` that only a test reads. Not one is a string this
 * program prints, so no help screen, no command and no error led anyone to the
 * document. A promise the tool cannot lead you to is not a promise.
 *
 * 🚨 A REPO-RELATIVE PATH WOULD NAME A FILE NOBODY OUTSIDE THIS REPO CAN OPEN.
 * The product repo the document lives in is private, so `packages/cli/…` is a
 * path only a monorepo checkout can follow. The public mirror named by
 * `repository.url` is where a reader outside this machine opens it, which is
 * why this block spells the whole URL.
 *
 * The URL is not enough on its own, and the second sentence beside it is not
 * decoration. It points at branch `main` — the NEWEST contract — while the
 * reader is holding whatever version they installed, and it needs a network at
 * the exact moment someone is debugging a script. So `package.json` names
 * `COMPATIBILITY.md` in `files` too, and the document is on disk in every
 * install, at the version that install actually promises.
 *
 * Two specs hold the two halves. {@link compatibility-link-is-in-root-help.test.ts}
 * pins the link to that `repository` field, so moving the mirror fails rather
 * than rotting. {@link compatibility-ships-in-the-tarball.test.ts} asks npm what
 * it would publish, so the shipped copy disappearing fails rather than rotting.
 */
export const ROOT_EPILOGUE_COMPATIBILITY = `  WHAT YOU MAY SCRIPT AGAINST
    NOT EVERY PART OF THIS SURFACE IS PROMISED. Four tiers — STABLE, EVOLVING,
    UNSTABLE and INTERNAL — say which parts you may build on, which ones move,
    and what counts as a breaking change for each. A field name you read out of
    a --json payload is not covered by the same promise as the command that
    printed it. Read the contract before you script any of it:
    https://github.com/NexusGPT/agent-nexus/blob/main/packages/cli/COMPATIBILITY.md
    That page is branch main, so it is the newest contract and not necessarily
    the one this build promises. The copy that shipped with the version you are
    running is on disk, as COMPATIBILITY.md beside this package's package.json.

  Tip: Run "nexus docs" for full documentation, gotchas, and recipes.
       Run "nexus docs <topic>" for a specific section (overview, commands, gotchas, input-output, recipes).`;
