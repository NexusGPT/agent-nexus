/**
 * THE DRIFT GATE for `wire.ts`.
 *
 * The CLI publishes standalone, so the CLI skills wire shapes are hand-declared
 * there. This module compares each against the contract in `@nexus/types` and
 * exists only to be compiled: every assertion is a `const` typed `true` when the
 * shapes agree and a descriptive tuple when they do not, so `pnpm typecheck`
 * names the field that drifted.
 *
 * Equality in BOTH directions, unlike `admin-wire-types.conformance.ts`, which
 * lets the CLI hold a field more loosely. These shapes decide what reaches a
 * user's disk, so a copy that is looser than the contract is a copy that would
 * accept a response the server can never send.
 *
 * `src/index.ts` cannot reach this module, so the `@nexus/types` import below
 * never enters `dist/`; `vibe-wire-types.test.ts` asserts that for every module
 * the binary can reach.
 */

import type { CliSkillsCorpus, CliSkillsManifest } from "@nexus/types";

import type { CliSkillsCorpusWire, CliSkillsManifestWire } from "./wire";

type Same<Label extends string, Cli, Contract> = [Cli] extends [Contract]
  ? [Contract] extends [Cli]
    ? true
    : [Label, "declares a field the contract lacks, or types one more narrowly"]
  : [Label, "lacks a field of the contract, or types one more loosely"];

export const MANIFEST_AGREES: Same<
  "CliSkillsManifestWire",
  CliSkillsManifestWire,
  CliSkillsManifest
> = true;

export const CORPUS_AGREES: Same<"CliSkillsCorpusWire", CliSkillsCorpusWire, CliSkillsCorpus> =
  true;
