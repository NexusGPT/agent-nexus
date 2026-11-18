/**
 * DECLARED DISPOSITIONS, `chat history` … `custom-model update`.
 *
 * ONE SLICE of the single table `./command-classification.ts` assembles. DATA,
 * and nothing else: one `"<path>": "<disposition>"` line per leaf, held in the
 * order the table has always carried them, so which slice a leaf sits in is
 * invisible to every reader of `COMMAND_CLASSIFICATION`.
 *
 * WHAT BELONGS HERE: a leaf whose path falls inside the span above, with a
 * comment where its disposition is surprising. The promotion rules live on
 * `COMMAND_CLASSIFICATION` itself, so there is exactly one copy of them.
 *
 * WHAT DOES NOT: logic of any kind, and no second table —
 * `./sweep-expected-skips.ts` answers what one ENVIRONMENT does, which is a
 * different question from what may be done with a leaf.
 *
 * ⚠️ FILING A LEAF IN THE WRONG SLICE COSTS TIDINESS AND NOTHING ELSE, because
 * the assembler unions them. DECLARING ONE LEAF IN TWO SLICES THROWS, and that
 * refusal is what replaces the `ts(1117)` a single object literal used to get
 * from the compiler for free.
 */

import type { CommandDisposition } from "./disposition";

/** 60 leaves, `chat history` … `custom-model update`. */
export const CHAT_TO_CUSTOM_MODEL: Readonly<Record<string, CommandDisposition>> = {
  // ── chat ───────────────────────────────────────────────────────────────────
  // `chat send` runs the REAL agent on a REAL deployment: a model call, real
  // tools, real cost, and a message written into a customer conversation. It is
  // the emulator's production twin and is never swept.
  //
  // `chat session` looks read-only and is not swept either. It MINTS A LIVE
  // CREDENTIAL — a bearer token for a deployment — and a sweep's output is a CI
  // log. "writes no row" is true and is the wrong question; the answer belongs
  // to nobody once it is printed.
  // The control half — stop, status, resume, history — is `registration-only` rather than
  // `never-execute`, and the distinction is the declared one: each needs a required option (the
  // conversation, by token or by id), and `stop` mutates a live turn. None of the four PRINTS a
  // credential, which is what put the two above out of reach of a sweep whose output is a CI log.
  "chat history": "registration-only",
  "chat resume": "registration-only",
  "chat send": "never-execute",
  "chat session": "never-execute",
  "chat status": "registration-only",
  "chat stop": "registration-only",

  // ── claude-code ────────────────────────────────────────────────────────────
  "claude-code install": "never-execute", // writes files into the caller's ~/.claude
  "claude-code list": "safe",

  // ── cloud-import ───────────────────────────────────────────────────────────
  "cloud-import browse": "registration-only",
  "cloud-import google-drive import": "registration-only",
  "cloud-import google-drive list-files": "registration-only",
  "cloud-import import": "registration-only",
  "cloud-import notion import": "registration-only",
  "cloud-import notion search": "registration-only",
  "cloud-import providers": "safe",
  "cloud-import search": "registration-only",
  "cloud-import sharepoint import": "registration-only",
  "cloud-import sharepoint list-files": "registration-only",

  // ── collection ─────────────────────────────────────────────────────────────
  "collection attach-documents": "registration-only",
  "collection create": "registration-only",
  "collection delete": "registration-only",
  "collection documents": "registration-only",
  "collection get": "registration-only",
  "collection list": "safe",
  "collection query": "registration-only",
  "collection remove-document": "registration-only",
  "collection search": "registration-only",
  "collection search-multiple": "registration-only",
  "collection stats": "registration-only",
  "collection update": "registration-only",

  // ── conversation ───────────────────────────────────────────────────────────
  "conversation assign": "registration-only",
  "conversation assigned-users": "registration-only",
  "conversation close": "registration-only",
  "conversation comment": "registration-only",
  "conversation comments": "registration-only",
  "conversation get": "registration-only",
  "conversation get-metadata": "registration-only",
  "conversation list": "safe",
  "conversation mark-as-read": "registration-only",
  "conversation messages": "registration-only",
  "conversation search": "registration-only",
  "conversation send-message": "registration-only",
  "conversation send-template": "registration-only",
  "conversation update-metadata": "registration-only",
  "conversation update-status": "registration-only",
  "conversation update-topic": "registration-only",

  // ── credential ─────────────────────────────────────────────────────────────
  "credential connect": "registration-only", // starts an OAuth flow / stores a key
  "credential connect-status": "registration-only", // needs a live handshake id
  "credential delete": "registration-only",
  "credential get": "registration-only",
  "credential list": "safe",
  "credential update": "registration-only",

  // ── cue ────────────────────────────────────────────────────────────────────
  // `export` is read-only and needs no input, but it would not be swept even
  // once its route is live: it is rate limited to 5 requests per minute per
  // organization and a bare invocation pulls the org's whole transcript corpus
  // to stdout. A sweep firing it every run would spend the limit a real export
  // needs and move megabytes to do it.
  //
  // `cue conversations` is `safe` by every property the disposition describes —
  // read-only, no required input, emits `--json` — and `GET /public/v1/cue/
  // conversations` answers 200 on staging, so the sweep watches it.
  "cue conversations": "safe",
  "cue export": "registration-only",
  "cue transcript": "registration-only",

  // ── custom-model ───────────────────────────────────────────────────────────
  "custom-model create": "registration-only",
  "custom-model delete": "registration-only",
  "custom-model get": "registration-only",
  "custom-model list": "safe",
  "custom-model update": "registration-only"
};
