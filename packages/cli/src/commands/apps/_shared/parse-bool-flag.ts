export function parseBoolFlag(raw: string, flag: string): boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`Invalid ${flag} "${raw}". Expected "true" or "false".`);
}
