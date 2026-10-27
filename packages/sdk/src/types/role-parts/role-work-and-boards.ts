import type { RoleResourceType } from "./role-core";

// ============================================================================
// The Role's WORK — what it is answerable for, and what it proposes to do
//
// Two documents that sit side by side on one screen and are independent in the
// database. Their authoring grains are OPPOSITE and neither is an oversight: a
// duty is added and removed ONE AT A TIME because the SERVER mints its id, so a
// whole-list replace would have to re-mint — and a task's coverage checklist
// references a duty by id. A task list can be replaced whole because the body
// NAMES each surviving row, which is what keeps its id.
// ============================================================================

/** One duty the Role is answerable for, in its author's own words. */
export interface RoleResponsibility {
  /** Row UUID. Stable across edits of this duty and of every other one. */
  id: string;
  /** The duty itself. Never blank — the column refuses it. */
  text: string;
  /**
   * Its place in the list, `0`-based.
   *
   * ⚠️ AN INSERTION ORDER, NOT A DENSE RANK. Removing a duty leaves a hole —
   * 0, 1, 3 — and nothing backfills it. Render the list, not the integer.
   */
  position: number;
  /** ISO 8601. */
  updatedAt: string;
}

/** Every duty the Role is answerable for, in read order. */
export interface RoleResponsibilitiesResponse {
  /** The duties, ordered by `(position, createdAt, id)`. */
  responsibilities: RoleResponsibility[];
}

/** Add ONE duty. The server assigns its id and appends it at the end. */
export interface RoleResponsibilityBody {
  /**
   * The duty. Trimmed before it is measured, so a row of spaces is a 400 rather
   * than a duty that renders as an empty line nobody can select. 500 characters
   * is the ceiling; anything longer is a job description, which belongs on
   * `updateRole()`.
   */
  text: string;
}

/**
 * What removing a duty answers with.
 *
 * 🚨 NO `removed` BOOLEAN, unlike the grant and system detaches. Those are
 * idempotent and need a field to say which happened; this route answers 404 for
 * a duty that is not this Role's, so a success always means exactly one row went.
 */
export interface RoleResponsibilityRemoved {
  /** The duty that was removed. */
  id: string;
}

/**
 * Who or what a proposed task is assigned to.
 *
 * ⚠️ IDS AND NO DISPLAY NAME, deliberately. The resource arm spans every table
 * {@link RoleResourceType} names, behind a loose `resourceType` with no foreign
 * key to join through, so a name would cost one query per kind on every read.
 * Resolve a `userId` with `listMembers()` and a `resourceId` with
 * `listSystems()`.
 *
 * ⚠️ `resourceType` IS A LOOSE STRING ON THE READ AND NARROW ON THE WRITE, which
 * is the same split {@link RoleResourceType} states for itself: a stored row may
 * carry a retired kind, and tightening a response would fail a whole listing over
 * one legacy row.
 */
export type RoleTaskAssignment =
  | { kind: "person"; userId: string }
  | { kind: "resource"; resourceType: string; resourceId: string };

/**
 * ⚠️ AN ASSIGNMENT HAS NO ID AT ALL, unlike the task above it — the ARM OBJECT is
 * the identity. Assignment rows are re-created beneath a surviving task on each
 * save, which no consumer can observe because none is published or referenced.
 *
 * 🚨 THERE IS NO `person:<userId>` STRING FORM ON THE WIRE, and there never has
 * been. That spelling is the DATABASE's uniqueness key on the row
 * (`@@unique([taskId, userId])` and `@@unique([taskId, resourceType,
 * resourceId])`); it was documented here and in the CLI's `--help` as though it
 * were the payload, and sending it is refused. A statement that is true about
 * one layer and addressed to another reads as checked (NEX-3778).
 */

/** One task the Role proposes to run. */
export interface RoleTask {
  /**
   * Row UUID, and a DURABLE handle.
   *
   * A task submitted back to the dashboard's save with its `id` is updated in
   * place and keeps it; that is what lets a task's coverage checklist reference
   * it at all. Safe to store and to correlate across sessions.
   */
  id: string;
  /** What the task is. */
  name: string;
  /** One line, or `null` when nobody has written one. */
  description: string | null;
  /** Occurrences a year, or `null` when nobody has stated it. `null` is not `0`. */
  occurrencesPerYear: number | null;
  /** People a year, or `null` when nobody has stated it. `null` is not `0`. */
  peoplePerYear: number | null;
  /** Revenue a year in the organization's currency, or `null` when unstated. */
  revenuePerYear: number | null;
  /** Its place in the list, `0`-based. The read is ordered by it. */
  position: number;
  /** Who and what runs it. */
  assignments: RoleTaskAssignment[];
  /** ISO 8601. */
  updatedAt: string;
}

/** The Role's whole task list, in read order. */
export interface RoleTasksResponse {
  /** The tasks, ordered by `position`. */
  tasks: RoleTask[];
}

/**
 * One assignment as a caller SENDS it. Same two arms, no id — see the type above.
 *
 * 🚨 NARROWER THAN THE READ ON PURPOSE. `resourceType` is
 * {@link RoleResourceType} here rather than `string`, because the server refuses
 * anything outside that union naming every member of it — so a wider type here
 * would advertise a value the write cannot take. The read stays loose for the
 * opposite reason: a stored row may carry a retired kind.
 */
export type RoleTaskAssignmentInput =
  | { kind: "person"; userId: string }
  | { kind: "resource"; resourceType: RoleResourceType; resourceId: string };

