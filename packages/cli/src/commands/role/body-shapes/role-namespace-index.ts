import { ROLE_NAMESPACE_AREAS } from "./role-namespace-areas";
import { wrapMembers } from "./wrap-members";

/** The column the verbs start in, so every area label lines up. */
const AREA_LABEL_WIDTH = 18;

function renderArea(label: string, verbs: readonly string[]): string {
  const indent = " ".repeat(2 + AREA_LABEL_WIDTH);
  const wrapped = wrapMembers(verbs, indent, 58);
  return `  ${label.padEnd(AREA_LABEL_WIDTH)}${wrapped.slice(indent.length)}`;
}

const ROLE_VERB_COUNT = ROLE_NAMESPACE_AREAS.reduce((total, area) => total + area.verbs.length, 0);

/** Appended to `nexus role --help`, above `role-namespace-gaps.ts`. */
export const ROLE_NAMESPACE_INDEX = `
THAT LIST IS ALPHABETICAL, WHICH IS NOT AN ORDER ANYONE READS IT IN.
The ${ROLE_VERB_COUNT} verbs are ${ROLE_NAMESPACE_AREAS.length} areas:

${ROLE_NAMESPACE_AREAS.map((area) => renderArea(area.label, area.verbs)).join("\n\n")}

Only THE COST MODEL feeds "nexus role coverage", and inside it exactly TWO verbs
move the figure. "set-automation-settings" writes one of the three rows it is
derived from — "nexus role coverage --help" names all three and says where the
other two are authored. "set-system-lifecycle" moves it WITHOUT touching a row:
only a LIVE system is summed, so it decides which already-modelled systems count.`;
