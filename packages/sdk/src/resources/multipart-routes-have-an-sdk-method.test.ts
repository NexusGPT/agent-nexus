import { ZPublicApiV1 } from "@nexus/types/public-api-v1";
import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { describe, expect, it } from "vitest";

import { NexusClient } from "../client";

/**
 * THE GATE between the Public API v1 upload routes and this SDK's methods.
 *
 * A v1 route whose body is a `multipart/form-data` upload declares it in the
 * contract as `multipart: { field: "<name>" }`. Three facts about such a route
 * are unguessable from the outside — the field name multer will accept, the
 * path, and the verb — and this package hardcodes all three, once per method,
 * by hand. Nothing reconciled them until this file:
 *
 * - `POST /public/v1/skills/tasks/:taskId/evaluations/:sessionId/dataset` had a
 *   contract descriptor, a backend handler and no SDK method at all, for long
 *   enough that `types/evaluations.ts` documented the missing method by name
 *   (`client.evaluations.uploadDataset()`) in two docstrings (NEX-2961).
 * - A field name that does not match is a 400 from multer reading
 *   `Unexpected field`, which names the field the CLIENT sent and never the one
 *   the server wanted.
 *
 * `--max-warnings 0` and `tsc` cannot see any of it: a wrong string literal is
 * a perfectly well-typed wrong string literal.
 *
 * ## Why this lives in the SDK, given the zero-dependency rule
 *
 * `@agent-nexus/sdk` declares `"dependencies": {}` and that is not negotiable —
 * a consumer running `npm i` must not pull `@nexus/types` or zod. It says
 * nothing about DEV dependencies: `vitest` and `@nexus/types` are already both
 * devDependencies, `src/types/types-match-the-v1-contract.test.ts` already
 * imports `ZPublicApiV1` from exactly this entry point, and neither reaches
 * `dist/` (tsup's entry graph is `src/index.ts`) nor the published tarball
 * (`package.json`'s `files` array). So this gate costs a consumer nothing and
 * needs no ratchet in a backend spec reaching across package boundaries.
 *
 * ## It EXECUTES the methods rather than scanning their source
 *
 * Each method is called against a stub `fetch`, and the request it produced is
 * compared to the contract. A regex over `formData.append("…")` would prove the
 * field name and nothing else; driving the call proves the field name, the
 * path, the verb, and that the file survives the append — all at once, and
 * without a second copy of the mapping to keep in step.
 *
 * @see packages/types/src/api/public/v1/multipart-spec.ts — the `multipart`
 * block, and why it carries the field name and nothing else.
 */

/** A v1 descriptor whose body is a file upload. */
interface MultipartRoute {
  method: string;
  path: string;
  multipart: { field: string };
}

function isMultipartRoute(route: unknown): route is MultipartRoute {
  if (typeof route !== "object" || route === null) return false;
  const candidate: {
    method?: unknown;
    path?: unknown;
    multipart?: { field?: unknown };
  } = route;
  return (
    typeof candidate.method === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.multipart?.field === "string"
  );
}

/** Every multipart route the contract declares, keyed by descriptor name. */
const CONTRACT_UPLOAD_ROUTES = new Map<string, MultipartRoute>();
for (const [key, route] of Object.entries(ZPublicApiV1)) {
  if (isMultipartRoute(route)) CONTRACT_UPLOAD_ROUTES.set(key, route);
}

/**
 * How to reach each contract upload route through the SDK.
 *
 * `ids` are the path parameter values, IN PATH ORDER, and the expected URL is
 * built by substituting them into the contract's own `path`. Positional rather
 * than keyed on purpose: the SDK does not know a path parameter's NAME, so
 * renaming `:agentId` must not fail this gate, while adding or removing one
 * must.
 */
interface UploadCall {
  readonly ids: readonly string[];
  readonly call: (
    client: NexusClient,
    ids: readonly string[],
    file: Blob,
    fileName: string
  ) => Promise<unknown>;
}

const SDK_UPLOAD_METHODS: Readonly<Record<string, UploadCall>> = {
  AgentSkillCreate: {
    ids: ["agent-1"],
    call: (client, [agentId], file, fileName) =>
      client.agents.skills.create(agentId, { name: "house-style" }, file, fileName)
  },
  AgentSkillUpload: {
    ids: ["agent-1", "skill-1"],
    call: (client, [agentId, skillId], file, fileName) =>
      client.agents.skills.uploadZip(agentId, skillId, file, fileName)
  },
  AgentUploadProfilePicture: {
    ids: ["agent-1"],
    call: (client, [agentId], file, fileName) =>
      client.agents.uploadProfilePicture(agentId, file, fileName)
  },
  AssetUpload: {
    ids: [],
    call: (client, _ids, file, fileName) => client.assets.upload(file, fileName)
  },
  DocumentUploadFile: {
    ids: [],
    call: (client, _ids, file, fileName) => client.documents.uploadFile(file, fileName)
  },
  EvaluationDatasetUpload: {
    ids: ["task-1", "session-1"],
    call: (client, [taskId, sessionId], file, fileName) =>
      client.evaluations.uploadDataset(taskId, sessionId, file, fileName)
  },
  SkillsUploadDocumentTemplateFile: {
    ids: ["template-1"],
    call: (client, [templateId], file, fileName) =>
      client.skills.uploadDocumentTemplateFile(templateId, file, fileName)
  },
  SkillsUploadExternalToolIcon: {
    ids: ["external-tool-1"],
    call: (client, [externalToolId], file, fileName) =>
      client.skills.uploadExternalToolIcon(externalToolId, file, fileName)
  },
  TicketUploadAttachment: {
    ids: ["ticket-1"],
    call: (client, [ticketId], file, fileName) =>
      client.tickets.uploadAttachment(ticketId, file, fileName)
  },
  WorkflowUploadIcon: {
    ids: ["workflow-1"],
    call: (client, [workflowId], file, fileName) =>
      client.workflows.uploadIcon(workflowId, file, fileName)
  }
};

