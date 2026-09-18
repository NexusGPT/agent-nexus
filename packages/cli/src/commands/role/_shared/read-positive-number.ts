/** Parse a required positive number — these three have no null form. */
export function readPositiveNumber(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flag} must be a finite number greater than 0. Got "${raw}".`);
  }
  return value;
}
