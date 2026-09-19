/**
 * Split a `NAME=VALUE` assignment. The value is everything after the
 * first `=`, so values may contain `=` and may be empty. NAME is
 * validated against the backend's SCREAMING_SNAKE_CASE rule locally for
 * an early, network-free error.
 */
export function parseEnvAssignment(raw: string): { name: string; value: string } {
  const eq = raw.indexOf("=");
  if (eq === -1) {
    throw new Error(`Invalid assignment "${raw}". Expected NAME=VALUE.`);
  }
  const name = raw.slice(0, eq).trim();
  const value = raw.slice(eq + 1);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid env var name "${name}". Must be SCREAMING_SNAKE_CASE (A-Z, 0-9, underscore; not starting with a digit).`
    );
  }
  return { name, value };
}
