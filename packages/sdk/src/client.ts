import { NexusError } from "./errors";
import { HttpClient } from "./http-client";
import { AgentCollectionsResource } from "./resources/agent-collections";
import { AgentsResource } from "./resources/agents";
import { AnalyticsResource } from "./resources/analytics";
import { ChannelsResource } from "./resources/channels";
import { CloudImportsResource } from "./resources/cloud-imports";
import { ConversationsResource } from "./resources/conversations";
import { CredentialsResource } from "./resources/credentials";
import { CuePromptEditorResource } from "./resources/cue-prompt-editor";
import { CustomModelsResource } from "./resources/custom-models";
import { CustomersResource } from "./resources/customers";
import { DeploymentFoldersResource } from "./resources/deployment-folders";
import { DeploymentsResource } from "./resources/deployments";
import { DocsResource } from "./resources/docs";
import { DocumentTemplateFoldersResource } from "./resources/document-template-folders";
import { DocumentsResource } from "./resources/documents";
import { EmulatorResource } from "./resources/emulator";
import { EvaluationsResource } from "./resources/evaluations";
import { FoldersResource } from "./resources/folders";
import { MeResource } from "./resources/me";
import { ModelsResource } from "./resources/models";
import { PhoneNumbersResource } from "./resources/phone-numbers";
import { PromptAssistantResource } from "./resources/prompt-assistant";
import { SkillFoldersResource } from "./resources/skill-folders";
import { SkillsResource } from "./resources/skills";
import { TicketsResource } from "./resources/tickets";
import { ToolConnectionResource } from "./resources/tool-connection";
import { ToolDiscoveryResource } from "./resources/tool-discovery";
import { TracingResource } from "./resources/tracing";
import { WorkflowExecutionsResource } from "./resources/workflow-executions";
import { WorkflowsResource } from "./resources/workflows";
import { WorkspacesResource } from "./resources/workspaces";

// ============================================================================
// Client options
// ============================================================================

export interface NexusClientOptions {
  /**
   * API key for authentication. Falls back to `NEXUS_API_KEY` env var.
   * Generate one in the Nexus dashboard under Settings > API Keys.
   */
  apiKey?: string;

  /**
   * Base URL of the Nexus API. Falls back to `NEXUS_BASE_URL` env var,
   * then defaults to `https://api.nexusgpt.io`.
   */
  baseUrl?: string;

  /**
   * Custom `fetch` implementation (e.g., for testing or non-standard runtimes).
   * Defaults to the global `fetch`.
   */
  fetch?: typeof globalThis.fetch;

  /**
   * Additional headers sent with every request.
   */
  defaultHeaders?: Record<string, string>;

  /**
   * Request timeout in milliseconds. Defaults to 30 000 (30 s).
   */
  timeout?: number;
}

// ============================================================================
// Env helpers (isomorphic-safe)
// ============================================================================

function getEnv(key: string): string | undefined {
  try {
    return typeof process !== "undefined" ? process.env[key] : undefined;
  } catch {
    return undefined;
  }
}

// ============================================================================
// NexusClient
// ============================================================================

/**
 * Main entry point for the Nexus SDK.
 *
 * ```ts
 * import { NexusClient } from "@agent-nexus/sdk";
 *
 * const client = new NexusClient({ apiKey: "nxs_..." });
 *
 * // Agents
 * const { data: agents } = await client.agents.list();
 * const agent = await client.agents.create({ firstName: "A", lastName: "B", role: "Assistant" });
 *
 * // Agent tools (sub-resource)
 * const tools = await client.agents.tools.list(agent.id);
 *
 * // Prompt versions (sub-resource)
 * const { data: versions } = await client.agents.versions.list(agent.id);
 *
 * // Folders
 * const { folders } = await client.folders.list();
 *
 * // Tool discovery (search, detail, credentials, dynamic options, skills, test)
 * const results = await client.tools.search({ q: "gmail" });
 * const detail = await client.tools.get(results.tools[0].id);
 * ```
 */
export class NexusClient {
  /** Manage agents, their tool configurations, and prompt versions. */
  public readonly agents: AgentsResource;

  /** Search Nexus product documentation. */
  public readonly docs: DocsResource;

  /** Create documents via file upload, text, website, or Google Sheet import. */
  public readonly documents: DocumentsResource;

  /** Manage folders and agent-folder assignments. */
  public readonly folders: FoldersResource;

  /** Get organization info for the current API key. */
  public readonly me: MeResource;

  /** List available AI models for agents. */
  public readonly models: ModelsResource;

  /** Manage custom AI models with OpenAI-compatible endpoints. */
  public readonly customModels: CustomModelsResource;

  /** Discover marketplace tools, resolve dynamic options, list skills, and test configured tools. */
  public readonly tools: ToolDiscoveryResource;

  /** Browse workflows, AI tasks, collections, and document templates. */
  public readonly skills: SkillsResource;

