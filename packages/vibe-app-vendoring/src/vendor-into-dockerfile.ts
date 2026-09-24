import { VENDOR_DIRECTORY } from "./vendored-tarball-path";

/**
 * Makes a Dockerfile's dependency-install steps see the app's `vendor/`
 * directory.
 *
 * Once a dependency is a `file:vendor/…` spec, the install step resolves it
 * from disk — so a stage that copies only `package.json` and a lockfile before
 * running `npm ci` fails on a path that is not in the image yet. The failure is
 * a build error naming a missing file, which reads as a broken vendor directory
 * rather than a missing `COPY`.
 *
 * This is the half that does NOT reach a laptop: `npm install` in the app
 * directory works either way, so the defect surfaces only on the first
 * server-side build — after the change has already been pushed.
 */

/**
 * 🔴 EVERY pattern here is case-insensitive, because Dockerfile INSTRUCTIONS are.
 * `run npm ci` is as valid as `RUN npm ci`, and the convention of shouting them
 * is only a convention.
 *
 * Matching uppercase alone fails in the direction that is hardest to notice: a
 * lowercase Dockerfile reports `installsNothing`, gets no insertion, and its
 * owner is handed a warning about a file this could simply have patched. Found
 * by probing this module's own edge cases rather than by a report, and it was
 * already inconsistent — `STAGE_BOUNDARY` below carried the flag from the start
 * while the three patterns that decide the OUTCOME did not.
 */

/** A stage's dependency install: the instruction that needs `vendor/` present before it. */
const DEPENDENCY_INSTALL =
  /^\s*RUN\b[\s\S]*?\b(?:npm\s+(?:ci|install|i)\b|yarn\s+install\b|pnpm\s+(?:install|i)\b|bun\s+install\b)/i;

/**
 * 🔴 A `--from` copy reads ANOTHER STAGE'S FILESYSTEM, never the build context,
 * so it can never be what brings the context's `vendor/` into this stage.
 *
 * This is the one flag that changes what a `COPY` means rather than how it
 * behaves, and missing it is silent in the worst direction: `COPY --from=builder
 * . /app` looks exactly like a whole-context copy, so the stage reads as covered,
 * gets no `COPY vendor/`, and its `npm ci` fails on a missing tarball — on the
 * server, after the push, with the local install having worked perfectly.
 *
 * Judged conservatively on purpose. A stage that genuinely did receive `vendor/`
 * from another stage gets one redundant `COPY vendor/ ./vendor/`, which copies
 * the same bytes from the context and costs a layer. Guessing the other way
 * costs a broken build that nothing here can see.
 */
const FROM_ANOTHER_STAGE = /^\s*(?:COPY|ADD)\s+(?:--\S+\s+)*--from=/i;

/**
 * A copy of the WHOLE build context — `COPY . .`, `ADD ./ /app`, with or
 * without flags. Such a stage already brings `vendor/` in and needs nothing.
 */
const WHOLE_CONTEXT_COPY = /^\s*(?:COPY|ADD)\s+(?:--\S+\s+)*\.\/?(?:\s+\S+)?\s*$/i;

/** A copy whose SOURCE list names `vendor` — the stage already handles it itself. */
const VENDOR_COPY_SOURCE = new RegExp(
  `^\\s*(?:COPY|ADD)\\s+(?:--\\S+\\s+)*(?:\\S+\\s+)*\\.?/?${VENDOR_DIRECTORY}/?(?:\\s|$)`,
  "i"
);

/** Whether this instruction brings the build context's `vendor/` into the current stage. */
function coversVendorFromContext(instruction: string): boolean {
  if (FROM_ANOTHER_STAGE.test(instruction)) return false;
  return WHOLE_CONTEXT_COPY.test(instruction) || VENDOR_COPY_SOURCE.test(instruction);
}

