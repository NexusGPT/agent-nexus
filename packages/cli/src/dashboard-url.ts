import { resolveDashboardUrl } from "./config";

/**
 * THE DASHBOARD LINK FOR A RESOURCE THIS CLI JUST TOUCHED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A RETURNED FIELD AND NOT A PATTERN IN `--help`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every mutation ends with a human wanting to open the thing. The path patterns
 * that get them there were written down OUTSIDE this repository — in an
 * always-loaded operating document — where nothing checks them and nothing
 * notices when the SPA renames a route. A caller who assembles a URL from a
 * pattern they read somewhere is one rename away from a 404 they will read as
 * "the resource was not created".
 *
 * Printing the pattern into `--help` moves the copy without fixing the class:
 * `--help` is a string in this package and the routes are in another one, so the
 * two still drift, silently, in the direction that looks correct. A RETURNED
 * FIELD cannot drift for the caller — whatever this function computes is what
 * they open. That moves the whole problem to ONE place, which is this file, and
 * a single place is something a gate can hold.
 *
 * ── THE GATE, AND WHAT IT CAN AND CANNOT SEE ────────────────────────────────
 *
 * `dashboard-url.test.ts` reads the SPA's own route table —
 * `apps/frontend/src/routes.tsx`, which is an explicit literal list by design —
 * and asserts every pattern below matches a route declared there. A renamed
 * route turns this package red rather than turning a link into a 404.
 *
 * 🚨 IT CHECKS THE PATH, NEVER THE PAGE. A route that still exists and now
 * renders something else passes, and nothing here could tell the difference. It
 * also runs only inside the monorepo: a published tarball has no `apps/`, so
 * this is a CI gate and not a runtime one. Both limits are the reason the
 * patterns are few and boring.
 *
 * ⚠️ THE HOST IS RESOLVED PER CALL, NOT CACHED. `resolveDashboardUrl` reads the
 * active profile, and `--dashboard-url` overrides it for one invocation. A
 * module-level constant would bake whichever profile happened to be active when
 * the process started, which is right until a command switches profiles.
 */

/**
 * A resource with a stable page in the dashboard SPA.
 *
 * Deliberately NOT one entry per command. Several commands answer with the same
 * resource, and a key per command is a second list to keep in step with the
 * first.
 */
export type DashboardResource =
  | "agent"
  | "agentSkills"
  | "workflow"
  | "deployment"
  | "aiTask"
  | "aiTaskEvaluation"
  | "externalTool"
  | "documentTemplate"
  | "documents";

/**
 * Path for each resource, with `{id}` standing in for the identifier.
 *
 * Written with the SPA's own spelling of the parameter dropped, because the
 * gate compares SEGMENTS: a route's `:agent-id` and this map's `{id}` both
 * reduce to "one parameter here", and requiring the names to match would make
 * this file red on a rename that changes nothing a caller can observe.
 *
 * `documents` takes no id — the SPA has no per-document page, only the library.
 * That is a fact about the dashboard, so it is recorded here rather than left
 * to each call site to discover.
 */
const PATHS: Readonly<Record<DashboardResource, string>> = {
  agent: "/app/my-agents/{id}/tabs/prompt",
  agentSkills: "/app/my-agents/{id}/tabs/skills",
  workflow: "/app/workflows/{id}",
  deployment: "/app/deployments/{id}",
  aiTask: "/app/my-ai-tasks/{id}",
  // The evaluation view for an AI task lives under my-tools, not my-ai-tasks.
  // It reads like a mistake and it is what the SPA declares.
  aiTaskEvaluation: "/app/my-tools/{id}/evaluate",
  externalTool: "/app/my-tools/{id}",
  documentTemplate: "/app/document-templates/{id}",
  documents: "/app/documents"
};

/** Every pattern, for the gate. Never read at runtime. */
export const DASHBOARD_PATHS = PATHS;

/**
 * The globals that decide WHICH dashboard a link points at.
 *
 * 🚨 IT TAKES THE OBJECT, NOT ONE FIELD, AND THAT SHAPE IS THE FIX. The first
 * version of this took a bare `override?: string`, so every call site passed
 * `globals.dashboardUrl` and silently dropped `globals.profile` — while the
 * request itself went through `resolveBaseUrl(globals.baseUrl, globals.profile)`
 * and honoured it. `--profile staging` therefore created a resource on staging
 * and returned a link to production, where the link opens, the dashboard is the
 * wrong org's, and the resource is not there. It reads as a failed write.
 *
 * A call site that is handed `optsWithGlobals()` whole cannot forget half of it,
 * which is why the signature is this and not two optional strings.
 */
export interface DashboardUrlContext {
  /** The global `--dashboard-url`, when one was passed. */
  readonly dashboardUrl?: string;
  /** The global `--profile`, so the link follows the environment the request went to. */
  readonly profile?: string;
}

/**
 * The dashboard URL for one resource, or `undefined` when there is no id to
 * build it from.
 *
 * 🚨 `undefined` RATHER THAN A URL WITH A HOLE IN IT. A route answers 200 for
 * `/app/workflows/undefined` and renders an error page, so a link built from a
 * missing id is worse than no link: it looks openable. Returning `undefined`
 * makes the key vanish from the JSON document, which is a shape a consumer can
 * test.
 *
 * @param resource which page to link to
 * @param id the resource's identifier; ignored by id-less resources
 * @param context the command's resolved globals — pass `optsWithGlobals()` whole
 */
export function dashboardUrlFor(
  resource: DashboardResource,
  id: unknown,
  context: DashboardUrlContext = {}
): string | undefined {
  const pattern = PATHS[resource];
  const base = resolveDashboardUrl(context.dashboardUrl, context.profile).replace(/\/+$/, "");

  if (!pattern.includes("{id}")) return `${base}${pattern}`;
  if (typeof id !== "string" || id === "") return undefined;

  return `${base}${pattern.replace("{id}", encodeURIComponent(id))}`;
}
