/**
 * DECLARED DISPOSITIONS, `tracks ready` … `tracks task edges`.
 *
 * ONE SLICE of the single table `./command-classification.ts` assembles. DATA,
 * and nothing else: one `"<path>": "<disposition>"` line per leaf, held in the
 * order the table has always carried them, so which slice a leaf sits in is
 * invisible to every reader of `COMMAND_CLASSIFICATION`.
 *
 * WHAT BELONGS HERE: a leaf whose path falls inside the span above, with a
 * comment where its disposition is surprising. The promotion rules live on
 * `COMMAND_CLASSIFICATION` itself, so there is exactly one copy of them.
 *
 * WHAT DOES NOT: logic of any kind, and no second table —
 * `./sweep-expected-skips.ts` answers what one ENVIRONMENT does, which is a
 * different question from what may be done with a leaf.
 *
 * ⚠️ FILING A LEAF IN THE WRONG SLICE COSTS TIDINESS AND NOTHING ELSE, because
 * the assembler unions them. DECLARING ONE LEAF IN TWO SLICES THROWS, and that
 * refusal is what replaces the `ts(1117)` a single object literal used to get
 * from the compiler for free.
 */

import type { CommandDisposition } from "./disposition";

/** 20 leaves, `tracks ready` … `tracks task edges`. */
export const TRACKS_CORE: Readonly<Record<string, CommandDisposition>> = {
  // ── tracks ─────────────────────────────────────────────────────────────────
  // TWO LEAVES HERE ARE `safe`, AND THE RATIO IS THE DOMAIN RATHER THAN CAUTION.
  // `tracks ready` and `tracks list` are the swept ones: almost every other read
  // is scoped to a track or a task the sweep has no id for, and every write
  // changes a plan. A sweep that ran those would be authoring work items.
  //
  // `GET /public/v1/tracks/ready` answers 200 on staging, so `tracks ready` is
  // `safe` and the sweep watches it. It is `safe` rather than
  // `safe-with-fixture` deliberately: staging holds no ready tracks, so the
  // route answers `{"tracks":[]}`, and `--require-non-empty` scores that EMPTY
  // and FAILs. An empty list is the correct answer here — this leaf proves the
  // route is alive and shaped like JSON, never that any item exists.
  //
  // 🔴 WHEN A LEAF'S ROUTE IS NOT ON STAGING YET, THE DISPOSITION IS THE LEVER —
  // NEVER `sweep.sh`'s SKIP MATCH. A 404 from a route that used to exist is
  // exactly the regression the sweep exists to catch, and a SKIP wide enough to
  // swallow one blinds it to every deleted route. Park such a leaf
  // `registration-only`, and write the flip-back as a RULE carrying its probe,
  // never as a note about somebody's intention to remember:
  //
  //   THIS LEAF IS `registration-only` WHILE <ROUTE> ANSWERS 404 ON STAGING,
  //   AND `safe` ONCE IT ANSWERS 200.
  //
  // The probe has to NAME THE HOST. `auth login --env` recognises only `dev`
  // and `production` — a named pair of localhost ports, not the `NEXUS_ENV`
  // map — and a `--profile staging` is local config no checkout ships, so a
  // probe written either way runs for whoever made one and nobody else. This
  // is why the sweep workflow sets `NEXUS_BASE_URL` explicitly:
  //
  //   NEXUS_API_KEY=<a staging key> NEXUS_BASE_URL=https://api-staging.gpt.nexus \
  //     pnpm exec tsx src/index.ts api GET <path AFTER /api/public/v1>
  //
  // 🚨 THE PATH IS THE SUFFIX, AND THE TWO FULLER SPELLINGS ARE REFUSED BEFORE
  // ANY REQUEST LEAVES THE MACHINE. `api` prepends `/api/public/v1` and rejects
  // an argument that repeats it: both the spelling this module stores in
  // {@link SweepPendingDeployRoute.route} (`/api/public/v1/<noun>`) and the one
  // the v1 contract uses (`/public/v1/<noun>`) exit 5 with
  // `CLI_INVALID_ARGUMENTS`. So a probe written with either — which is what
  // substituting a route from this file produces — reports a non-200 having
  // never reached staging, and that is INDISTINGUISHABLE from the route still
  // being absent. It parks the leaf for ever, and the control below cannot
  // catch it, because the control is refused in exactly the same way. Pass
  // `/<noun>`.
  //
  // Read the STATUS, and carry a control — a neighbouring path that must answer
  // 404, so a probe that would report 200 for anything is caught before it
  // decides a disposition.
  //
  // A note without a probe does not fire, because nothing about it can.
  //
  // On 200, change the value and move the TWO artifacts a disposition feeds:
  // `pnpm run gen:cli-surface` (each row carries its disposition, and the
  // header census with it) and `COMPATIBILITY.md`'s `classified safe` count,
  // which is a published figure a test derives. `gen:json-shape` reads the
  // contract rather than this table, so a flip leaves it untouched —
  // `gen:json-shape --check` says so without writing. A `src/**` change here
  // also needs a changeset naming `@agent-nexus/cli`.
  //
  // Leaving a leaf parked once its route answers is a read-only leaf the sweep
  // has stopped watching, which is the silent half of this disposition rather
  // than a tidy backlog item.
  "tracks ready": "safe",
  // A read that needs no argument and whose route answers 200 on staging, so the
  // sweep runs it. `safe` rather than `safe-with-fixture`: nothing seeds tracks,
  // so an organisation holding none answers `{"tracks":[]}`, and that is a
  // correct answer — this leaf proves the route is alive and shaped like JSON,
  // never that any track exists.
  "tracks list": "safe",
  // A mutation. Every one of the three creates or rewrites a row, so the sweep
  // proves they are REGISTERED and never runs them — `tracks rollup` is the one
  // read among them and it still needs a track id, which the sweep has none of.
  "tracks create": "registration-only",
  "tracks current-step": "registration-only",
  // Both write a column the ready set publishes, so both are mutations. The
  // status write is also how a track ENDS, which is the last thing a sweep
  // should perform against a live organization.
  "tracks set-status": "registration-only",
  // A MUTATION, and the one that takes a track OUT of the ready set entirely.
  // `registration-only` permanently, and for a reason no route status can lift:
  // the sweep must never archive a real track. There is no probe that promotes
  // this leaf.
  "tracks archive": "registration-only",
  "tracks set-next-owner": "registration-only",
  // A read, and still existence-only: it takes a track id and the sweep has
  // none. Same reasoning as `tracks rollup` below.
  "tracks get": "registration-only",
  "tracks rollup": "registration-only",
  "tracks dependency add": "registration-only",
  "tracks section create": "registration-only",
  "tracks section rename": "registration-only",
  "tracks section list": "registration-only",
  "tracks task ready": "registration-only",
  "tracks task list": "registration-only",
  "tracks task get": "registration-only",
  // A MUTATION, so existence only. It also OVERWRITES a claim another agent
  // holds, by design, which is the last thing a sweep should run for real.
  "tracks task claim": "registration-only",
  "tracks task toggle": "registration-only",
  "tracks task edge": "registration-only",
  "tracks task edges": "registration-only"
};
