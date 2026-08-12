import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { registerCloudImportCommands } from "./cloud-import";
import { registerCollectionCommands } from "./collection";
import { registerDocumentCommands } from "./document";
import { registerTaskCommands } from "./task";
import { registerTemplateCommands } from "./template";

/**
 * THE HELP CARRIES THE TRAP, ON THE COMMAND THE TRAP BELONGS TO.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * NEX-3626 sets one test for this help text: paste a command's `--help` into an
 * agent prompt with no other source, and the agent must use the command
 * correctly first time — INCLUDING the cases where it would otherwise silently
 * do the wrong thing. Every phrase asserted below is one of those cases. Each
 * was measured against the backend before it was written, and each names a
 * behaviour whose absence from help costs the reader a silent failure rather
 * than an error message.
 *
 * WHY THE ASSERTIONS ARE PER-SUBCOMMAND, NOT PER-FILE. A `grep` of the source
 * would pass while a warning sat on the wrong command, and a warning on the
 * wrong command is worse than no warning: it is read by somebody who is not
 * about to hit it, and missed by somebody who is. So each phrase is matched
 * against the RENDERED help of one named subcommand, which is what the caller
 * actually sees, and the two most-confusable pairs additionally assert the
 * warning is ABSENT from the sibling it is easy to slide onto.
 *
 * WHY WHITESPACE IS NORMALIZED. `helpInformation()` wraps to the terminal
 * width, so a phrase that fits on one line here can arrive split across two.
 * Collapsing runs of whitespace compares the SENTENCE rather than the layout,
 * and keeps a reflow from reddening a suite that is about content.
 */

type Register = (program: Command) => void;

/**
 * The rendered `--help` body of `nexus <namespace> <sub...>`, whitespace-normalized.
 *
 * `outputHelp()`, NOT `helpInformation()`. Every block this suite is about is
 * registered through `addHelpText("after", …)`, and commander appends those by
 * emitting help events from `outputHelp` — `helpInformation()` renders only the
 * usage/options core, so asserting against it would pass on an empty Notes
 * block and prove nothing.
 */
function helpFor(register: Register, namespace: string, ...path: string[]): string {
  const program = new Command();
  program.name("nexus").exitOverride();
  register(program);

  let current = program.commands.find((c) => c.name() === namespace);
  if (!current) throw new Error(`no "${namespace}" command registered`);

  for (const name of path) {
    const next: Command | undefined = current.commands.find((c) => c.name() === name);
    if (!next) throw new Error(`no "${namespace} ${path.join(" ")}" command registered`);
    current = next;
  }

  const chunks: string[] = [];
  current.configureOutput({ writeOut: (str) => chunks.push(str) });
  current.outputHelp();

  return chunks.join("").replace(/\s+/g, " ");
}

/**
 * One silent failure the help has to name, and the command it belongs to.
 *
 * `phrase` is matched literally after normalization, so it doubles as the
 * wording review: changing the sentence is a deliberate edit here, not a
 * drive-by rewrite of a measured claim.
 */
interface HelpClaim {
  readonly what: string;
  readonly register: Register;
  readonly namespace: string;
  readonly path: readonly string[];
  readonly phrases: readonly string[];
}

