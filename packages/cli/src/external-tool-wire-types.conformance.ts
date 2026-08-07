/**
 * THE DRIFT GATE for `external-tool-wire-types.ts`.
 *
 * Same constraint and same exposure as `admin-wire-types.conformance.ts` and
 * `vibe-wire-types.conformance.ts`: the CLI publishes standalone, so these two
 * error-`details` shapes are hand copies, and a hand copy is safe only while
 * something FAILS when it stops matching.
 *
 * ── What is different here, and it matters ──────────────────────────────────
 *
 * The other two gates compare against `TApi[…]["Response"]` — an ENDPOINT
 * contract. There is no endpoint contract for these: they are the `details`
 * field of a 409 body, which no response schema describes. So the comparison
 * target is the Zod schema itself, through the `TToolHasAttachmentsDetails` /
 * `TToolSpecBreakingChangeDetails` aliases that `skills.schemas.ts` exports.
 *
 * It has to be those aliases, never `z.infer<typeof …Schema>` written here: the
 * CLI has no `zod` dependency, so `z` does not resolve, `z.infer` degrades to
 * `any`, and every assertion below passes over nothing. {@link NotAny} pins that
 * down rather than leaving it to whoever edits this next.
 *
 * That was only a sound target once the PRODUCER was made to derive from the
 * same schema. Before this change there were THREE copies of each shape —
 * the backend's `external-tool.errors.ts` interfaces (which actually construct
 * the payload), the Zod schemas here, and the CLI's declarations — and the Zod
 * schemas had NO consumer at all: nothing imported them, in either direction.
 * Gating the CLI against an unused schema would have compared a copy to a copy
 * and proved nothing about what the CLI receives. The backend interfaces are now
 * `z.infer` aliases of these schemas, so the chain is producer → schema → gated
 * CLI copy with one definition at its head.
 *
 * ── How it works ────────────────────────────────────────────────────────────
 *
 * Every assertion is a `const` whose declared type is `true` when the shapes
 * agree and a descriptive TUPLE when they do not, so `pnpm typecheck` prints the
 * offending field names rather than `'false' is not assignable to 'true'`. There
 * is no runtime behaviour here; the module exists to be compiled.
 *
 * The operators are deliberately NOT shared with the other two conformance
 * modules. Neither is importable without dragging its own shapes into this
 * compilation, and a `Mirrors` that three gates share is a `Mirrors` that none
 * of them can change. They are twelve lines; the duplication is cheaper than the
 * coupling, and each file's copy is checked by its own assertions.
 *
 * ── Why this file cannot reach the published binary ─────────────────────────
 *
 * `src/index.ts` cannot reach this module, so tsup's bundle graph never visits
 * it and the `@nexus/types` import below stays out of `dist/`.
 * `wire-types-bundle.test.ts` holds that as an assertion over EVERY module the
 * binary can reach, and it DISCOVERS `*.conformance.ts` rather than naming them,
 * so it covers this file without being told about it.
 */

import type {
  TToolHasAttachmentsDetails,
  TToolSpecBreakingChangeDetails
} from "@nexus/types/public-api-v1";

import type {
  ToolHasAttachmentsDetails,
  ToolSpecBreakingChangeDetails
} from "./external-tool-wire-types";

/**
 * `z.infer` is POST-parse, so a `z.string().datetime()` is `string` already and
 * a `z.date()` would be `Date`. The CLI reads raw JSON and never parses, so
 * every date reaches it as a string. Normalising here rather than declaring
 * `Date` in the wire types keeps the declarations honest about what arrives.
 */
type Wire<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

/** Wire fields the CLI type does not declare. */
type Omitted<Cli, W> = Exclude<keyof W, keyof Cli>;

/**
 * A CLI field with no counterpart on the wire — ALWAYS a defect, never a
 * deliberate choice: the CLI cannot receive a key the server does not send, so
 * anything here was renamed or removed upstream and now reads as `undefined`.
 */
type NoInventedFields<Label extends string, Cli, W> = [Exclude<keyof Cli, keyof W>] extends [never]
  ? true
  : [Label, "declares a field the wire contract does not have:", Exclude<keyof Cli, keyof W>];

/**
 * The CLI omits EXACTLY the wire fields named in `Declared`, no more and no
 * fewer. Both directions: a NEW wire field the CLI ignores fails until someone
 * mirrors it or writes its name here with a reason, and a declared omission that
 * no longer exists fails too, so the list cannot rot into names nobody can
 * explain.
 */
