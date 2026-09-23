import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { shrinkOnlyLedger } from "@nexus/types/testing/shrink-only-ledger";
import { describe, expect, it } from "vitest";

import { deriveIdGraph } from "./id-graph";
import { leafResidueFor } from "./id-graph.leaf-residue";
import type { ExcludedLeaf } from "./id-graph.model";
import { ID_GRAPH_UNCOVERED } from "./id-graph.uncovered.generated";

/**
 * THE RATCHET. Coverage may improve without ceremony and may not decay quietly.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS GOES THROUGH `shrinkOnlyLedger` RATHER THAN A HAND-ROLLED SWEEP
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This file WAS hand-rolled, and it carried two of the exact shapes that helper
 * exists to make unwritable:
 *
 *   · `expect(ID_GRAPH_UNCOVERED.length).toBeGreaterThan(0)` — an anti-vacuity
 *     control that DIES ON SUCCESS. The day the last unreachable leaf is bound,
 *     the ledger empties and this gate fails, so the person finishing the
 *     cleanup deletes the gate. The control has to sit on a population that
 *     SURVIVES the cure, which is why {@link drainProof} below is the leaves
 *     that take an id rather than the ones that cannot be reached.
 *   · a STALENESS ARM — "a ledger row naming a leaf that is no longer uncovered
 *     must be deleted". That is a lower bound on draining data: it reds the
 *     build on the very act of landing a `bindCommand`, until the ledger is
 *     regenerated in the same edit. Every parallel drain became a conflict with
 *     a red attached. A row left behind after a cure is harmless residue and is
 *     now allowed to sit there; the ceiling is what stops the class growing.
 *
 * The cost of dropping the staleness arm, stated rather than discovered: a leaf
 * that is cured and later goes uncovered again is re-admitted silently, because
 * its row never left. That is a real hole and it is the cheaper of the two — the
 * arm that closed it refused correct work every time anybody fixed anything.
 *
 * ⚠️ ONE ROW KIND IS EXEMPT FROM THAT TRADE, AND THE LAST `it` IN THIS FILE IS
 * THE SCOPED ARM — `declared-unsweepable`, whose leaves are ALREADY bound, so
 * the cure that makes every other row stale cannot touch them. Its own docblock
 * carries the measurement.
 */

/** The ledger's keys, in the order it holds them. */
const LEDGER_KEYS = ID_GRAPH_UNCOVERED.map(([path]) => path);

/** `path -> why`, for the row check below. */
const LEDGER_REASONS = new Map<string, string>(ID_GRAPH_UNCOVERED);

/** Every reason the derivation can produce. A row naming anything else is malformed. */
const KNOWN_REASONS = new Set([
  "unbound-no-provable-method",
  "bound-but-mutates",
  "positional-not-a-path-param",
  "requires-an-option-we-cannot-supply",
  "declared-unsweepable"
]);

/**
 * The one reason whose protection is a hand-written DECLARATION rather than a
 * fact the derivation reads off the tree.
 *
 * 🚨 TYPED, NEVER JUST SPELLED. A bare string literal here is a census key, and
 * the day somebody renames this reason in `id-graph.model.ts` the filter below
 * matches nothing, reports no offenders and goes GREEN over a population it can
 * no longer see — an "it is empty" assertion satisfied by a census that cannot
 * fire. Annotating it with the union moves that failure into `pnpm typecheck`,
 * where it is a compile error on this line instead of a silent zero.
 */
const DECLARED_UNSWEEPABLE: ExcludedLeaf["why"] = "declared-unsweepable";

const graph = deriveIdGraph();

/**
 * The population that does NOT empty when this class is cured.
 *
 * Every leaf taking a required id stays in it whether or not it is reachable —
 * curing one moves it OUT of the findings and it remains here. A floor on this
 * cannot be tripped by fixing anything, which is exactly what a floor on the
 * ledger could.
 */
const drainProof = {
  name: "leaves that take at least one required id",
  keys: [...graph.threadable.map((leaf) => leaf.path), ...graph.excluded.map((leaf) => leaf.path)]
};