/** One task as a caller SENDS it in the whole-list replace. */
export interface RoleTaskInput {
  /**
   * WHICH STORED ROW THIS IS, when it is one that already exists.
   *
   * 🚨 NAME A ROW TO KEEP IT. A task sent with its `id` is updated in place and
   * keeps it; one with no `id` is created; one the body omits is DELETED. Naming
   * it is what keeps the task's duty ticks alive — a re-minted id takes every
   * link row with it.
   *
   * ABSENT MEANS NEW, which is what every task in a first save is.
   */
  id?: string;
  /** What the work is called. Required and trimmed. */
  name: string;
  /** The one line under the name. `null` is "nobody wrote one", not `""`. */
  description: string | null;
  /** Occurrences a year. `null` is "not stated" and is NOT `0`. */
  occurrencesPerYear: number | null;
  /** People a year. `null` is "not stated" and is NOT `0`. */
  peoplePerYear: number | null;
  /** Revenue a year. `null` is "not stated" and is NOT `0`. */
  revenuePerYear: number | null;
  /** Who and what does it. An empty array is the ordinary state for a proposal. */
  assignments: RoleTaskAssignmentInput[];
}

/** The whole task list a replace sends. The array INDEX is the position. */
export interface RoleTasksBody {
  /** Every task the Role should have afterwards. Anything absent is deleted. */
  tasks: RoleTaskInput[];
}

/**
 * The duty ids a task ticks.
 *
 * 🚨 IDS ONLY, NEVER THE DUTY TEXT. Read the labels from
 * `listResponsibilities()` and zip on the id — both reads are required to render
 * a checklist. Ordered by the duty's own `position`.
 */
export interface RoleTaskDutiesResponse {
  /** The duty ids this task ticks, in the duties' own read order. */
  responsibilityIds: string[];
}

/** The whole set of duties a task ticks. */
export interface RoleTaskDutiesBody {
  /** Every duty this task should tick afterwards. The same id twice is refused. */
  responsibilityIds: string[];
}

// ============================================================================
// BOARDS — the Overview lanes, and where each card sits
// ============================================================================

/**
 * The kinds of card that have somewhere to store a placement.
 *
 * ⚠️ LOWERCASE, unlike the SCREAMING_CASE resource types elsewhere on this API.
 * The Overview screen paints six more node kinds that have nowhere to store a
 * placement; naming one of those is a 400.
 */
export type RoleBoardCardType =
  | "agent"
  | "workflow"
  | "deployment"
  | "ai_task"
  | "document_template"
  | "collection"
  | "workspace"
  | "external_tool";

/**
 * The palette a lane can be painted in.
 *
 * ⚠️ A STORED ROW MAY HOLD A TOKEN THAT IS NO LONGER IN THIS UNION. The palette
 * grows and shrinks by editing an array rather than a database enum, and the
 * column's CHECK is looser than the write schema — so a board created under an
 * accent that was later retired still reads back with it. Do not switch
 * exhaustively on this without a fallback branch.
 */
export type RoleBoardAccent =
  | "slate"
  | "indigo"
  | "violet"
  | "sky"
  | "teal"
  | "emerald"
  | "amber"
  | "rose"
  | "surface_base"
  | "surface_secondary"
  | "surface_contrast";

/** One lane on a Role's Overview screen. */
export interface RoleBoard {
  /** Board UUID. */
  id: string;
  /** The Role this lane belongs to. */
  roleId: string;
  name: string;
  /** A palette key, not a CSS colour. */
  accent: RoleBoardAccent;
  /**
   * 0-based, and ordered by `(position, createdAt, id)` — a TOTAL order, which is
   * why `position` carries no unique constraint. A duplicate position is untidy,
   * never ambiguous.
   */
  position: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One card, and where it sits.
 *
 * 🚨 `boardId: null` IS THE UNGROUPED LANE, not a missing value. Everything a
 * Role holds starts there.
 *
 * PLACEMENT ONLY — no name, no status, no icon, and no position WITHIN the lane.
 * The screen already holds that metadata from the reads that populate the Role's
 * tabs, and re-serving it here would be a second source of truth that drifts the
 * first time either side gains a field.
 */
export interface RoleBoardCard {
  cardType: RoleBoardCardType;
  /**
   * The card's own id. A uuid for most kinds — but `RoleResource.resourceId` is
   * a loose TEXT column whose legacy rows may hold any string, so do not assume
   * a uuid when parsing.
   */
  cardId: string;
  /** The lane it sits in, or `null` for Ungrouped. */
  boardId: string | null;
}

/** Every lane, and every card's placement. */
export interface RoleBoardsView {
  boards: RoleBoard[];
  cards: RoleBoardCard[];
}

/** Create a lane. `position` is deliberately not accepted — a new board is appended. */
export interface RoleBoardCreateBody {
  name: string;
  /**
   * A palette key. Defaults server-side when omitted.
   *
   * The CLOSED union on the way IN, unlike the same field on {@link RoleBoard},
   * and the asymmetry is the contract rather than an oversight: the write schema
   * refuses any token outside today's palette, while a row written before a token
   * was retired still READS BACK with it. Loose on the read, exact on the write.
   */
  accent?: RoleBoardAccent;
}

/** Rename, recolour, or both. An empty body is a no-op rather than an error. */
export interface RoleBoardUpdateBody {
  name?: string;
  /** Closed on the way in — see {@link RoleBoardCreateBody.accent}. */
  accent?: RoleBoardAccent;
}

/**
 * The WHOLE list, in the order you want.
 *
 * Must equal the Role's current board set or the write is a 409. A repeated id
 * is a 400.
 */
export interface RoleBoardReorderBody {
  boardIds: string[];
}

/** `null` moves the card to Ungrouped — a destination, not an omission. */
export interface RoleBoardCardMoveBody {
  boardId: string | null;
}

/** What a board delete answers. */
export interface RoleBoardDeleted {
  deleted: true;
  /** How many cards fell back to the Ungrouped lane. */
  cardsUnplaced: number;
}