/** Starts a new build stage; coverage established in an earlier stage does not carry over. */
const STAGE_BOUNDARY = /^\s*FROM\b/i;

/** The line inserted so the install step can resolve `file:vendor/…` specs. */
export const VENDOR_COPY_LINE = `COPY ${VENDOR_DIRECTORY}/ ./${VENDOR_DIRECTORY}/`;

export interface VendorIntoDockerfileOutcome {
  content: string;
  /** How many dependency-install stages this call made copy `vendor/`. */
  insertions: number;
  /** Stages that install dependencies and already bring `vendor/` in themselves. */
  alreadyCovered: number;
  /** True when no stage installs dependencies at all — nothing to reconcile. */
  installsNothing: boolean;
}

/**
 * One Dockerfile instruction, which may span several physical lines through
 * trailing `\` continuations.
 */
interface Instruction {
  /** The physical lines, joined, as the instruction reads to Docker. */
  readonly joined: string;
  /** The physical lines verbatim, so the file can be rebuilt byte-for-byte. */
  readonly lines: readonly string[];
}

/**
 * Groups physical lines into Dockerfile instructions.
 *
 * A trailing `\` continues an instruction onto the next line, so `RUN apk add
 * curl \` / `  && npm ci` is ONE instruction whose install command is on the
 * second line. Analysing physical lines would both miss that install and — far
 * worse — insert a `COPY` in the middle of the `RUN`, producing a Dockerfile
 * that is syntactically broken rather than merely unpatched.
 */
function toInstructions(lines: readonly string[]): Instruction[] {
  const instructions: Instruction[] = [];
  let pending: string[] = [];
  for (const line of lines) {
    pending.push(line);
    if (!/\\\s*$/.test(line)) {
      instructions.push({ joined: pending.join("\n"), lines: pending });
      pending = [];
    }
  }
  if (pending.length > 0) instructions.push({ joined: pending.join("\n"), lines: pending });
  return instructions;
}

/**
 * Inserts `COPY vendor/ ./vendor/` immediately before every dependency-install
 * step that does not already have `vendor/` in the image.
 *
 * Coverage is judged PER STAGE, because a `COPY` in an earlier stage puts files
 * in a different filesystem. A stage counts as covered when, before its install
 * instruction, it copies the whole build context or names `vendor` in a copy's
 * source list.
 *
 * The insertion goes immediately BEFORE the install rather than after any
 * particular `COPY`, so it does not depend on how the manifests were spelled —
 * `COPY package*.json ./`, two separate `COPY` lines and
 * `COPY package.json package-lock.json ./` are all handled by the same rule.
 * It costs nothing in layer caching: `vendor/` changes exactly when the
 * dependency does, which is when the install layer had to be rebuilt anyway.
 */
export function vendorIntoDockerfile(dockerfile: string): VendorIntoDockerfileOutcome {
  const out: string[] = [];
  let insertions = 0;
  let alreadyCovered = 0;
  let installsNothing = true;
  let stageCovered = false;

  for (const instruction of toInstructions(dockerfile.split("\n"))) {
    if (STAGE_BOUNDARY.test(instruction.joined)) stageCovered = false;
    if (coversVendorFromContext(instruction.joined)) stageCovered = true;

    if (DEPENDENCY_INSTALL.test(instruction.joined)) {
      installsNothing = false;
      if (stageCovered) {
        alreadyCovered += 1;
      } else {
        out.push(indentLike(instruction.lines[0] ?? "", VENDOR_COPY_LINE));
        insertions += 1;
        // One insertion covers every later install in the same stage.
        stageCovered = true;
      }
    }
    out.push(...instruction.lines);
  }

  return { content: out.join("\n"), insertions, alreadyCovered, installsNothing };
}

/** Copies the leading whitespace of `model`, so an indented block stays aligned. */
function indentLike(model: string, text: string): string {
  return `${/^\s*/.exec(model)?.[0] ?? ""}${text}`;
}
