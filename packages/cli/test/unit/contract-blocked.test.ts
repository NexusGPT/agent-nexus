import assert from "node:assert/strict";
import { before, test } from "node:test";

import { BLOCKED_DESCRIPTORS } from "../../src/commands/contract-help.namespaces";
import {
  auditBlockedDescriptors,
  BLOCKED_REASONS,
  type BlockedAudit,
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

before(() => {
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