const CLAIMS: readonly HelpClaim[] = [
  // ── collection (NEX-3643) ────────────────────────────────────────────────
  {
    what: "collection attach-documents names the folder drop",
    register: registerCollectionCommands,
    namespace: "collection",
    path: ["attach-documents"],
    phrases: [
      "SILENTLY DROPS FOLDER DOCUMENTS",
      "ALL OR NOTHING ON EXISTENCE",
      "ATTACH DOCUMENTS THAT ARE READY"
    ]
  },
  {
    what: "collection remove-document names the idempotence and the retrieval lag",
    register: registerCollectionCommands,
    namespace: "collection",
    path: ["remove-document"],
    phrases: [
      "REMOVES THE LINK, NOT THE DOCUMENT",
      "SUCCESS IS NOT EVIDENCE ANYTHING WAS REMOVED",
      "RETRIEVAL KEEPS ANSWERING FROM THE REMOVED DOCUMENT FOR A WHILE"
    ]
  },
  {
    what: "collection search says it does not rank and does not read content",
    register: registerCollectionCommands,
    namespace: "collection",
    path: ["search"],
    phrases: ["EVERY HIT SCORES 1.000", "Matches document NAMES only"]
  },
  {
    what: "collection search-multiple answers the names-or-content question",
    register: registerCollectionCommands,
    namespace: "collection",
    path: ["search-multiple"],
    phrases: [
      "Matches document NAMES, exactly like \"nexus collection search\"",
      "METADATA IS ALWAYS null"
    ]
  },
  {
    what: "collection query explains empty results after an attach",
    register: registerCollectionCommands,
    namespace: "collection",
    path: ["query"],
    phrases: ["EMPTY RESULTS STRAIGHT AFTER ATTACHING USUALLY MEAN INDEXING"]
  },
  {
    what: "collection create names the body-only booleans and the defaults",
    register: registerCollectionCommands,
    namespace: "collection",
    path: ["create"],
    phrases: [
      "--k defaults to 10",
      "preciseResponses and includeMetadata are --body ONLY",
      "both default to false"
    ]
  },
  {
    what: "collection update names the silently ignored slug",
    register: registerCollectionCommands,
    namespace: "collection",
    path: ["update"],
    phrases: ["A \"name\" in --body IS ACCEPTED AND SILENTLY IGNORED"]
  },
  {
    what: "collection delete says the documents survive",
    register: registerCollectionCommands,
    namespace: "collection",
    path: ["delete"],
    phrases: ["THE DOCUMENTS SURVIVE"]
  },

  // ── task (NEX-3642) ──────────────────────────────────────────────────────
  {
    what: "task create names the required generation object and the duplicate refusal",
    register: registerTaskCommands,
    namespace: "task",
    path: ["create"],
    phrases: [
      "\"generation\" IS REQUIRED AND CANNOT BE EMPTY",
      "THE PROMPT GOES AT THE BODY ROOT",
      "A BYTE-IDENTICAL PROMPT IS REFUSED WITH 409 DUPLICATE_TASK_PROMPT",
      "A SCHEMA WITHOUT ITS FORMAT IS A 400, NOT A SILENT DROP"
    ]
  },
  {
    what: "task get warns its response is not a write body",
    register: registerTaskCommands,
    namespace: "task",
    path: ["get"],
    phrases: ["EVERYTHING IS AT THE TOP LEVEL", "THIS READ IS NOT A WRITE BODY"]
  },
  {
    what: "task update names the lowercase format and the provider-change side effect",
    register: registerTaskCommands,
    namespace: "task",
    path: ["update"],
    phrases: [
      "SEND outputFormat LOWERCASE, AT THE BODY ROOT",
      "CHANGING --model-provider DISCARDS THE PROVIDER-SPECIFIC MODEL SETTINGS"
    ]
  },
  {
    what: "task execute explains the misleading \"Prompt is required\"",
    register: registerTaskCommands,
    namespace: "task",
    path: ["execute"],
    phrases: [
      "\"Prompt is required\" HERE MEANS THE TASK WAS CREATED WITHOUT A PROMPT",
      "A CLIENT TIMEOUT DOES NOT STOP THE SERVER"
    ]
  },

  // ── document (NEX-3644) ──────────────────────────────────────────────────
  {
    what: "document add-website distinguishes the two modes and names the empty sitemap",
    register: registerDocumentCommands,
    namespace: "document",
    path: ["add-website"],
    phrases: [
      "--mode sitemap WITHOUT config.urls FETCHES NOTHING AND STILL SUCCEEDS",
      "THE RESPONSE ID IS A FOLDER, AND 201 MEANS THE CRAWL STARTED",
      "THE FOLDER REACHES READY BEFORE ITS PAGES ARE SEARCHABLE",
      "It does not read /sitemap.xml and it does not follow links"
    ]
  },
  {
    what: "document create-google-sheet names the sharing precondition",
    register: registerDocumentCommands,
    namespace: "document",
    path: ["create-google-sheet"],
    phrases: [
      "THE SPREADSHEET MUST BE READABLE BY ANYONE WITH THE LINK",
      "THE RESULT IS A FOLDER PLUS ONE DOCUMENT PER TAB"
    ]
  },
  {
    what: "document create-folder says a folder holds no content",
    register: registerDocumentCommands,
    namespace: "document",
    path: ["create-folder"],
    phrases: ["A FOLDER IS A DOCUMENT WITH NO CONTENT"]
  },
  {
    what: "document update names the metadata replacement",
    register: registerDocumentCommands,
    namespace: "document",
    path: ["update"],
    phrases: [
      "--metadata REPLACES THE WHOLE METADATA BAG, IT DOES NOT MERGE",
      "METADATA CHANGES DO NOT REACH SEARCH UNTIL YOU REPROCESS"
    ]
  },
  {
    what: "document delete names the blast radius",
    register: registerDocumentCommands,
    namespace: "document",
    path: ["delete"],
    phrases: [
      "THIS REMOVES THE DOCUMENT FROM EVERY COLLECTION HOLDING IT",
      "DELETING A FOLDER TAKES ITS CHILDREN WITH IT"
    ]
  },

  // ── template (NEX-3645) ──────────────────────────────────────────────────
  {
    what: "template create names the required type and the absent flag",
    register: registerTemplateCommands,
    namespace: "template",
    path: ["create"],
    phrases: ["type IS REQUIRED AND THERE IS NO --type FLAG", "POWERPOINT_TEMPLATE"]
  },
  {
    what: "template get is named as the only source of variable names",
    register: registerTemplateCommands,
    namespace: "template",
    path: ["get"],
    phrases: ["--json IS THE ONLY WAY TO DISCOVER A TEMPLATE'S VARIABLE NAMES"]
  },
  {
    what: "template generate names the ignored variables and the public URL",
    register: registerTemplateCommands,
    namespace: "template",
    path: ["generate"],
    phrases: [
      "THE VARIABLE NAMES MUST BE THE TEMPLATE'S OWN",
      "THE RETURNED url IS PUBLIC AND DOES NOT EXPIRE"
    ]
  },
  {
    what: "template folder assign says it is a move",
    register: registerTemplateCommands,
    namespace: "template",
    path: ["folder", "assign"],
    phrases: ["THIS IS A MOVE, NOT AN ADD"]
  },

  // ── cloud-import (NEX-3646) ──────────────────────────────────────────────
  {
    what: "cloud-import import names the asynchrony and the skipped items",
    register: registerCloudImportCommands,
    namespace: "cloud-import",
    path: ["import"],
    phrases: [
      "IMPORT IS ASYNCHRONOUS",
      "AN UNREADABLE ITEM IS SKIPPED WITHOUT AN ERROR",
      "--site-id IS REQUIRED FOR SHAREPOINT",
      "--parent-id NAMES THE DESTINATION FOLDER IN NEXUS"
    ]
  },
  {
    what: "cloud-import browse says where item ids come from",
    register: registerCloudImportCommands,
    namespace: "cloud-import",
    path: ["browse"],
    phrases: ["THIS IS WHERE ITEM IDS COME FROM", "A PAGE IS NOT THE WHOLE FOLDER"]
  }
];