  /** Manage workflows, nodes, edges, and test executions. */
  public readonly workflows: WorkflowsResource;

  /** Manage workspaces (shared file drives) and browse their files. */
  public readonly workspaces: WorkspacesResource;

  /** Connect tools via OAuth or HTTP credentials. */
  public readonly toolConnection: ToolConnectionResource;

  /** Deploy agents to channels (web widget, WhatsApp, Telegram, etc.). */
  public readonly deployments: DeploymentsResource;

  /** Test deployments with the emulator — sessions, messages, and replayable scenarios. */
  public readonly emulator: EmulatorResource;

  /** Organize deployments into folders. */
  public readonly deploymentFolders: DeploymentFoldersResource;

  /** Organize document templates into folders. */
  public readonly documentTemplateFolders: DocumentTemplateFoldersResource;

  /** Organization analytics and metrics. */
  public readonly analytics: AnalyticsResource;

  /** Attach knowledge collections to agents. */
  public readonly agentCollections: AgentCollectionsResource;

  /** View and debug workflow execution history. */
  public readonly workflowExecutions: WorkflowExecutionsResource;

  /** Evaluate and benchmark AI tasks. */
  public readonly evaluations: EvaluationsResource;

  /** Import documents from Google Drive, SharePoint, Notion. */
  public readonly cloudImports: CloudImportsResource;

  /** Chat with AI to generate high-quality prompts for agents and AI tasks. */
  public readonly promptAssistant: PromptAssistantResource;

  /** Organize workflows and AI tasks into skill folders. */
  public readonly skillFolders: SkillFoldersResource;

  /** Search, buy, and manage phone numbers for SMS/Voice deployments. */
  public readonly phoneNumbers: PhoneNumbersResource;

  /** Create and manage support tickets. */
  public readonly tickets: TicketsResource;

  /** Set up deployment channels: connections, phone numbers, WhatsApp senders, and setup orchestrator. */
  public readonly channels: ChannelsResource;

  /** View LLM traces, generations, analytics, and export data. */
  public readonly tracing: TracingResource;

  /** List, search, and manage inbox conversations, messages, and assignments. */
  public readonly conversations: ConversationsResource;

  /** Manage credentials and access cards for enterprise credential inventory. */
  public readonly credentials: CredentialsResource;

  /** Manage CRM customers. */
  public readonly customers: CustomersResource;

  /** Cue AI subsystem — prompt editor and (future) other subsystems. */
  public readonly cue: {
    /** Edit agent prompts through conversational AI. */
    promptEditor: CuePromptEditorResource;
  };

  constructor(opts: NexusClientOptions = {}) {
    const apiKey = opts.apiKey ?? getEnv("NEXUS_API_KEY");
    if (!apiKey) {
      throw new NexusError(
        "No API key provided. Pass `apiKey` in options or set the NEXUS_API_KEY environment variable."
      );
    }

    const baseUrl = opts.baseUrl ?? getEnv("NEXUS_BASE_URL") ?? "https://api.nexusgpt.io";

    const http = new HttpClient({
      baseUrl,
      apiKey,
      fetch: opts.fetch,
      defaultHeaders: opts.defaultHeaders,
      timeout: opts.timeout
    });

    this.agents = new AgentsResource(http);
    this.docs = new DocsResource(http);
    this.documents = new DocumentsResource(http);
    this.folders = new FoldersResource(http);
    this.me = new MeResource(http);
    this.models = new ModelsResource(http);
    this.customModels = new CustomModelsResource(http);
    this.tools = new ToolDiscoveryResource(http);
    this.skills = new SkillsResource(http);
    this.workflows = new WorkflowsResource(http);
    this.workspaces = new WorkspacesResource(http);
    this.toolConnection = new ToolConnectionResource(http);
    this.deployments = new DeploymentsResource(http);
    this.emulator = new EmulatorResource(http);
    this.deploymentFolders = new DeploymentFoldersResource(http);
    this.documentTemplateFolders = new DocumentTemplateFoldersResource(http);
    this.analytics = new AnalyticsResource(http);
    this.agentCollections = new AgentCollectionsResource(http);
    this.workflowExecutions = new WorkflowExecutionsResource(http);
    this.evaluations = new EvaluationsResource(http);
    this.cloudImports = new CloudImportsResource(http);
    this.promptAssistant = new PromptAssistantResource(http);
    this.skillFolders = new SkillFoldersResource(http);
    this.phoneNumbers = new PhoneNumbersResource(http);
    this.tickets = new TicketsResource(http);
    this.channels = new ChannelsResource(http);
    this.tracing = new TracingResource(http);
    this.conversations = new ConversationsResource(http);
    this.credentials = new CredentialsResource(http);
    this.customers = new CustomersResource(http);
    this.cue = {
      promptEditor: new CuePromptEditorResource(http)
    };
  }
}
