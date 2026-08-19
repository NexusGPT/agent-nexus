import assert from "node:assert/strict";

import { Command } from "commander";
import { beforeAll, test } from "vitest";

import {
  BLOCKED_DESCRIPTORS,
  UNCONTRACTED_NAMESPACES
} from "../../src/commands/contract-help.namespaces";
import {
  auditBlockedDescriptors,
  BLOCKED_REASONS,
  type BlockedAudit,
  censusNamespaces,
  renderAudit
} from "./contract-blocked-audit";

/**
 * THE GATE OVER `BLOCKED_DESCRIPTORS` — a refusal must be true TODAY, not on the
 * day somebody typed it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS FOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The reason a v1 descriptor is not bound to a command used to be English prose
 * in a docblock, checked by nothing. That is not a documentation problem — it is
 * why the taxonomy went wrong. One sentence in it ("commander validates
 * `.choices()` on options only") was never measured, is false, and cost FOUR
 * descriptors their binding: their enums reached the operator as a `Notes:`
 * paragraph and were checked by nothing until the server answered.
 *
 * `BLOCKED_DESCRIPTORS` made the reason a value. This file makes it a CHECKED
 * value, which is the larger half:
 *
 *   · an unknown reason is a COMPILE error, from the union;
 *   · a reason the union gained and this file never learned is also a COMPILE
 *     error, from `_UnhandledReason` in the audit module;
 *   · a descriptor a leaf calls that is neither bound nor blocked is RED;
 *   · a refusal whose `unreachable` paths have BECOME reachable is RED, which is
 *     the arm that would have caught the four.
 *
 * The whole audit is one function, and `contract-blocked-audit.ts` is executable,
 * so the census on a terminal and the gate in the suite cannot drift:
 *
 *     pnpm --filter @agent-nexus/cli exec tsx test/unit/contract-blocked-audit.ts
 *
 * ⚠️ DELETING A RECORD IS NEVER HOW A RED BUILD IS FIXED. A red says the world
 * moved: bind the descriptor, or correct the record.
 */

let audit: BlockedAudit;

beforeAll(() => {
  audit = auditBlockedDescriptors();
});

test("every descriptor a leaf calls is bound, or blocked with a verified reason", () => {
  assert.deepEqual(audit.violations, [], `\n\n${renderAudit(audit)}\n`);
});

test("the population is real, so no arm above passed over an empty list", () => {
  // THE CONTROL. Arm 1 iterates the population, and an empty loop passes. A tree
  // that failed to build, an SDK scan that resolved nothing, or a contract that
  // yielded no enums would each make this file green over nothing.
  assert.ok(
    audit.population.length > 40,
    `only ${audit.population.length} descriptors in the population — the derivation broke`
  );
  assert.ok(audit.bound.length > 0, "no descriptor in the population is bound");
  assert.ok(BLOCKED_DESCRIPTORS.length > 0, "BLOCKED_DESCRIPTORS is empty");
});

test("the population partitions — nothing is both bound and blocked", () => {
  const both = audit.bound.filter((name) => audit.blocked.includes(name));
  assert.deepEqual(both, [], "a descriptor is bound AND blocked; its record excuses nothing");
});

test("every reason in the ledger is one the audit knows how to check", () => {
  // The compile-time twin of this lives in the audit module. This is the runtime
  // arm, for a ledger reached through a loosened type.
  const unknown = BLOCKED_DESCRIPTORS.filter(
    (entry) => !(BLOCKED_REASONS as readonly string[]).includes(entry.reason)
  ).map((entry) => `${entry.descriptor}: ${entry.reason}`);
  assert.deepEqual(unknown, []);
});

test("every visible namespace is in some list", () => {
  // 🚨 THE HOLE THIS CLOSES IS A NAMESPACE, NOT A DESCRIPTOR, and every other
  // arm in this file is blind to it. The population above is total over the
  // descriptors a leaf CALLS AND THAT DECLARE AN ENUM, so a namespace whose only
  // descriptor declares no enum is examined by nothing.
  //
  // `known-issues` shipped exactly that way: it called `KnownIssuesForRoute`
  // through the SDK, declared no enum, and appeared in no list at all — while
  // the rollout ratio was being quoted as 39/46 against a tree of 47.
  assert.deepEqual(audit.namespaces.unaccounted, [], `\n\n${renderAudit(audit)}\n`);
});

test("the namespace census is real, and its verdict is not vacuous", () => {
  // The control for the arm above. A `visible` list that came back empty, or an
  // `isHiddenCommand` that answered true for everything, would make it green
  // over nothing.
  const { visible, converted, uncontracted, blockedOnly, unaccounted } = audit.namespaces;
  assert.ok(visible.length > 40, `only ${visible.length} visible namespaces — the walk broke`);
  assert.equal(
    converted.length + uncontracted.length + blockedOnly.length + unaccounted.length,
    visible.length,
    "the four buckets do not partition the visible namespaces"
  );
  assert.ok(converted.length > 0 && uncontracted.length > 0 && blockedOnly.length > 0);
});

test("the census FIRES on an unaccounted namespace, and skips a hidden one", () => {
  // Driven against a synthetic tree, because the assertion above can only ever
  // observe the real CLI passing. A gate never seen to fail is not a gate.
  const probe = new Command();
  probe.command("agent"); // in the ledger
  probe.command("upgrade"); // in UNCONTRACTED_NAMESPACES
  probe.command("model"); // accounted for by a BLOCKED_DESCRIPTORS leaf
  probe.command("brand-new-thing"); // in nothing
  probe.command("secret-alias", { hidden: true }); // in nothing, and invisible

  const census = censusNamespaces(probe);
  assert.deepEqual(census.converted, ["agent"]);
  assert.deepEqual(census.uncontracted, ["upgrade"]);
  assert.deepEqual(census.blockedOnly, ["model"]);
  // The hidden one must NOT appear: `upgrade` registers 18 hidden aliases, and a
  // census counting those would be red on a correct tree.
  assert.deepEqual(census.unaccounted, ["brand-new-thing"]);
  assert.ok(!census.visible.includes("secret-alias"));
});

test("every UNCONTRACTED_NAMESPACES record names a command that exists", () => {
  // The opposite rot: a record for a namespace that was renamed or removed
  // excuses nothing and reads exactly like a live one. Asserted through the
  // audit's own violations, so the census and the gate cannot disagree.
  const live = new Set(audit.namespaces.visible);
  const dead = UNCONTRACTED_NAMESPACES.filter((entry) => !live.has(entry.namespace));
  assert.deepEqual(
    dead.map((entry) => entry.namespace),
    []
  );
});

test("the audit's reach is bounded and does not silently shrink", () => {
  // Every arm sees only the leaves whose SDK call resolves to a v1 route. A leaf
  // that stops resolving contributes no descriptor, so it can HIDE one — and the
  // gate would go green while covering less. Reported as a ceiling so a refactor
  // that breaks resolution is loud rather than quietly narrowing.
  assert.ok(
    audit.unresolvedLeaves <= 8,
    `${audit.unresolvedLeaves} leaves name an SDK call this scan cannot resolve to a route; ` +
      `each one can hide an unclassified descriptor`
  );
});
