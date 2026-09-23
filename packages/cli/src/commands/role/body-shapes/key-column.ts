/** Indent every field line by four, and align the descriptions past the keys. */
export const KEY_COLUMN = 20;

/**
 * Where a field line's description starts — four of indent plus the key column.
 *
 * Derived rather than typed, so a continuation line inside a description stays
 * aligned when `KEY_COLUMN` moves. Hand-counted spaces drifted by five the first
 * time this block was rendered.
 */
export const CONTINUATION = " ".repeat(4 + KEY_COLUMN);
