/**
 * HUMAN-AUTHORED FRONTMATTER, PRESERVED ACROSS GENERATION.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A GENERATED PAGE THAT IS UNIFORMLY TRUE AND STRICTLY LESS USEFUL IS A
 * REGRESSION, AND NO EQUALITY GATE CAN SEE IT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Three frontmatter fields cannot be derived from the commander tree, and the
 * first draft of the generator silently dropped or downgraded all three:
 *
 *   · `icon` — hand-chosen per namespace (`bot`, `cpu`, `shield-check`, …) and
 *     read by `docs-content.ts` into `NavPage.icon`, so it renders in the docs
 *     sidebar and in every `<Card>`. 47 of 48 live pages carry one; the only
 *     page without was the first generated one. There is nothing in a Command
 *     object that could invent it.
 *   · `description` — the authored copy is written for a reader and for search
 *     ("List the AI models available to your organization … including each
 *     model's provider, ID, and context window"). `command.description()` is a
 *     terse operator string ("Manage AI models"). It feeds the nav subtitle, the
 *     `<Card>` blurb, the ZeroEntropy index and the `llms-full.txt` blockquote,
 *     so replacing it with the terse form degrades four surfaces at once.
 *   · `title` — "Access Cards CLI", not "access-card CLI".
 *
 * So they are harvested from the pages as they stood before the migration and
 * declared here. Generation replaces the BODY; the human's framing survives.
 *
 * ── WHY A DECLARED TABLE AND NOT A READ-BACK FROM THE PAGE ──────────────────
 *
 * Reading the current page's frontmatter and re-emitting it would make the
 * generator's output depend on its own previous output. The first bad write
 * becomes permanent, and a page whose frontmatter was mangled repairs itself
 * into the mangled form forever. A declared table is reviewable in a diff and
 * cannot drift onto itself.
 *
 * A namespace missing from this table is a FAILURE, not a default — see
 * `cli-docs-are-generated.test.ts`. Adding a namespace to the CLI therefore
 * requires one line here, which is the cheapest possible prompt to choose an
 * icon and write a sentence.
 */

export interface AuthoredFrontmatter {
  readonly title: string;
  readonly icon: string;
  readonly description: string;
}

