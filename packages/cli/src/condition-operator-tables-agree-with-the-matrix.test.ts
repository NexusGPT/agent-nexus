import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CONDITION_OPERATOR_NAMES,
  FIELD_TYPES_BY_CONDITION_OPERATOR,
  OFFERED_CONDITION_PAIR_COUNT
} from "./condition-operator-compatibility.conformance";

/**
 * EVERY OPERATOR-BY-FIELD-TYPE TABLE THIS REPOSITORY SHIPS, HELD AGAINST THE ONE
 * DECLARATION — CELL BY CELL.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT, WHICH IS SILENT IN BOTH DIRECTIONS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `CONDITION_OPERATORS` answers *is this a real operator*, and the v1 write doors
 * enforce it. Nothing answers *is this operator meaningful for this field type*,
 * and that second failure has no observable at all: a real operator on the wrong
 * `field.type` is written, stored, and read back byte-identical, and then
 * evaluates to a CONSTANT. The branch takes one path for ever. No request,
 * response, status code, execution record or log line says so.
 *
 * Both tables below shipped a row reading "all types", and eight of the cells
 * that row licensed are constant — measured by executing the evaluator, in
 * `condition-operator-matrix-agrees-with-the-evaluator.spec.ts`:
 *
 *   number x is_empty  -> NEVER      number x not_empty  -> ALWAYS
 *   boolean x is_empty -> NEVER      boolean x not_empty -> ALWAYS
 *   object x equals    -> NEVER      object x not_equals -> ALWAYS
 *   array x equals     -> NEVER      array x not_equals  -> ALWAYS
 *
 * ── WHY A GATE HERE AND NOT A DERIVATION ────────────────────────────────────
 *
 * The estate's cure for a document that restates a fact is to INTERPOLATE it —
 * `branching.guide.ts` builds its operator list out of `CONDITION_OPERATORS`, so
 * a partial list is not expressible. That cure is unavailable for both documents
 * below, for different reasons, and neither is fixable from this repository:
 *
 *   · The bundled skill guide is MARKDOWN IN ANOTHER REPOSITORY.
 *     `packages/cli/src/skills-content.generated.json` is a verbatim copy of
 *     `NexusGPT/claude-code-skills-nexus` at the sha in `skills-nexus.lock`.
 *     Nothing in that repository builds, so nothing there can import a
 *     TypeScript constant from this one. The table can only be checked at the
 *     moment the copy enters this tree — which is exactly when the pin moves,
 *     and exactly when this file runs.
 *   · The academy page is PUBLISHED PROSE. `sync-docs-to-zero-entropy.ts` pushes
 *     `content/docs/**` to the customer-facing index, and its table carries a
 *     plain-English description per row that no projection could write.
 *
 * A table is not a sentence, and that is the whole reason this gate is possible
 * where the sibling problem (a CARDINALITY inside a sentence) needed derivation
 * instead. A table has addressable cells, so it can be compared.
 *
 * ── WHY THIS FILE IS IN `packages/cli/src/` ─────────────────────────────────
 *
 * 🚨 PLACEMENT DECIDES WHETHER A GATE RUNS AT ALL. `scripts/ci-affected.ts` maps
 * `content/` to `@nexus/backend`, `@nexus/frontend` AND `@agent-nexus/cli` — that
 * last line exists for `cli-docs-are-generated.test.ts` and is what puts
 * `content/**` into the `test_vitest` output. So one vitest file here is woken by
 * all three ways these tables can go wrong:
 *
 *   · the academy page is edited          -> `content/` -> @agent-nexus/cli
 *   · the skills pin moves                -> packages/cli/** -> @agent-nexus/cli
 *   · the matrix in @nexus/types changes  -> dependency graph -> @agent-nexus/cli
 *
 * A backend governance spec would cover the first and miss the second.
 *
 * ── WHAT THIS CANNOT SEE ────────────────────────────────────────────────────
 *
 * It reads the `Works on` COLUMN and nothing else. A row can name the right
 * types and describe the operator wrongly in the same breath, and this file is
 * blind to it. It also says nothing about a document that carries no table:
 * {@link DOCUMENTS} is a hand-kept list, so a THIRD copy of this table written
 * into a new page is caught by nobody until someone adds it here. That is the
 * residual hole and it is named rather than papered over — the alternative, a
 * scan for "any markdown table containing operator names", matches the
 * near-miss tables and the prose lists too.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../..");

/**
 * The matrix arrives through a `*.conformance.ts` because `wire-types-bundle.test.ts`
 * lets nothing else in this package import `@nexus/types` — see that module's
 * header for why the rule is stricter than reachability.
 */
