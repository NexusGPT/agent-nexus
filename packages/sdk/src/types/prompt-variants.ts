/**
 * PROMPT VARIANTS — branch-based prompt versioning (Prompt Lab phase 1).
 *
 * A variant is a prompt branch. Every agent has exactly one **Main** variant —
 * the production lineage, whose name is reserved — and any number of named
 * variants that fork from a version and iterate independently. There is no
 * merge and no rebase: a variant reaches Main only through `promote`, which
 * appends a NEW Main version recording `promotedFromVersionId`. History is
 * append-only on every variant.
 *
 * ## Refs
 *
 * Everywhere a variant is addressed (`variantRef`) the SDK passes what you
 * give it: a variant id, a variant name, or `"main"` (case-insensitive). In
 * `compare`, a ref may also be a version id.
 *
 * ## Timestamps are STRINGS
 *
 * ISO-formatted, handed back exactly as the wire carried them — same policy as
 * every other resource in this package.
 */

export type PromptVariantStatus = "ACTIVE" | "ARCHIVED";

export type PromptVersionType = "AUTO" | "CHECKPOINT";

/** One prompt branch, with its tip and version count riding along. */
export interface PromptVariant {
  id: string;
  agentId: string;
  name: string;
  isMain: boolean;
  status: PromptVariantStatus;
  /** The version this variant branched off. Null for Main. */
  forkedFromVersionId: string | null;
  /** How many versions sit on this variant; the tip is the highest ordinal. */
  versionCount: number;
  /** Id of the tip version. Null only for a Main that has never saved. */
  tipVersionId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A version as seen through its variant: position and promote provenance. */
export interface PromptVariantVersion {
  id: string;
  variantId: string;
  variantName: string;
  /** 1-based position within the variant. */
  ordinal: number;
  type: PromptVersionType;
  name: string | null;
  /** Set only on Main versions created by a promote. */
  promotedFromVersionId: string | null;
  isProduction: boolean;
  createdAt: string;
  createdBy: string | null;
}

export interface ListPromptVariantsParams {
  /** Include ARCHIVED variants. Default: false. */
  includeArchived?: boolean;
}

export interface CreatePromptVariantBody {
  /** New variant name. "Main" (any casing) is reserved and refused. */
  name: string;
  /** Version to fork from. Defaults to the Main tip. */
  fromVersionId?: string;
}

export interface ForkPromptVariantBody {
  name: string;
}

export interface RenamePromptVariantBody {
  name: string;
}

export interface SavePromptVariantVersionBody {
  /** The prompt, as markdown. */
  prompt: string;
  name?: string;
  description?: string;
}

export interface PromotePromptVariantBody {
  /** Also make the new Main version the production prompt. Default: false. */
  publish?: boolean;
}

export interface PromotePromptVariantResult {
  /** The NEW version appended to Main — history is never rewritten. */
  newMainVersionId: string;
  mainVariantId: string;
  ordinal: number;
  /** The variant tip the content was copied from. */
  sourceVersionId: string;
  published: boolean;
}

export interface PromptGraphNode {
  id: string;
  variantId: string;
  variantName: string;
  isMain: boolean;
  ordinal: number;
  type: PromptVersionType;
  name: string | null;
  promotedFromVersionId: string | null;
  isProduction: boolean;
  createdAt: string;
}

export interface PromptGraphEdge {
  /**
   * `fork`: from = the version forked off, to = the variant's first version.
   * `promote`: from = the variant tip, to = the new Main version.
   */
  kind: "fork" | "promote";
  from: string;
  to: string;
}

export interface PromptGraph {
  nodes: PromptGraphNode[];
  edges: PromptGraphEdge[];
}

export interface ComparePromptParams {
  /** A version id, a variant name (meaning its tip), or "main". */
  a: string;
  /** A version id, a variant name (meaning its tip), or "main". */
  b: string;
}

export interface ComparePromptRef {
  ref: string;
  versionId: string;
  variantName: string;
  ordinal: number;
}

export interface ComparePromptChange {
  /** `remove` counts lines of a, `add` counts lines of b; `line` is 1-based. */
  op: "add" | "remove";
  line: number;
  text: string;
}

export interface ComparePromptResult {
  a: ComparePromptRef;
  b: ComparePromptRef;
  /** Empty when the two refs hold identical prompt text. */
  changes: ComparePromptChange[];
}
