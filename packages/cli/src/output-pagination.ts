// ---------------------------------------------------------------------------
// Pagination meta
// ---------------------------------------------------------------------------

import { PAGING_STATES, type PagingState } from "@agent-nexus/sdk";

import { color } from "./output-color";
import { field } from "./output-columns";
import { isJsonMode } from "./output-json-mode";

/**
 * The pagination fields the printers actually read.
 *
 * Every list command hands this `client.*.list()`'s `meta`, whose SDK type is
 * `PaginationMeta` — a plain interface with no index signature. The parameter
 * used to be `Record<string, unknown>`, which an interface is not assignable
 * to, so ~18 call sites cast their way in and this function cast its way back
 * out. Naming the three fields removes both halves: `PaginationMeta` satisfies
 * it structurally, and nothing has to be asserted anywhere.
 */
export interface PaginationLike {
  total?: number;
  page?: number;
  /**
   * Whether more rows follow — three-valued, because the server may say
   * nothing and an operator must be told that rather than shown a silence
   * indistinguishable from "that is the whole set". See {@link PagingState}.
   */
  paging?: PagingState;
}

/**
 * Read the paging fields off whatever meta a command was handed.
 *
 * `paging` is the SDK's own vocabulary. `hasMore` is still read because a few
 * routes are consumed as raw envelopes rather than through a typed resource,
 * and a served boolean is authoritative wherever it appears. A value that is
 * neither is reported as absent rather than guessed at.
 */
export function readPagination(meta: object): PaginationLike {
  const total = field(meta, "total");
  const page = field(meta, "page");
  const paging = field(meta, "paging");
  const hasMore = field(meta, "hasMore");

  const state = PAGING_STATES.find((s) => s === paging);

  return {
    total: typeof total === "number" ? total : undefined,
    page: typeof page === "number" ? page : undefined,
    paging:
      state ?? (typeof hasMore === "boolean" ? (hasMore ? "has-more" : "exhausted") : undefined)
  };
}

/**
 * The footer under a table.
 *
 * `"did-not-say"` prints, and printing it is the whole point: an operator who
 * sees no footer reads the table as the complete set, so a server that
 * published nothing about further pages has to say so out loud. Silence is
 * reserved for `"exhausted"`, where it is true.
 */
export function printPaginationMeta(meta: PaginationLike): void {
  if (isJsonMode()) return; // already included in JSON output

  const parts: string[] = [];
  if (meta.total != null) parts.push(`${meta.total} total`);
  if (meta.page != null) parts.push(`page ${meta.page}`);
  if (meta.paging === "has-more") parts.push("more available");
  if (meta.paging === "did-not-say")
    parts.push("more may exist — this route reports no page count");

  if (parts.length > 0) {
    console.log(color.dim(`\n${parts.join(" · ")}`));
  }
}