const BASE_URL = "https://api.invalid.test";

interface CapturedRequest {
  url: string;
  method: string;
  body: FormData;
}

/**
 * A client whose `fetch` records the request and answers a success envelope.
 *
 * The capture is deliberately strict about the body being a `FormData`: an
 * upload method that built a JSON body instead would otherwise reach the
 * per-route assertions as an `undefined` field and read as a naming mistake.
 */
function captureOneRequest(): { client: NexusClient; captured: () => CapturedRequest } {
  let seen: CapturedRequest | undefined;

  const client = new NexusClient({
    apiKey: "test-key",
    baseUrl: BASE_URL,
    fetch: (input, init) => {
      const body = init?.body;
      if (!(body instanceof FormData)) {
        throw new Error(`expected a FormData body, got ${Object.prototype.toString.call(body)}`);
      }
      seen = { url: String(input), method: init?.method ?? "GET", body };
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    }
  });

  return {
    client,
    captured: () => {
      if (seen === undefined) throw new Error("the SDK method sent no request");
      return seen;
    }
  };
}

/** Substitute path parameter values into a contract path, in order. */
function fillPathVars(contractPath: string, ids: readonly string[]): string {
  let consumed = 0;
  const filled = contractPath.replace(/:[A-Za-z0-9_]+/g, () => {
    if (consumed >= ids.length) {
      throw new Error(`${contractPath} has more path parameters than the ${ids.length} ids given`);
    }
    const id = ids[consumed];
    consumed += 1;
    return id;
  });
  if (consumed !== ids.length) {
    throw new Error(`${contractPath} has ${consumed} path parameters, ${ids.length} ids given`);
  }
  return filled;
}

describe("every v1 multipart route has an SDK method that matches the contract", () => {
  /**
   * Without this, every assertion below is vacuous over an empty map — a wrong
   * import specifier resolving to some other module, or a contract that stopped
   * declaring `multipart` at all, would leave both sides empty and green.
   */
  it("actually reached the real v1 contract", () => {
    expect(Object.keys(ZPublicApiV1).length).toBeGreaterThan(200);
    expect(ZPublicApiV1.EvaluationDatasetUpload.path).toBe(
      "/public/v1/skills/tasks/:taskId/evaluations/:sessionId/dataset"
    );
    expect(CONTRACT_UPLOAD_ROUTES.size).toBeGreaterThanOrEqual(8);
  });

  /**
   * EQUALITY, both directions. A new multipart descriptor fails here until a
   * method exists for it, and a registry entry for a route the contract dropped
   * fails here too — the second direction is what stops this list rotting into
   * a record of routes that used to exist.
   */
  it("has one SDK method registered per contract upload route, and no others", () => {
    const declared = [...CONTRACT_UPLOAD_ROUTES.keys()].sort();
    const registered = Object.keys(SDK_UPLOAD_METHODS).sort();

    expect(
      registered,
      `The v1 contract declares these multipart routes: ${declared.join(", ")}.\n` +
        `This SDK registers methods for: ${registered.join(", ")}.\n` +
        `A route missing from the second list has no SDK method — add one to the ` +
        `matching resource and register it in SDK_UPLOAD_METHODS.`
    ).toEqual(declared);
  });

  describe.each(
    eachOrRefuse(
      [...CONTRACT_UPLOAD_ROUTES.entries()],
      "CONTRACT_UPLOAD_ROUTES — every multipart route the v1 contract declares"
    )
  )("%s", (key, route) => {
    const entry = SDK_UPLOAD_METHODS[key];

    it("sends the contract's verb to the contract's path, with the file under the contract's field name", async () => {
      expect(entry, `no SDK method registered for ${key}`).toBeDefined();

      const fileName = "fixture.bin";
      const { client, captured } = captureOneRequest();
      await entry.call(client, entry.ids, new Blob(["dataset"]), fileName);
      const request = captured();

      expect(request.method).toBe(route.method);
      expect(request.url).toBe(`${BASE_URL}/api${fillPathVars(route.path, entry.ids)}`);

      const sent = request.body.get(route.multipart.field);
      expect(
        sent,
        `${key} sends no part named "${route.multipart.field}". multer rejects such a ` +
          `request with "Unexpected field", naming the field the client sent.`
      ).toBeInstanceOf(File);

      // A bare Blob carries no name, so this can only have arrived through the
      // append's third argument — which is what the evaluation dataset route
      // parses JSON-vs-CSV from.
      expect(sent instanceof File ? sent.name : undefined).toBe(fileName);
    });

    /**
     * The control for the assertion above. `FormData.get` returning a value for
     * the declared name proves nothing unless it returns `null` for a name that
     * was never sent.
     */
    it("sends nothing under a field name the contract does not declare", async () => {
      const { client, captured } = captureOneRequest();
      await entry.call(client, entry.ids, new Blob(["dataset"]), "fixture.bin");

      expect(captured().body.get(`not-${route.multipart.field}`)).toBeNull();
    });
  });
});
