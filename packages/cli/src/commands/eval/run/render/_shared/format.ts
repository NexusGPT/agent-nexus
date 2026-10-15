/**
 * The formatting primitives every `eval run` renderer shares.
 *
 * Cost crosses the wire in ten-thousandths of a USD, so one place decides how
 * many decimals a reader sees; a score is nullable, and the em dash is what
 * says "no score" rather than a misleading `0.000`.
 */

export function formatUsd(tenThousandths: number): string {
  return `$${(tenThousandths / 10_000).toFixed(4)}`;
}

export function formatScore(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}

/** Fixed-width column text: TRUNCATES rather than wrapping, so a row stays one line. */
export function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}