const gate = shrinkOnlyLedger({
  population: "leaves that take a required id and cannot be reached by the id-thread sweep",
  findings: graph.excluded,
  keyOf: (leaf) => leaf.path,
  ledgerKeys: LEDGER_KEYS,
  // 🚨 A LITERAL, EQUAL TO THE LEDGER IT BOUNDS — never `LEDGER_KEYS.length`,
  // which would bound the ledger by itself and permit unlimited growth in
  // silence. Raising it is the one edit that lets this class grow, and it
  // cannot be made without being seen.
  //
  // 338 -> 339 for `tracks task why-not-ready`, and the binding remedy is
  // genuinely unavailable to it rather than merely unwritten: it COMPOSES three
  // reads (ready set, plan, edges) and maps to no single route, so there is no
  // contract to bind it to and `bindCommand` could only name one of the three.
  // Its own docblock in `commands/tracks/task/why-not-ready.command.ts` states
  // that as a deliberate design decision, made before this gate existed. It is
  // not `declared-unsweepable`
  // either — it is perfectly callable given a real trackId, so a
  // `id-graph.leaf-residue.ts` row would claim something false about it.
  //
  // 339 -> 340 for `role set-system-lifecycle`, classified `bound-but-mutates`.
  // It IS bound — `bindCommand` names `RolesTransitionSystemLifecycle`, so the
  // remedy the other rows lack is already applied — and it stays unsweepable for
  // the reason that classification exists: the sweep calls what it reaches, and
  // this call moves a Role's published coverage figure. There is no read-only
  // form of it to call instead. A row here is the honest place for that, not a
  // `declared-unsweepable` entry, which would claim it cannot be reached.
  //
  // 340 -> 319: system B's eval namespace and its 21 unreachable id-taking
  // leaves left the tree when it was deleted outright (Prompt Lab phase 0).
  //
  // 319 -> 317: `document get` and `document children` were bound to their v1
  // descriptors, so their `GET` is provable and both are threadable AND fully
  // resolved — `document list` serves the `:documentId` each takes, by the
  // route-prefix rule and with no residue.
  //
  // 🚨 A BINDING CLEARS A ROW ONLY FOR AN UNCONDITIONAL READ, AND THE `document`
  // NAMESPACE SHOWS ALL THREE OUTCOMES AT ONCE. Eight rows, one remedy:
  //
  //   · `get`, `children`      — bound, swept, rows GONE. 2 of 8.
  //   · `preview`, `download`  — bound, and `declared-unsweepable`. Both route
  //     through one `if (!document.storageUrl) throw new NotFoundException`, so
  //     they 404 for every folder, text document and crawled page — which
  //     `document list` lists and the sweep threads, because it takes the FIRST
  //     row. Binding them without declaring them would have reddened this
  //     GATING check on ordinary tenant data. See `id-graph.leaf-residue.ts`.
  //   · `upload`, `update`, `delete`, `reprocess` — POST/PATCH/DELETE/POST.
  //     Binding makes the method provable and moves them to
  //     `bound-but-mutates`: a truer reason and the same excluded row.
  //
  // So "N rows blocked on a missing `bindCommand`" is true of an UNCONDITIONAL
  // READ and false of the other two thirds. The reason column is what separates
  // them — never the count.
  //
  // 317 -> 316: `agent-skill list` was bound to `AgentSkillList`, so its `GET` is
  // provable and `agent list` serves its `:agentId` by the route-prefix rule with
  // no residue — threadable AND fully resolved.
  //
  // 🚨 IT IS THE ONLY ONE OF THIS NAMESPACE'S SEVEN THAT A BINDING CLEARS, AND THE
  // OTHER SIX ARE NOT MERELY UNROLLED — five of them would go green on a WRONG
  // producer. They all take `:skillId`, and the param-name rule resolves that to
  // `tool skills` (`GET /public/v1/tools/skills`), the marketplace catalogue.
  // Binding one lands it in `executable` with an id the route 404s on, which reds
  // `CLI: Sweep` on real tenant data rather than adding a row here. The mechanism,
  // and the measurement, are at the `bindCommand` calls in `commands/agent-skill.ts`
  // — one copy, beside the code that would do it.
  //
  // 316 -> 317 for `apps starter <dir>`, classified `unbound-no-provable-method`.
  // Its required positional is a LOCAL directory path, not an id: no producer
  // can serve it and nothing threads into it. `bindCommand` cannot apply — the
  // route is `GET /api/vibe/app-starter`, a blob download outside
  // `/api/public/v1`, so there is no v1 descriptor to bind. And the sweep must
  // not run it regardless: its effect is to write a directory on the machine
  // running the sweep. Same shape as `apps create <name>`, which sits here too.
  //
  // 317 -> 322 for the five `apps domains` leaves (add, list, primary, remove,
  // verify), each `unbound-no-provable-method`. Every one of them talks to
  // `/api/vibe/apps/:appId/domains…` or `/primary-domain` — internal `ZVibe`
  // routes outside `/api/public/v1`, so there is no v1 descriptor for
  // `bindCommand` to take, which is why every other `apps` leaf that takes an
  // app id sits here too. `list` is the only read, and the sweep has no producer
  // for a Vibe app id to thread into it; the other four write.
  //
  // 322 -> 323: `workspace push` binds `WorkspaceUploadBatch`, a `POST` — so the
  // binding proves it MUTATES, which is why it sits here as bound-but-mutates
  // and not in `executable`. The row is the correct residue of a bound write,
  // not a missing binding.
  //
  // 323 -> 325: `workspace revert` binds `WorkspaceRevert`, a `POST`, so it is
  // bound-but-mutates for the same reason as `push`; `workspace history` binds
  // `WorkspaceFileHistory`, a `GET`, but its required positional is a FILE
  // PATH and the route's only path param is the slug — so the sweep has no id
  // it could thread through it (positional-not-a-path-param). Both rows are
  // the correct residue, not missing bindings.
  ceiling: 325,
  remedy:
    "Add a `bindCommand(...)` call to the leaf so its HTTP method is provable, or declare it " +
    "in `id-graph.leaf-residue.ts` with the refusal verbatim. Regenerating the ledger " +
    "(`pnpm --filter @agent-nexus/cli run gen:id-graph-ledger`) writes the gap in permanently " +
    "and is NOT the fix.",
  drainProofControl: drainProof,
  rowCheck: {
    name: "names a reason the derivation can actually produce",
    offender: (key) => {
      const reason = LEDGER_REASONS.get(key);
      return reason !== undefined && KNOWN_REASONS.has(reason)
        ? null
        : `${key} -> ${String(reason)}`;
    }
  }
});

