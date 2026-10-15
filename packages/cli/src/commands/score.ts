import { type Command } from "commander";

import { registerScoreListCommand } from "./score/list.command";
import { registerScoreRecordCommand } from "./score/record.command";

/**
 * `nexus score` — attach a measured value to a scorable entity, and read one
 * entity's scores.
 *
 * ## Two verbs, and the missing ones are missing on purpose
 *
 * `record` and `list`. There is no `update`, no `delete` and no
 * organization-wide scan, because the public contract declares no such route:
 * the store is append-only from out here. A wrong score is superseded by a later
 * one rather than edited, and `list` returns both with the newer first.
 *
 * ## 🔴 `--value-type` DECIDES WHICH VALUE FLAG IS LEGAL
 *
 * A score carries exactly one value shape. `NUMERIC` takes `--numeric-value`,
 * `CATEGORICAL` takes `--categorical-value`, `BOOLEAN` takes `--boolean-value`,
 * and any other pairing is refused HERE rather than sent. That mirrors the
 * database's own `Score_value_matches_type_chk` constraint, so the CLI cannot
 * put a row on the wire the column would reject.
 *
 * The refusal is local and deliberate: sending a mismatched pair would answer
 * 400 with a Zod path, which is a worse message than naming the flag the caller
 * should have used.
 *
 * ## 🔴 YOU CANNOT SET THE EMITTER TYPE
 *
 * Every score recorded through the public API is stamped `CUSTOM_KPI`
 * server-side, so there is no `--emitter-type` flag to look for. An external
 * caller cannot forge an `EVAL_JUDGE` or `CSAT` score and have analytics count
 * it as one. Reads DO report `emitterType`, so provenance stays visible.
 *
 * ## An empty list is not proof the entity exists
 *
 * `list` is anchored on the API key's organization, so an entity in another
 * organization matches no rows and answers `[]` — the same answer a real entity
 * with no scores gives. The two are deliberately indistinguishable and the
 * Notes below say so, because reading `[]` as "this entity is unscored" is the
 * one mistake this surface invites.
 */
export function registerScoreCommands(program: Command): void {
  const score = program.command("score").description("Record and read scores on scorable entities");

  registerScoreRecordCommand(score, program);
  registerScoreListCommand(score, program);
}
