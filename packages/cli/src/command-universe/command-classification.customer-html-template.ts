/**
 * DECLARED DISPOSITIONS, `customer create` … `html-template update`.
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

/** 84 leaves, `customer create` … `html-template update`. */
export const CUSTOMER_TO_HTML_TEMPLATE: Readonly<Record<string, CommandDisposition>> = {
  // ── customer ───────────────────────────────────────────────────────────────
  "customer create": "registration-only",
  "customer delete": "registration-only",
  "customer get": "registration-only",
  "customer get-by-external-id": "registration-only",
  "customer list": "safe",
  "customer note": "registration-only",
  "customer update": "registration-only",

  // ── deployment ─────────────────────────────────────────────────────────────
  "deployment create": "registration-only",
  "deployment delete": "registration-only",
  "deployment duplicate": "registration-only",
  "deployment embed-config": "registration-only",
  "deployment embed-config-update": "registration-only",
  "deployment folder assign": "registration-only",
  "deployment folder create": "registration-only",
  "deployment folder delete": "registration-only",
  "deployment folder list": "safe",
  "deployment folder update": "registration-only",
  "deployment get": "registration-only",
  "deployment list": "safe",
  "deployment stats": "registration-only",
  "deployment template attach": "registration-only",
  "deployment template detach": "registration-only",
  "deployment template list": "registration-only",
  "deployment template settings": "registration-only",
  "deployment template update": "registration-only",
  "deployment update": "registration-only",

  // ── docs ───────────────────────────────────────────────────────────────────
  "docs search": "never-execute", // interactive topic browser

  // ── document ───────────────────────────────────────────────────────────────
  "document add-website": "registration-only",
  "document children": "registration-only",
  "document create-folder": "registration-only",
  "document create-google-sheet": "registration-only",
  "document create-text": "registration-only",
  "document delete": "registration-only",
  "document download": "registration-only",
  "document get": "registration-only",
  "document list": "safe",
  "document preview": "registration-only",
  "document reprocess": "registration-only",
  "document update": "registration-only",
  "document upload": "registration-only",

  // ── emulator ───────────────────────────────────────────────────────────────
  "emulator scenario delete": "registration-only",
  "emulator scenario get": "registration-only",
  "emulator scenario list": "registration-only",
  "emulator scenario replay": "registration-only",
  "emulator scenario save": "registration-only",
  "emulator send": "never-execute", // pushes a message into a live emulator session
  "emulator session create": "registration-only",
  "emulator session delete": "registration-only",
  "emulator session get": "registration-only",
  "emulator session list": "registration-only",

  // ── execution ──────────────────────────────────────────────────────────────
  "execution cancel": "registration-only",
  "execution diagnose": "registration-only",
  "execution export": "registration-only",
  "execution follow": "registration-only",
  "execution get": "registration-only",
  "execution list": "safe",
  "execution node-result": "registration-only",
  "execution output": "registration-only",
  "execution poll": "registration-only",
  "execution retry": "registration-only",

  // ── external-tool ──────────────────────────────────────────────────────────
  "external-tool create": "registration-only",
  "external-tool delete": "registration-only",
  "external-tool execute": "registration-only",
  "external-tool get": "registration-only",
  "external-tool initiate-oauth": "never-execute", // opens a browser OAuth flow
  "external-tool list": "safe",
  "external-tool test": "registration-only",
  "external-tool test-auth": "registration-only",
  "external-tool update": "registration-only",
  "external-tool update-auth": "registration-only",
  "external-tool update-spec": "registration-only",
  "external-tool upload-icon": "registration-only",

  // ── folder ─────────────────────────────────────────────────────────────────
  "folder assign": "registration-only",
  "folder create": "registration-only",
  "folder delete": "registration-only",
  "folder list": "safe",
  "folder update": "registration-only",

  // ── html-template ──────────────────────────────────────────────────────────
  "html-template create": "registration-only",
  "html-template delete": "registration-only",
  "html-template fill": "registration-only",
  "html-template get": "registration-only",
  "html-template list": "safe-with-fixture",
  "html-template render": "registration-only",
  "html-template update": "registration-only"
};