type OmitsExactly<Label extends string, Cli, W, Declared> = [
  Exclude<Omitted<Cli, W>, Declared>
] extends [never]
  ? [Exclude<Declared, Omitted<Cli, W>>] extends [never]
    ? true
    : [Label, "declares an omission that is not missing:", Exclude<Declared, Omitted<Cli, W>>]
  : [Label, "silently omits a wire field:", Exclude<Omitted<Cli, W>, Declared>];

/**
 * Every shared field carries a type the wire value satisfies. Assignability
 * rather than equality, in that direction on purpose: the CLI may hold a field
 * more LOOSELY than the contract (a published binary must not reject a value a
 * newer backend adds). It may never hold one more tightly — that is the shape
 * that reads a real response as the wrong type.
 */
type SharedFieldsMatch<Label extends string, Cli, W> =
  Pick<W, Extract<keyof Cli, keyof W>> extends Pick<Cli, Extract<keyof Cli, keyof W>>
    ? true
    : [Label, "narrows or mistypes a field it shares with the wire contract"];

/**
 * The three assertions every mirrored shape gets. `readonly`, because
 * {@link AGREES} is an `as const` tuple and a readonly tuple is not assignable
 * to a mutable one — without this every assertion fails for a reason unrelated
 * to the shapes it checks.
 */
type Mirrors<Label extends string, Cli, W, Declared = never> = readonly [
  NoInventedFields<Label, Cli, W>,
  OmitsExactly<Label, Cli, W, Declared>,
  SharedFieldsMatch<Label, Cli, W>
];

/** Satisfied by a `Mirrors<…>` tuple only when all three members are `true`. */
const AGREES = [true, true, true] as const;

/**
 * The wire type resolved to something real, not to `any`.
 *
 * This is not defensive decoration — it is the failure this gate actually had.
 * The first version imported the Zod schemas and wrote `z.infer<typeof …>`, but
 * the CLI has no `zod` dependency (that absence is the whole reason these wire
 * types are hand-declared). `z.infer` over an unresolvable `z` is `any`, `any`
 * satisfies every structural assertion on both sides, and all six assertions
 * passed while comparing nothing at all. Only the `Cannot find module 'zod'`
 * error alongside them gave it away — remove that one error and the gate reads
 * as green.
 *
 * `0 extends (1 & T)` is true only for `any`: the intersection collapses to `1`
 * for any real `T`, and to `any` — which every type extends — otherwise.
 */
type NotAny<Label extends string, T> = 0 extends 1 & T
  ? [Label, "resolved to `any` — this gate is comparing nothing"]
  : true;

// ============================================================
// 409 TOOL_HAS_ATTACHMENTS
// ============================================================

type WireHasAttachments = Wire<TToolHasAttachmentsDetails>;

const _hasAttachmentsResolved: NotAny<"TToolHasAttachmentsDetails", WireHasAttachments> = true;

const _hasAttachments: Mirrors<
  "ToolHasAttachmentsDetails",
  ToolHasAttachmentsDetails,
  WireHasAttachments
> = AGREES;

/**
 * The element type as well as the container. `sample` is an array, so the
 * operators above compare `Array<…>` against `Array<…>` and are satisfied by
 * assignability at the array level — a renamed field INSIDE the element would
 * still fail `SharedFieldsMatch`, but `NoInventedFields` and `OmitsExactly`
 * never see the element's keys at all. Comparing the element directly is what
 * makes those two mean anything here.
 */
const _hasAttachmentsSample: Mirrors<
  "ToolHasAttachmentsDetails.sample[]",
  ToolHasAttachmentsDetails["sample"][number],
  WireHasAttachments["sample"][number]
> = AGREES;

// ============================================================
// 409 TOOL_SPEC_BREAKING_CHANGE
// ============================================================

type WireSpecBreaking = Wire<TToolSpecBreakingChangeDetails>;

const _specBreakingResolved: NotAny<"TToolSpecBreakingChangeDetails", WireSpecBreaking> = true;

const _specBreaking: Mirrors<
  "ToolSpecBreakingChangeDetails",
  ToolSpecBreakingChangeDetails,
  WireSpecBreaking
> = AGREES;

/** Same reason as `sample[]` above — the element, not just the container. */
const _specBreakingBindings: Mirrors<
  "ToolSpecBreakingChangeDetails.bindings[]",
  ToolSpecBreakingChangeDetails["bindings"][number],
  WireSpecBreaking["bindings"][number]
> = AGREES;