describe("knowledge & content --help carries the behavioural facts", () => {
  for (const claim of CLAIMS) {
    it(claim.what, () => {
      const help = helpFor(claim.register, claim.namespace, ...claim.path);

      for (const phrase of claim.phrases) {
        expect(help, `${claim.namespace} ${claim.path.join(" ")} --help`).toContain(
          phrase.replace(/\s+/g, " ")
        );
      }
    });
  }

  /**
   * A warning on the wrong sibling is the failure mode this guards. Both pairs
   * below read as interchangeable from the command list and are not: only
   * ATTACHING drops folders, and only REMOVING lags retrieval.
   */
  it("puts the folder-drop warning on attach-documents, not on remove-document", () => {
    const remove = helpFor(registerCollectionCommands, "collection", "remove-document");
    expect(remove).not.toContain("SILENTLY DROPS FOLDER DOCUMENTS");
  });

  it("puts the retrieval-lag warning on remove-document, not on attach-documents", () => {
    const attach = helpFor(registerCollectionCommands, "collection", "attach-documents");
    expect(attach).not.toContain("RETRIEVAL KEEPS ANSWERING FROM THE REMOVED DOCUMENT");
  });

  /**
   * The `task create` examples were each a guaranteed 400 before this change:
   * none of them sent a `generation` object, which the create schema requires.
   * A help example that cannot succeed is a wrong instruction, not a missing
   * one, so the examples are asserted to carry what makes them work.
   */
  it("gives task create only examples that can succeed", () => {
    const help = helpFor(registerTaskCommands, "task", "create");
    const examples = help
      .split("Examples:")[1]
      ?.split("Notes:")[0]
      ?.split("$ nexus task create")
      .slice(1);

    expect(examples, "task create --help has an Examples block").toBeDefined();
    expect(examples?.length).toBeGreaterThan(0);

    for (const example of examples ?? []) {
      const carriesFlags =
        example.includes("--expected-input") && example.includes("--expected-output");
      const carriesBody = example.includes("\"generation\"");

      expect(
        carriesFlags || carriesBody,
        `example lacks the generation object create requires: ${example.trim()}`
      ).toBe(true);
    }
  });
});