export const AUTHORED_FRONTMATTER: Readonly<Record<string, AuthoredFrontmatter>> = {
  "access-card": {
    title: "Access Cards CLI",
    icon: "shield-check",
    description:
      "Create and manage access cards — credential-level policies that scope which actions and parameters a tool credential may perform."
  },
  "agent-collection": {
    title: "Agent Collections CLI",
    icon: "library",
    description:
      "List, attach, and detach the knowledge collections an agent can retrieve from — straight from the command line."
  },
  "agent-eval": {
    title: "Agent Evaluation CLI",
    icon: "chart-bar",
    description:
      "Run LLM-as-judge evaluations over multi-turn agent conversations from the command line — create and execute runs, batch-audit inbox conversations, manage tester/judge/summary templates, schedule recurring checks, and wire up automation triggers and webhooks."
  },
  "agent-skill": {
    title: "Agent Skills CLI",
    icon: "sparkles",
    description:
      "Attach Claude Code skill bundles — the Anthropic office and skill-creator baselines, or your own folder — to a code-interpreter agent from the command line."
  },
  "agent-tool": {
    title: "Agent Tools CLI",
    icon: "wrench",
    description:
      "Attach, configure, and remove the tools an agent can call — plugins, workflows, tasks, and knowledge collections — from the command line."
  },
  agent: {
    title: "Agent CLI",
    icon: "bot",
    description:
      "Create, configure, and manage AI agents from the command line — list, inspect, create, update, delete, duplicate, and set profile pictures."
  },
  analytics: {
    title: "Analytics CLI",
    icon: "bar-chart-3",
    description:
      "Pull conversation, cost, and satisfaction metrics for your organization, and export them as CSV from the command line."
  },
  api: {
    title: "API Passthrough CLI",
    icon: "terminal",
    description:
      "Call any Nexus Public API v1 endpoint directly from the command line, with authentication, base URL, and response formatting handled for you."
  },
  auth: {
    title: "Authentication CLI",
    icon: "key-round",
    description:
      "Log in, store API keys, and manage named profiles so the CLI knows which workspace and key to use for every command."
  },
  channel: {
    title: "Channels CLI",
    icon: "antenna",
    description:
      "Set up deployment channels — messaging connections, WhatsApp senders, and WhatsApp message templates — from the command line."
  },
  "claude-code": {
    title: "Claude Code Skills CLI",
    icon: "sparkles",
    description:
      "List and install the Claude Code skills bundled with your Nexus CLI version into your project — no network calls, no API key required."
  },
  chat: {
    title: "Chat CLI",
    icon: "message-circle",
    description:
      "Mint a browser chat session and stream an agent turn from the terminal — the same two-hop credential flow a customer-built chat UI uses, in the Vercel AI SDK UI Message Stream format."
  },
  "cloud-import": {
    title: "Cloud Import CLI",
    icon: "cloud-download",
    description:
      "Import documents into your knowledge base from Google Drive, SharePoint, and Notion — from the command line."
  },
  collection: {
    title: "Collection CLI",
    icon: "library",
    description:
      "Manage knowledge collections from the command line — list, inspect, create, update, delete, search, and curate the documents inside each collection."
  },
  conversation: {
    title: "Conversations CLI",
    icon: "messages-square",
    description:
      "List, search, inspect, reply to, assign, comment on, and close inbox conversations from the command line."
  },
  credential: {
    title: "Credentials CLI",
    icon: "key-round",
    description:
      "List, inspect, rename, and delete the OAuth connections, API keys, and tool credentials your agents and workflows use to reach external services — from the command line."
  },
  cue: {
    title: "Cue Transcripts CLI",
    icon: "file-json",
    description:
      "List Cue conversations and export their full JSON transcripts — every turn, tool call, tool result and reasoning block, plus the complete transcript of every subagent a session spawned — one conversation at a time or in bulk across a date range."
  },
  "custom-model": {
    title: "Custom Models CLI",
    icon: "cpu",
    description:
      "Register, list, update, and delete custom AI models backed by your own OpenAI-compatible endpoints — from the command line."
  },
  customer: {
    title: "Customers CLI",
    icon: "users",
    description:
      "List, look up, create, update, annotate, and delete the CRM customer records behind your agent conversations — from the command line."
  },
  deployment: {
    title: "Deployment CLI",
    icon: "rocket",
    description:
      "Deploy agents to channels and manage deployments from the command line — list, inspect, create, update, delete, duplicate, view stats, configure the embed widget, organize folders, and manage WhatsApp templates."
  },
  docs: {
    title: "Docs CLI",
    icon: "book-open",
    description:
      "Browse, fetch, and semantically search the Nexus product documentation from the command line."
  },
  document: {
    title: "Documents CLI",
    icon: "file-text",
    description:
      "List, upload, create, organize, and manage the knowledge documents your agents draw on — from the command line."
  },
  emulator: {
    title: "Emulator CLI",
    icon: "flask-conical",
    description:
      "Test agent deployments from the command line — create emulator sessions, send messages with optional debug info, and save and replay sessions as reusable scenarios."
  },
  execution: {
    title: "Execution CLI",
    icon: "activity",
    description:
      "Inspect, diagnose, poll, and debug workflow execution history from the command line — list runs, drill into per-node status, cancel runs, retry failed nodes, and export run data."
  },
  "external-tool": {
    title: "External Tools CLI",
    icon: "plug",
    description:
      "Create, configure, authenticate, test, and execute OpenAPI-based external tools from the command line."
  },
  folder: {
    title: "Agent Folders CLI",
    icon: "folder",
    description:
      "Create, nest, rename, and delete the folders that organize your agents — and assign agents into them — from the command line."
  },
  "html-template": {
    title: "HTML Templates CLI",
    icon: "layout-template",
    description:
      "Manage the rich HTML cards a Web Widget deployment sends into the chat -- list, create, update, delete, render, and agent-fill templates from the command line."
  },
  "known-issues": {
    title: "Known Issues CLI",
    icon: "triangle-alert",
    description:
      "Show the platform issues a human has published against the CLI command you ran. An empty list with polled=false means the server has not checked yet -- it is not a clean bill of health."
  },
  mcp: {
    title: "MCP CLI",
    icon: "plug-zap",
    description:
      "Inspect, call, and serve the Nexus MCP tool surface from the command line — list the tools your API key exposes, invoke one directly, run the stdio bridge on your active profile, and write the config block for Claude Code, Claude Desktop or Cursor."
  },
  model: {
    title: "Model CLI",
    icon: "cpu",
    description:
      "List the AI models available to your organization from the command line, including each model's provider, ID, and context window."
  },
  "phone-number": {
    title: "Phone Numbers CLI",
    icon: "phone",
    description:
      "Search, buy, list, inspect, and release phone numbers for SMS and Voice deployments from the command line."
  },
  "prompt-assistant": {
    title: "Prompt Assistant CLI",
    icon: "wand-sparkles",
    description:
      "Use the AI-powered prompt-writing assistant from the command line to draft and refine agent and AI-task prompts through multi-turn conversations."
  },
  score: {
    title: "Scores CLI",
    icon: "gauge",
    description:
      "Record a measured value against a chat, message, trace or workflow execution, and read back everything scored on one entity — the universal score store, from the command line."
  },
  "skill-folder": {
    title: "Skill Folders CLI",
    icon: "folder-tree",
    description:
      "Create, nest, rename, and delete the folders that organize your skills — and assign workflows and tasks into them — from the command line."
  },
  "task-eval": {
    title: "Task Evaluation CLI",
    icon: "clipboard-check",
    description:
      "Create evaluation sessions, manage test datasets, run evaluations, and judge results for AI tasks from the command line."
  },
  task: {
    title: "Task CLI",
    icon: "list-checks",
    description:
      "Create, configure, and run AI tasks from the command line — list, inspect, create, update, and execute single-prompt AI tasks."
  },
  template: {
    title: "Document Templates CLI",
    icon: "file-text",
    description:
      "List, create, upload, and generate documents from reusable document templates — and organize templates into folders — from the command line."
  },
  ticket: {
    title: "Tickets CLI",
    icon: "ticket",
    description:
      "Create, list, update, comment on, and attach files to the bug reports, feature requests, and improvements your team tracks in Nexus — from the command line."
  },
  tool: {
    title: "Tools CLI",
    icon: "wrench",
    description:
      "Discover marketplace tools, connect credentials, resolve dynamic options, and execute tool actions from the command line."
  },
  tracing: {
    title: "Tracing CLI",
    icon: "activity",
    description:
      "Inspect LLM execution traces and generations, track cost and token usage, run analytics queries, and export trace data from the command line."
  },
  tracks: {
    title: "Tracks CLI",
    icon: "route",
    description:
      "Work with tracks, their nested tasks and their agents from the command line, including claiming a task so other agents know somebody is on it."
  },
  upgrade: {
    title: "Upgrade CLI",
    icon: "arrow-up-circle",
    description:
      "Upgrade the Nexus CLI to the latest published version, with an automatic up-to-date check before installing."
  },
  version: {
    title: "Version CLI",
    icon: "git-branch",
    description:
      "Manage agent prompt versions from the command line — list checkpoints, inspect prompts, create and update checkpoints, delete, restore, and publish a version to production."
  },
  workflow: {
    title: "Workflow CLI",
    icon: "workflow",
    description:
      "Build, configure, test, publish, and manage automation workflows from the command line — workflows, nodes, edges, branches, triggers, and layout."
  },
  workspace: {
    title: "Workspaces CLI",
    icon: "hard-drive",
    description:
      "List, create, rename, and delete Nexus workspaces — and mount one as a live shared drive that local Claude Code can read and write — from the command line."
  },
  // ── The seven namespaces that had NO page before the migration. Icons and
  // descriptions written here for the first time; nothing was overwritten.
  admin: {
    title: "Admin CLI",
    icon: "shield",
    description:
      "Platform administration commands — tenant clusters, vibe build and deployment runners, consumption caps and cost safety."
  },
  asset: {
    title: "Assets CLI",
    icon: "image",
    description: "Upload and manage binary assets from the command line."
  },
  permissions: {
    title: "Permissions CLI",
    icon: "key",
    description:
      "Inspect the permissions and scopes attached to the credential you are authenticated with."
  },
  role: {
    title: "Roles CLI",
    icon: "users",
    description:
      "Create, inspect and assign roles — the permission sets that scope what a member of your organization may do."
  },
  skills: {
    title: "Skills CLI",
    icon: "sparkles",
    description: "Browse and install the skills bundled with the CLI."
  },
  "user-group": {
    title: "User Groups CLI",
    icon: "users-round",
    description:
      "Create and manage user groups — the collections of members that a role or an access policy is applied to."
  },
  vibe: {
    title: "Vibe CLI",
    icon: "rocket",
    description: "Build, deploy, watch and manage vibe applications from the command line."
  }
};
