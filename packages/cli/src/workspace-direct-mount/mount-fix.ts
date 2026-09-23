/** The mount that reaches ONE copy of a slug — `--shared` is what picks the other. */
export function mountFix(slug: string, shared: boolean): string {
  return `nexus workspace mount ${slug}${shared ? " --shared" : ""} --engine direct`;
}
