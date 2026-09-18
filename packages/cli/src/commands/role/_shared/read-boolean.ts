/** Parse `--flag true|false`. A typo must not read as `false`. */
export function readBoolean(raw: string, flag: string): boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${flag} must be "true" or "false". Got "${raw}".`);
}