function fieldTypesOffering(operator: string): readonly string[] {
  return FIELD_TYPES_BY_CONDITION_OPERATOR.get(operator) ?? [];
}

interface DocumentUnderTest {
  /** Names the document in a failure message. */
  readonly label: string;
  /** How to get its text. */
  readonly read: () => string;
  /**
   * The table's header row, verbatim. Matching the WHOLE header rather than a
   * word is what stops this landing on the near-miss table or on the field
   * table, both of which sit in the same documents.
   */
  readonly header: string;
  /** Zero-based index of the cell holding the field-type list. */
  readonly typeColumn: number;
  /** What to do when a cell disagrees. */
  readonly remedy: string;
}

/**
 * The bundled skill guide, read out of the payload rather than off disk: the
 * `.json` asset IS what ships to a user, so checking anything else would check a
 * copy nobody installs. A missing skill, file or table throws by design — an
 * absent document must not read as an agreeing one.
 */
function readBundledBranchingGuide(): string {
  const assetPath = join(HERE, "skills-content.generated.json");
  const payload = JSON.parse(readFileSync(assetPath, "utf-8")) as {
    SKILLS: Record<string, { files: { path: string; content: string }[] } | undefined>;
  };
  const skill = payload.SKILLS["nexus-workflow-builder"];
  if (!skill) throw new Error(`No "nexus-workflow-builder" skill in ${assetPath}`);
  const file = skill.files.find((f) => f.path === "node-types/logic/branching/GUIDE.md");
  if (!file) throw new Error(`No node-types/logic/branching/GUIDE.md in ${assetPath}`);
  return file.content;
}

const ACADEMY_PAGE = join(REPO_ROOT, "content/docs/user-manual/academy/automation.mdx");

const DOCUMENTS: readonly DocumentUnderTest[] = [
  {
    label: "the bundled skill guide (nexus-workflow-builder/node-types/logic/branching/GUIDE.md)",
    read: readBundledBranchingGuide,
    header: "| Operator | Works on | What it checks |",
    typeColumn: 1,
    remedy:
      "edit the table in NexusGPT/claude-code-skills-nexus, then bump packages/cli/skills-nexus.lock and run `pnpm --filter @agent-nexus/cli run gen:skills`"
  },
  {
    label: "the academy page (content/docs/user-manual/academy/automation.mdx)",
    read: () => readFileSync(ACADEMY_PAGE, "utf-8"),
    header: "| Operator | Description | Applicable Types |",
    typeColumn: 2,
    remedy: "edit the table in content/docs/user-manual/academy/automation.mdx"
  }
];

/** `| a | b | c |` -> `["a", "b", "c"]`. */
function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * Strips the markdown a cell may carry around a bare name — backticks and
 * asterisks only. `_` is deliberately NOT stripped: every operator name is
 * snake_case, so treating it as emphasis turns `array_has_length_equal_to` into
 * a name that matches nothing, and the whole table then reads as absent.
 */