describe("the uncovered ledger", () => {
  // `gate.checks` is the GATE's OWN checks, not the ledger — it is derived by
  // `shrinkOnlyLedger` and documented never-empty, so driving `.each` over it is
  // safe at any ledger size in a way the ledger itself is not.
  //
  // 🚨 IT IS STILL WRAPPED, and the wrapper is not belt-and-braces. An empty
  // table here would register ZERO tests and report the file PASSED, and
  // "never empty" is a promise made by a function in another package rather
  // than something this file can see. `eachOrRefuse` is the right wrapper
  // precisely because this population is DERIVED: if it ever empties, the
  // helper broke, which is the case it exists to refuse. The ledger sweeps
  // below use an offender array instead, because THEIR empty state is success.
  it.each(eachOrRefuse(gate.checks, "the shrink-only ledger gate's own checks"))(
    "$name",
    ({ actual, expected, message }) => {
      expect(actual, message).toEqual(expected);
    }
  );

  /**
   * The ledger must agree with the derivation about WHY each leaf is uncovered.
   *
   * One `it` collecting offenders, never `.each` over the ledger: an empty
   * ledger is the SUCCESS state here, and an empty `.each` table fails
   * collection in jest and registers zero tests in vitest.
   */
  it("agrees with the derivation about why each leaf is uncovered", () => {
    const disagreements = graph.excluded
      .filter((leaf) => LEDGER_REASONS.has(leaf.path) && LEDGER_REASONS.get(leaf.path) !== leaf.why)
      .map(
        (leaf) =>
          `${leaf.path}: ledger says ${String(LEDGER_REASONS.get(leaf.path))}, derivation says ${leaf.why}`
      );

    expect(disagreements, "Regenerate the ledger once the change is what you meant.").toEqual([]);
  });

  /**
   * 🔴 THE ONE KIND OF ROW WHOSE PROTECTION CAN BE *DELETED*, AND WHOSE DELETION
   * NOTHING ELSE IN THIS REPOSITORY NAMES.
   *
   * Every other reason in this ledger is a fact the derivation reads: unbind a
   * leaf and it is `unbound-no-provable-method` again, point it at a `POST` and
   * it is `bound-but-mutates`. `declared-unsweepable` is the exception — the leaf
   * is a bound `GET` with every input satisfiable, and the ONLY thing keeping it
   * out of the sweep is a hand-written row in `id-graph.leaf-residue.ts`. Delete
   * that row and the leaf walks straight back into the executable set, where the
   * refusal it was declared for becomes a FAILED row on `CLI: Sweep`.
   *
   * ⚠️ THE TREE IS NOT SILENT ON IT AND THAT IS *WORSE* THAN SILENCE, WHICH IS
   * WHY THIS ARM IS ABOUT NAMING RATHER THAN ABOUT DETECTION. Measured on this
   * commit, the five declarations that can be dropped individually: every one
   * moves `executable` 29 -> 30, and the four hand-written figures in
   * `test/id-thread/id-thread-sweep.test.ts`'s `the provisioned floor` red on the
   * new number. But those four red IDENTICALLY when a `bindCommand` LANDS and
   * coverage genuinely grows, which is the outcome this whole harness exists to
   * drive toward — that spec's own docblock says so: "a leaf added to the graph
   * then reds these cases by NAME with the new figure". Their four messages name
   * only FIGURES and never the leaf, so the two causes are indistinguishable at
   * that red, and the cure a reader reaches for is right for growth and ships
   * this.
   *
   * 🔴 AND THEY ARE A COUNT DETECTOR RATHER THAN A HAZARD DETECTOR, WHICH ONE
   * COMPOSITE SETTLES. Drop `document preview`'s declaration AND unbind
   * `document children`: the first adds a leaf to `document list`'s fed set and
   * to `executable`, the second takes both back, so every figure in that spec is
   * unchanged and all four pins stay GREEN with the declaration gone. Measured —
   * `test/id-thread/id-thread-sweep.test.ts` passed entirely, and the only two
   * reds in the package were in THIS file: the subset arm naming
   * `document children` and this arm naming `document preview`.
   *
   * ✅ SO THE ARM IS SCOPED TO ONE REASON, AND THAT SCOPE IS WHAT MAKES IT FREE.
   * The general staleness arm this file removed was a lower bound on draining
   * because the ordinary cure — landing a `bindCommand` — makes a row stale. It
   * cannot make one of THESE stale: they are already bound. The only edits that
   * red this are deleting a declaration and deleting the leaf, and both have the
   * same one-command remedy, printed below.
   *
   * ⚠️ VACUOUS AT ZERO, ON PURPOSE. The day the last unsweepable leaf becomes
   * sweepable, this population empties and the arm asserts over nothing — which
   * is correct, because there is no longer a declaration to protect. That is the
   * same call `id-graph.test.ts` makes about sweeping `LEAF_RESIDUE` itself, and
   * it is the reason the reason string is TYPE-pinned above: the failure to fear
   * is not the class draining, it is the census going blind while the class is
   * still there.
   */
  it("keeps a declaration behind every `declared-unsweepable` row", () => {
    const undeclared = ID_GRAPH_UNCOVERED.filter(([, why]) => why === DECLARED_UNSWEEPABLE)
      .map(([path]) => path)
      .filter((path) => leafResidueFor(path) === undefined);

    expect(
      undeclared,
      "A `declared-unsweepable` row names a leaf `id-graph.leaf-residue.ts` no longer declares, " +
        "so nothing is keeping it out of the id-thread sweep any more and its refusal becomes a " +
        "FAILED row on `CLI: Sweep`, a gating check, against ordinary tenant data. " +
        "If the refusal really was fixed upstream: delete the declaration, regenerate " +
        "(`pnpm --filter @agent-nexus/cli run gen:id-graph-ledger`) and lower the `ceiling` above " +
        "in the same diff. Restoring the number in `test/id-thread/id-thread-sweep.test.ts` is " +
        "NOT the fix — those figures move for a landed `bindCommand` too."
    ).toEqual([]);
  });
});
