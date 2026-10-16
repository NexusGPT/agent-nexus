import type { Slot } from "./contract-help.types";

/**
 * THE TWO LAYOUT FACTS the contract `--help` block needs: how wide a wrapped
 * value list may run, and what a slot is called on the page.
 *
 * Separate from `contract-help.render.ts` so the rendering rule and the
 * typography it obeys can each be read on their own.
 */

const WRAP_AT = 76;

/** Comma-joined values, wrapped at {@link WRAP_AT} columns including the indent. */
export function wrapValues(values: readonly string[], indent: string): string[] {
  const lines: string[] = [];
  let current = "";
  for (const value of values) {
    const next = current === "" ? value : `${current}, ${value}`;
    if (`${indent}${next}`.length > WRAP_AT && current !== "") {
      lines.push(indent + current);
      current = value;
    } else {
      current = next;
    }
  }
  if (current !== "") lines.push(indent + current);
  return lines;
}

export const SLOT_LABEL: Record<Slot, string> = {
  PathVars: "Path",
  Params: "Query",
  Body: "Body"
};