function bare(text: string): string {
  return text.replace(/[`*]/g, "").trim();
}

interface ParsedTable {
  /** operator -> the field types its row names, as written. */
  readonly rows: Map<string, string[]>;
  /** Every first-column value, in order, so a duplicate row is visible. */
  readonly operatorsInOrder: string[];
}

/**
 * Reads the table that follows {@link DocumentUnderTest.header} until the first
 * line that is not a table row. Throws when the header is absent — a document
 * whose table was renamed or removed must fail loudly, never silently pass.
 */
function parseTable(document: DocumentUnderTest): ParsedTable {
  const text = document.read();
  const lines = text.split("\n");
  const headerIndex = lines.findIndex((line) => line.trim() === document.header);
  if (headerIndex === -1) {
    throw new Error(
      `Could not find the operator table in ${document.label}. ` +
        `Expected a line reading exactly:\n  ${document.header}\n` +
        `The table moved or was reformatted; this gate cannot check what it cannot locate.`
    );
  }

  const rows = new Map<string, string[]>();
  const operatorsInOrder: string[] = [];
  // +2 skips the header and the `|---|---|` separator beneath it.
  for (let i = headerIndex + 2; i < lines.length; i += 1) {
    const line = lines[i]?.trim() ?? "";
    if (!line.startsWith("|")) break;
    const parts = cells(line);
    const operator = bare(parts[0] ?? "");
    const typesCell = bare(parts[document.typeColumn] ?? "");
    operatorsInOrder.push(operator);
    rows.set(
      operator,
      typesCell
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    );
  }

  return { rows, operatorsInOrder };
}

describe("every shipped condition-operator table agrees with CONDITION_OPERATORS_BY_FIELD_TYPE", () => {
  it("has a matrix worth comparing against — a floor, so an emptied one cannot pass", () => {
    // Without this, a matrix reduced to empty rows would make every document
    // disagree loudly (good) — but a matrix reduced to ONE row would quietly
    // shrink what the assertions below actually range over.
    expect(CONDITION_OPERATOR_NAMES.length).toBe(19);
    expect(OFFERED_CONDITION_PAIR_COUNT).toBe(25);
    for (const operator of CONDITION_OPERATOR_NAMES) {
      expect(fieldTypesOffering(operator).length).toBeGreaterThan(0);
    }
  });

  it("checks more than one document, and knows which", () => {
    expect(DOCUMENTS.map((d) => d.label).length).toBe(2);
  });

  describe.each(DOCUMENTS.map((document) => [document.label, document] as const))(
    "%s",
    (_label, document) => {
      it("carries a table naming every operator exactly once", () => {
        const { rows, operatorsInOrder } = parseTable(document);

        expect([...rows.keys()].sort()).toEqual([...CONDITION_OPERATOR_NAMES].sort());
        // A row written twice would be invisible to the Map above.
        expect(operatorsInOrder.length).toBe(CONDITION_OPERATOR_NAMES.length);
      });

      it("names the same field types as the matrix, cell by cell", () => {
        const { rows } = parseTable(document);

        const disagreements: string[] = [];
        for (const operator of CONDITION_OPERATOR_NAMES) {
          const expected = fieldTypesOffering(operator);
          const found = rows.get(operator) ?? [];
          const same =
            found.length === expected.length &&
            [...found].sort().join(",") === [...expected].sort().join(",");
          if (!same) {
            disagreements.push(
              `${operator}: the table says "${found.join(", ") || "(nothing)"}", ` +
                `the matrix offers "${expected.join(", ")}"`
            );
          }
        }

        expect(
          disagreements,
          disagreements.length === 0
            ? ""
            : `${document.label} disagrees with CONDITION_OPERATORS_BY_FIELD_TYPE ` +
                `(packages/types/src/shared/domain/tools/condition-compatibility.ts).\n` +
                `An operator used outside its row is not refused — it answers the same value ` +
                `on every run, and the branch takes one path for ever.\n` +
                `To fix: ${document.remedy}.\n` +
                disagreements.map((line) => `  · ${line}`).join("\n")
        ).toEqual([]);
      });
    }
  );
});
