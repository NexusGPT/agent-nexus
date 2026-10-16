import { Command } from "commander";

import { registerVersionCreateCommand } from "./version/create.command";
import { registerVersionDeleteCommand } from "./version/delete.command";
import { registerVersionGetCommand } from "./version/get.command";
import { registerVersionListCommand } from "./version/list.command";
import { registerVersionPublishCommand } from "./version/publish.command";
import { registerVersionRestoreCommand } from "./version/restore.command";
import { registerVersionUpdateCommand } from "./version/update.command";

export function registerVersionCommands(program: Command): void {
  const version = program
    .command("version")
    .description("Manage agent prompt versions — exactly one is production, publishing moves it");

  // 🔴 EVERY ROUTE BEHIND THIS NAMESPACE IS DEPRECATED, AND THE ANNOUNCEMENT HAS
  // TO REACH THE GENERATED DOCS PAGE AS WELL AS THE TERMINAL.
  //
  // `apps/backend/src/public/v1/v1-agent-versions.controller.ts` applies
  // `@DeprecatedForPromptVariants()` — `applyDecorators(Header("Deprecation", …),
  // Header("Sunset", …))` — to all seven of its handlers, which resolve to four
  // distinct served paths. `content/docs/cli/commands/version.mdx` is a projection
  // of this tree, and it cited one of those paths while never saying the word:
  // the citation is UNPREFIXED (`/public/v1/...`), so it is outside
  // `scripts/verify-docs-deprecations.ts`'s population, and the page is
  // `generated: true`, so it is exempt from `scripts/verify-docs-api-urls.ts`'s
  // route-path rule. Both exemptions are correct and neither gate reaches it, so
  // the repair belongs in the generator — which is this file.
  // `scripts/_lib/generated-docs-deprecation-disclosure.ts` is the gate that
  // reads the controller's OWN headers and refuses a silent citation, so this
  // declaration cannot be deleted or go stale without a red.
  //
  // `beforeAll` rather than `after`: measured on commander 13.1.0, it reaches
  // this namespace AND every leaf under it from ONE registration and does not
  // leak to the root — so there is no per-command list to keep in step, the same
  // argument `applyKnownIssuesHelpLine` and `registerHelpScopeFooter` make. And
  // it reads FIRST, which is where `deprecation-notice.ts` puts an announcement,
  // for the reason it gives: every other block here is about how to use something
  // that is going away.
  //
  // ⚠️ NO DATE, DELIBERATELY. `SUNSET_HTTP_DATE` is computed in that controller at
  // module load from an anchor plus a notice period; a date typed here would be a
  // second copy of that arithmetic, which is the drift the controller's own
  // comments exist to prevent. The live `Deprecation`/`Sunset` headers carry the
  // schedule, and `route-deprecation-warnings.ts` surfaces them on any call this
  // binary actually makes.
  version.addHelpText(
    "beforeAll",
    `
DEPRECATED — THE PROMPT-VERSION ROUTES BEHIND THIS NAMESPACE ARE BEING REMOVED.
  Every route "nexus version" calls answers RFC 9745 "Deprecation" and RFC 8594
  "Sunset" headers. They still operate, and they are scheduled for removal.
  Read the live schedule off those headers rather than from this screen —
  "nexus api GET /agents/<agent-id>/versions" prints them — or from the API
  reference. Prompt variants replace this surface.
`
  );

  version.addHelpText(
    "after",
    `
AN AGENT HAS TWO PROMPTS, AND THEY ARE NOT THE SAME PROMPT:
  • the DRAFT — the agent's own prompt, what "nexus agent update --prompt"
    and "version restore" write;
  • the PRODUCTION VERSION — one row of history, and what the agent actually
    runs. Exactly one version is production at a time, so "version publish"
    is a MOVE: it un-marks whichever version was production before.

WHICH ONE RUNS: an agent that has NEVER published runs its draft. The moment
anything publishes a version, the draft stops being served and the published
version is what every conversation gets — until you publish another one.
"version restore" writes the DRAFT ONLY, so on a published agent it changes
nothing at runtime and reports no error. Publish afterwards, or it did not
happen.

TWO TYPES. AUTO versions are written for you whenever the prompt changes.
CHECKPOINT versions are the ones "version create" makes. Both can be renamed,
deleted and published — the type is a label about origin, not a protection.`
  );

  registerVersionListCommand(version, program);
  registerVersionGetCommand(version, program);
  registerVersionCreateCommand(version, program);
  registerVersionUpdateCommand(version, program);
  registerVersionDeleteCommand(version, program);
  registerVersionRestoreCommand(version, program);
  registerVersionPublishCommand(version, program);
}
