# Compatibility — what `@agent-nexus/cli` promises, and what it does not

This is the stability contract for the `nexus` binary. It says which parts of the
surface you may script against, which parts move, and what counts as a breaking
change for each. Hold us to it.

Every count and every code path named here was read out of this package. Where a
claim is a measurement, the file that produces it is named so you can re-derive it
rather than trust it.

---

## The version number today

The package is `0.x`. Under semver that alone permits any release to break
anything, and the README calls the CLI BETA. That is not the promise we intend to
keep, and it is not how the package has behaved: every release so far has been a
minor or a patch, and every breaking change in `CHANGELOG.md` names what a script
loses. The FORM varies: one carries a `🔴 BREAKING` heading and the rest lead with
a bold sentence inside the entry. Search that file for the word `breaking`, never
for the heading — the heading finds one of them.

So read the version like this, from today until 1.0:

| Change                                                          | Version bump today                                   | Version bump after 1.0 |
| --------------------------------------------------------------- | ---------------------------------------------------- | ---------------------- |
| A break in a STABLE surface                                     | a MINOR bump, announced at the top of `CHANGELOG.md` | major                  |
| A removal from an EVOLVING surface, after its deprecation cycle | minor                                                | minor                  |
| An addition anywhere                                            | minor                                                | minor                  |
| A change in an UNSTABLE surface                                 | patch or minor, no announcement owed                 | patch or minor         |

A `0.x` minor is the strongest signal the version number can carry before 1.0. It
is not a substitute for reading the changelog entry, and this document does not
pretend it is.

**Node.js 18 or newer** (`engines.node: ">=18"`). Raising that floor is a breaking
change under this document.

---

## The four tiers

| Tier         | What it covers                                                                                                                   | May it break?                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **STABLE**   | Command names and required arguments, global flags, the error document, exit 0 and exit 1, destructive-command refusal           | Only in a release that says so, at the top of `CHANGELOG.md`   |
| **EVOLVING** | The `--json` envelope shape per command, per-command optional flags, help text content, the classified command set               | Additions any release; removals only after a deprecation cycle |
| **UNSTABLE** | `--json` payload field names, exit codes other than 0 and 1, table columns and widths, `nexus api`, the `vibe` and `admin` trees | Any release, without notice                                    |
| **INTERNAL** | Hidden commands, stderr prose, config file layout, the bundled SDK                                                               | No promise at all                                              |

---

## STABLE

Breaking any of the following is a deliberate act. It ships with a changelog entry
that names the old behaviour and the new one, and — after 1.0 — a major version.

### The binary and its installation

`npm install -g @agent-nexus/cli` installs one executable, `nexus`, from
`dist/index.js`. The package ships `dist` and nothing else, and declares exactly
one runtime dependency, `commander`. Everything else — including
`@agent-nexus/sdk` — is bundled at build time.

**You may rely on:** the binary name, one global install giving you `nexus` on
`PATH`, and no transitive runtime dependency tree to audit beyond `commander`.

**A break here means:** renaming the binary, splitting it into several, or adding a
runtime dependency.

### Command names and required arguments

The CLI registers **67 top-level commands**, of which **49 are visible** and 18 are
hidden (see INTERNAL). Under them sit **604 command nodes** and **519 invocable
leaves**. Derive these yourself with `deriveCommandNodes()` and
`deriveCommandLeaves()` in `src/command-universe.ts`; they walk the real commander
tree rather than a list somebody maintains.

The 49 visible namespaces:

```
access-card   admin       agent        agent-collection  agent-eval
agent-skill   agent-tool  analytics    api               asset
auth          channel     claude-code  cloud-import      collection
conversation  credential  cue          custom-model      customer
deployment    docs        document     emulator          execution
external-tool folder      html-template  known-issues    mcp
model         permissions phone-number prompt-assistant  role
skill-folder  skills      task         task-eval         template
ticket        tool        tracing      upgrade           user-group
version       vibe        workflow     workspace
```

⚠️ **Two of those 49 are carved out of this tier: `vibe` and `admin`.** They are
visible because operators need to find them, not because they are stable. See
UNSTABLE.

**You may rely on:** a documented command path continuing to exist and continuing
to accept the positional arguments it requires today. `nexus agent get <id>` takes
an id at position 1 and will keep taking one there.

**A break here means:** removing a command, renaming it without keeping the old
name as an alias, adding a new required positional, or reordering existing ones.
Making a required argument optional is not a break.

`task-eval` is the one top-level command with an alias: `eval`. It was renamed and
the old name still resolves. That is the shape a rename takes here — the old
spelling keeps working.

### Global flags

Nine options are declared on the root program and work anywhere in the line,
before or after the subcommand:

```
-v, --version          --json                 --api-key <key>
--base-url <url>       --dashboard-url <url>  --profile <name>
--timeout <seconds>    --auto-update          --no-auto-update
```

**You may rely on:** each flag existing, taking the kind of value it takes today,
and being accepted at any position in the argument line.

**A break here means:** removing a flag, changing whether it takes a value, or
making it position-sensitive.

`--auto-update` is off by default and stays off by default. The CLI does not
install over itself unless you ask it to. That default is part of this tier: a
build that self-modifies without being told to is a different program.

### The error document

Under `--json`, a failure is a JSON document on **stdout**:

```json
{ "error": { "message": "...", "hint": null, "code": "CLI_NOT_AUTHENTICATED" } }
```

All three keys are **always present**. `hint` is `null` when there is none — never
absent. `src/errors.ts` states why: an optional key is a second shape wearing one
name, and it forces every consumer to write a presence check before it can branch.

**`code` is the field to branch on.** Three families, and the prefix tells you
which:

- An API refusal's own name, unchanged — `NODE_IS_TRIGGER`,
  `WORKFLOW_ALREADY_PUBLISHED`.
- `HTTP_<status>` when the API refused without naming a code.
- `CLI_*` when the failure never reached the server — `CLI_INVALID_ARGUMENTS`,
  `CLI_NOT_AUTHENTICATED`.

**You may rely on:** the three keys, their types (`string`, `string | null`,
`string`), the document landing on stdout, and the `CLI_` prefix meaning "no
request was sent".

**A break here means:** removing a key, changing a key's type, moving the document
to stderr, or reusing the `CLI_` prefix for something that did reach the server.
Adding a key is not a break. **Renaming or retiring an individual `code` value is
not covered by this tier** — see UNSTABLE.

`message` is prose and gets rewritten. Match on `code`, never on `message`.

### One document on stdout

Under `--json` the CLI prints **one** JSON document on stdout and nothing else.
Warnings, the profile banner, progress and the update notice go to stderr, so a
pipe stays parseable.

`emitDocument` in `src/output.ts` enforces first-wins: the first document is the
payload and goes to stdout; anything after it is diverted to stderr. **101 leaves
build their own document with a bare `console.log`** rather than going through a
printer — the `writes-its-own-json` count in `src/json-shape.generated.ts` — and a
module-level flag cannot see a write it was not asked to make. That half is
covered by the `json-one-document.test.ts` gate, which drives **512 of the 519
leaves** and parses each one's stdout.

The seven it does not drive are exempt from the PARSE, never from the invariant,
and they are also the seven leaves where stdout is not one JSON document:
`execution follow`, `mcp serve` and `vibe app logs` emit many values by design,
and `analytics export`, `cue export`, `tracing export` and `tracing export-bulk`
print the payload in the format the caller asked for. `cue export`, `tracing
export` and `tracing export-bulk` say so on their own `--help`; the other four
do not, so on those four screens the root epilogue's "ONE JSON document on
STDOUT" is the only statement a reader gets. The gate asserts that list never
grows past seven. It is weaker than the construction, and saying so is the
point.

**You may rely on:** `nexus --json <cmd> | jq .` never choking on a banner — on
the 512 leaves the gate drives. The seven named above print something other than
one JSON document by design.

### Exit 0 and exit 1

- **`0` means the command completed.** It does not always mean the thing happened
  — several commands accept and discard input, or file a request instead of
  acting. Where that is true, the command's own `--help` Notes say so and name the
  verification step.
- **`1` is the failure code.** It is what 467 of the CLI's error paths produce:
  every one spells `process.exitCode = handleError(err)`, and `handleError` returns
  `1` for every branch except a commander argument refusal, which forwards
  commander's own code — also `1`.

**You may rely on:** `if nexus …; then` working. A non-zero exit always means the
command did not complete.

**A break here means:** making a currently-failing invocation exit 0, or a
currently-succeeding one exit non-zero.

**You may NOT rely on `1` being the only failure code.** See UNSTABLE.

### A destructive command with no terminal refuses

**44 commands declare `--yes`**, and every one of them behaves identically:

- `--yes` (or `--force`) → proceed.
- No `--yes`, stdin is a terminal → prompt, and treat anything but `y` as abort.
- No `--yes`, **stdin is not a terminal** → **refuse**, exit non-zero, emit the
  error document.

The refusal is gated on **stdin**, not stdout, so redirecting output does not skip
the prompt and `nexus … > log.txt` cannot delete silently.

All 44 declare the flag through `confirmable()` and ask through
`confirmDestructive()`, both in `src/util/confirm.ts`; the refusal lives in that
one helper, and no command parses `--yes` for itself.

**All 44 refuse, and that is DRIVEN rather than asserted from the source.**
`destructive-confirmation.driven.test.ts` runs each one with `stdin.isTTY` forced
false and no `--yes`, in a sandboxed `HOME` and working directory with the network
seams stubbed, and requires the refusal. Its spy calls THROUGH to the real helper
instead of returning a canned `false`, so it establishes two things a source scan
cannot: that the action body reached the confirmation at all, and that the shipped
refusal still refuses. Whether a closure calls a given function is invisible on the
`Command` object, and `--yes` is read one delegation further out than the command
file — `claude-code install` reaches it through `confirmOrAbort` in
`skills-install.ts` — so a grep of the command and of the module it imports from
still cannot separate enforced from unenforced.

**You may rely on:** a command that declares `--yes` never acting without it.
Refusing costs one retry; proceeding costs the data.

🚨 **DECLARING `--yes` IS NOT THE SAME AS BEING DESTRUCTIVE, AND 21 DESTRUCTIVE
COMMANDS DO NOT CONFIRM.** `destructiveCandidates()` in
`destructive-confirmation.scan.ts` derives **70** candidates by verb —
`delete`, `purge`, `revoke`, `rotate`, `wipe` and 18 more — and every one must
appear in exactly one of three declared sets:

| Set                       | Count | What it means                                             |
| ------------------------- | ----- | --------------------------------------------------------- |
| `CONFIRMS_BEFORE_ACTING`  | 44    | destroys, and confirms. The promise above covers these.   |
| `NOT_DESTRUCTIVE`         | 5     | carries a destructive-sounding verb and destroys nothing. |
| `UNCONFIRMED_DESTRUCTIVE` | 21    | **destroys and does NOT confirm.** Named debt.            |

**Those 21 are a hole in the promise above, and they are written down rather than
implied.** They are driven too, and REQUIRED TO STILL FAIL, so one that starts
confirming must move to the obligation set and the ledger cannot rot in the
shrinking direction either. Read the ledger before scripting a destructive verb;
do not infer a confirmation from the verb's name.

The verb list is a heuristic and is admitted as one — the ledger is the artifact.
A destructive command whose name carries none of those 23 verbs is outside the
population by construction, and nothing detects it.

**A break here means:** a command in `CONFIRMS_BEFORE_ACTING` proceeding without an
explicit confirmation when no terminal is present.

### Scope semantics

Scopes have exactly one implication: `:write` implies `:read` on the **same**
resource. Nothing else bridges — `:write` does not imply `:delete`, `:delete`
implies nothing, and a scope on one resource says nothing about another. A missing
scope is a 403, not an empty result.

**A break here means:** adding or removing an implication.

---

## EVOLVING

Additive change lands in any release. A removal gets a deprecation cycle: the old
form keeps working, `--help` and the changelog say it is going, and it is removed
no sooner than the release after the one that announced it.

### The `--json` envelope shape, per command

`--json` is **not uniformly wrapped**, and the wrapping is not derivable from a
command's name. `agent list` answers `{data, meta}`; `task list` answers a bare
array; `agent create` answers `{success, …}`; `agent get` answers the resource
flat. Six envelope shapes exist, named in `src/json-shape-help.ts`:

`record` · `list` · `array` · `success` · `dryRun` · `envelope`

**368 of the 519 leaves** carry a derived shape line on their `--help`, generated
into `src/json-shape.generated.ts` from the printer each action actually reaches.
`json-shape.codegen.test.ts` recomputes the file and fails on any difference, so a
command whose printer changes turns the build red rather than shipping a `--help`
line describing the old shape.

The remaining 151 carry **no** shape line, and that is the honest output rather
than a gap: 101 write their own document, 27 have no registration the scan can
read, 17 branch to two shapes, 5 reach no printer, and 1 is ambiguous. A default
would be a claim nobody measured.

`envelope` is the route's own response object, unnarrowed — the same document
`nexus api GET <path>` returns. It exists because the other five all describe a
document the CLI ASSEMBLES, and a command whose response carries more than the
rows a table can draw has to publish the rest of it somewhere. `folder list` is
the worked example: `GET /folders` answers `{folders, assignments}`, the table
draws the folders, and `assignments` is the only agent-to-folder map either
surface reports.

**You may rely on:** a command's envelope shape not changing without a changelog
entry, and `--help` telling you which of the six you are getting where the
derivation can answer.

**A break here means:** a command that answers `{data, meta}` today answering a
bare array tomorrow. The cost is silent — a `jq` path against the wrong pattern
returns `null`, not a parse error — which is why the envelope is in this tier and
not in UNSTABLE.

**This tier covers the ENVELOPE only. The field names inside it are UNSTABLE.**

⚠️ **A command whose document is missing a field the route returned is a defect
in this tier, not a design.** `src/commands/envelope-narrowing.scan.ts` derives
that population from the type checker — every printer handed one key of a
multi-key response, with the keys nothing else publishes — and
`envelope-narrowing.ledger.ts` records each survivor with the field it drops and
the reason. The ledger is the honest count and it may only shrink; a new one
fails the build. Read it before scripting against a command that is on it.

### Optional flags on individual commands

Adding an optional flag to a command is additive and lands any release. Removing
one, or narrowing what it accepts, gets a deprecation cycle.

One caveat with a shape you should know about: **narrowing a flag to a
`.choices()` set is a break even though it only refuses values the server already
refused.** The value fails one step earlier and through a different exit path — no
network call, and a commander refusal rather than an API error. The 0.26.0
changelog records six flags going through exactly this, and calls it the breaking
part.

### Help text

`--help` is content, and content improves. Sentences get rewritten, blocks get
added, wording gets sharpened.

**You may rely on:** `--help` existing on every command, exiting 0, touching no
network, and working offline, in CI, behind a proxy and inside a pipe.

**You may NOT rely on:** any particular sentence surviving. Do not parse `--help`.

`src/command-universe.ts` exists precisely so nobody has to: it reads
`command.commands` off the real commander tree rather than scraping rendered text.
If you need the command tree programmatically, that module is the shape to copy,
and note what a rendering cannot give you — hidden commands are omitted from help
by construction.

### The classified command set

Every leaf is classified in `COMMAND_CLASSIFICATION` as `safe`,
`safe-with-fixture`, `registration-only` or `never-execute`.
`classifyCommandUniverse()` diffs the declaration against the derived tree; an
unclassified leaf fails the build, so a command cannot be added silently. Today:
519 leaves, **0 unclassified, 0 stale**, 58 classified `safe`.

`safe-with-fixture` is executed exactly like `safe`, and additionally its
response must not be empty. The sweep runs both, so the count above is the
literal `safe` disposition rather than the number of leaves executed.

**You may rely on:** the population being complete rather than a list somebody
remembered to update.

---

## UNSTABLE

These may change in any release, without a changelog entry. If your script depends
on one of them, pin the CLI version.

### `--json` payload field names — the important one

**The field names inside a `--json` payload are the backend's response, unvalidated
and unmapped.** This is the single largest hole in this contract, and it is stated
first because everything else in this tier is smaller.

The path, end to end:

1. `HttpClient.requestWithMeta` in `packages/sdk/src/http-client.ts` parses the
   response body (`JSON.parse(rawBody)`, line 623).
2. If the body is a v1 success envelope it returns `json.data` typed as `T`. The
   guard, `isSuccessEnvelope`, tests that `success` is `true` and that a `data` key
   exists — a shape test for the ENVELOPE, **not** a schema check on the payload.
   Any other 2xx body is returned as `json as T`, verbatim: "that is what a
   passthrough owes its caller."
3. `printRecord` in `packages/cli/src/output.ts` sees JSON mode and calls
   `emitDocument(data)` — the object it was handed, serialized, with no field
   selection.

So a backend field rename rewrites the CLI's `--json` output with **no pull request
touching `packages/cli`**, no typecheck failure, and no test going red. The
TypeScript types along that path are assertions, not validation.

**You may rely on:** the envelope (see EVOLVING) and on the document being valid
JSON.

**You may NOT rely on:** any field name, any field's presence, or any field's type
inside the payload. Read defensively, and prefer `nexus api GET <path>` when you
want the untouched response and want to be honest with yourself that that is what
you are getting.

### Exit codes other than 0 and 1

Three maps coexist, and the root `--help` currently describes only one of them.

| Surface                             | Codes                    | Where                                           |
| ----------------------------------- | ------------------------ | ----------------------------------------------- |
| The resource tree — 467 error paths | `1`, always              | `handleError`, `src/errors.ts`                  |
| The admin tree — 22 error paths     | `2` `3` `4` `5` `6` `1`  | `exitCodeFor`, `src/util/admin-errors.ts:72-79` |
| `vibe app-logs --follow`            | `130` on a second Ctrl-C | `src/commands/vibe-app-logs.ts:449`             |

The admin map:

```
401           -> 2   missing / invalid admin token
403           -> 3   permission denied
404           -> 4   not found
400 or 422    -> 5   invalid state / validation
>= 500        -> 6   server error
anything else -> 1
```

Two more admin paths reach a code without a status: a missing admin token exits
`2`, and CLI-side cross-field validation exits `5`.

**`nexus --help` says "EVERY failure exits 1". That sentence is true of the
resource tree and false of the admin tree**, which predates it and is richer. The
admin-errors docblock says so explicitly. The disagreement will not be closed by
quietly flattening the admin codes, because callers branch on them; it is closed by
one documented taxonomy covering both trees, and that work is open.

**You may rely on:** `0` = completed, non-zero = did not complete.

**You may NOT rely on:** any specific non-zero value, in either direction. Do not
write `if [ $? -eq 4 ]`. Read the `code` field of the error document.

### Table output

Without `--json` you get a table, and a table **column is truncated to its width**.
Never parse one, and never conclude a value is short because it looked short. `-`
and a blank cell mean NULL, which is not zero and not false. A list command prints
only the columns it chose; `--json` can carry fields the table does not show.

Column choice, order, width and truncation are presentation, and change freely.

### `nexus api`

`nexus api <METHOD> <path>` sends any request to `{baseUrl}/api/public/v1{path}`
and returns the untouched response. It is classified `never-execute` in the sweep
because it is unbounded by construction.

It is an escape hatch, not a contract. What it returns is whatever the platform
returns, and the platform's own compatibility policy governs that — not this
document.

Note the prefix is prepended in `HttpClient` and **no flag removes it**, so routes
outside `public/v1` are unreachable through it. A probe finding nothing there is
not proof a capability is absent.

### The `vibe` and `admin` trees

`vibe` is the internal Git and deployment platform. `admin` drives platform
operations behind an admin JWT. Both are operator surfaces for the Nexus team, both
move with the services behind them, and neither is covered by this document. They
are visible rather than hidden because operators need to find them, not because
they are stable.

### Individual `code` values

The document key is STABLE. The vocabulary is not: an API refusal's code comes
through unchanged from the server, so a code can appear, disappear or be renamed
upstream. `HTTP_<status>` and the `CLI_` prefix rule are the parts you may build a
branch on.

### `--timeout` behaviour

`--timeout` is **client-side only**. Hitting it means this CLI stopped waiting;
**the server may still be completing the request**. Never retry a write on a
timeout without first checking whether the first one landed.

The default is 30 seconds, and 600 for the operations that run a model before they
answer. Those numbers are tuning and may change.

---

## INTERNAL

No promise. These exist, you can see them, and we will change them without telling
anyone.

### The 18 hidden top-level commands — all of them reinstall the binary

`src/commands/upgrade.ts` registers **18** hidden top-level commands beside
`upgrade`, every one of which is the same action: reinstall this CLI.

```
update  latest  up      install  reinstall  refresh  fetch  pull  sync
get     download  self-update  selfupdate  self-upgrade  selfupgrade
new     patch   bump
```

Verified by walking the tree: 67 top-level commands, 49 visible, 18 hidden, and all
18 attributed to `upgrade.ts`. There are no hidden commands anywhere else in the
tree.

**Read that list twice before scripting.** `nexus get`, `nexus new`, `nexus
install` and `nexus sync` are plausible names for something else entirely, and all
four replace the running binary. They are absent from `--help` by construction, so
nothing warns you.

**You may rely on nothing here.** Any of these names may be reclaimed for a real
command, or removed. Use `nexus upgrade`.

### stderr

Everything on stderr is prose for a human: the profile banner, warnings, progress,
the update notice, commander's own refusal sentence, and the non-JSON error line.
It is formatted for a terminal and rewritten whenever it reads badly.

Do not parse stderr. The error document on stdout is the machine surface.

### Configuration files

Profiles live in `~/.nexus-mcp/config.json` (mode `0700` on the directory).
Directory pinning uses a `.nexusrc` file found by walking up from the working
directory.

The `.nexus-mcp` name is a historical artifact. The file layout, the directory
name and the on-disk schema are all internal — read them through `nexus auth
status` and `nexus auth whoami`, never by parsing the file.

Profile resolution, highest first — each level consulted only when those above it
are absent:

```
1  --api-key <key>       this invocation, uses no profile at all
2  --profile <name>      this invocation
3  NEXUS_API_KEY         this shell, uses no profile at all
4  NEXUS_PROFILE         this shell
5  .nexusrc              this directory
6  the active profile    THIS MACHINE
7  the profile named "default"
```

The precedence itself is documented behaviour and is covered by
`auth-switch-override.test.ts`; the file format underneath it is not.

⚠️ **Level 6 is shared by every process on the machine.** A plain `nexus auth
switch` in one terminal repoints every other session that has no binding of its
own, mid-task, printing nothing there. Two organizations at once means binding each
session at level 4 or 5.

### Environment variables

Read by the CLI today: `NEXUS_API_KEY`, `NEXUS_PROFILE`, `NEXUS_ORGANIZATION_ID`,
`NEXUS_BASE_URL`, `NEXUS_DASHBOARD_URL`, `NEXUS_ENV`, `NEXUS_ADMIN_TOKEN`,
`NEXUS_NO_AUTO_UPDATE`, `NEXUS_NO_PROMPTS`.

**Eight of the nine are named on a help screen, and which screen is not
guessable:**

| Variable                | Named on             |
| ----------------------- | -------------------- |
| `NEXUS_API_KEY`         | `nexus --help`       |
| `NEXUS_PROFILE`         | `nexus --help`       |
| `NEXUS_ORGANIZATION_ID` | `nexus --help`       |
| `NEXUS_NO_AUTO_UPDATE`  | `nexus --help`       |
| `NEXUS_ADMIN_TOKEN`     | `nexus admin --help` |
| `NEXUS_BASE_URL`        | `nexus docs --help`  |
| `NEXUS_ENV`             | `nexus docs --help`  |
| `NEXUS_DASHBOARD_URL`   | `nexus docs --help`  |
| `NEXUS_NO_PROMPTS`      | nowhere              |

`NEXUS_API_KEY`, `NEXUS_PROFILE` and `NEXUS_ORGANIZATION_ID` are each repeated on
one or more `auth` or `workspace` screens; the table names one screen to read.
Those eight behave as this document's STABLE flags do.

⚠️ **Re-derive that table by RENDERING every screen, never by reading the source.**
A source search answers where a variable is USED, which is a different question
from where it is DOCUMENTED, and neither location predicts the other:
`NEXUS_BASE_URL` is read inside the bundled SDK's HTTP client and is named on
`nexus docs --help`. `captureHelp()` over `deriveCommandNodes()` in
`src/command-universe.ts` renders all 604 nodes, and the root program is a 605th
screen that walk does not include.

**`NEXUS_NO_PROMPTS` is read by the CLI and named on no help screen.** Treat it as
internal — an undocumented variable is not a promise, whatever it currently does.

⚠️ It is read at exactly **one** site, in `src/commands/vibe.ts`, where it
suppresses one follow-up hint printed after a deployment is triggered. It is not a
global non-interactive switch, and setting it changes nothing about the
destructive-confirmation section above: with no terminal and no `--yes`, a
destructive command refuses whether it is set or not. Use `--yes`.

### The bundled SDK

`@agent-nexus/sdk` is a **devDependency** of this package and is bundled into
`dist/index.js` by tsup. Installing the CLI does not install the SDK, and the CLI's
version says nothing about which SDK version is inside it.

If you want the SDK, depend on `@agent-nexus/sdk` directly. It carries its own
version and its own promises.

---

## What we cannot promise yet, and why

Four things a consumer would reasonably expect us to guarantee, and that we do not
guarantee today. Each is a defect with an owner, not a design decision.

### 1. `--json` payload shapes are the backend's response, unvalidated

Stated in full under UNSTABLE. The short version: `packages/sdk/src/http-client.ts`
parses the response and casts it — `isSuccessEnvelope` checks the envelope and
nothing inside it, and any non-envelope 2xx body is returned `as T` verbatim.
`printRecord` in `packages/cli/src/output.ts` then emits that object as the
document. So **the CLI's public `--json` contract is currently the backend's raw
response**, and a backend field rename rewrites it with no PR touching this package
and no gate going red.

The envelope is gated (`json-shape.codegen.test.ts`). The payload is not gated by
anything.

**Why we cannot promise it yet:** promising a payload shape requires validating it
at the boundary, which requires a schema per route. That work is real and is not
done. Claiming the promise without the schema would be worse than saying this,
because a documented contract nothing enforces reads exactly like one that is
enforced.

**Until then:** treat every payload field as best-effort. Pin the CLI version if
you need a stable field set.

### 2. Exit codes past 0 and 1 are inconsistent

Three maps, described under UNSTABLE. The root `--help` documents one of them and
says "EVERY failure exits 1", which is false for the 22 admin error paths and for
`vibe app-logs --follow`.

**Why we cannot promise it yet:** the two maps disagree about what a code _means_,
not merely about which numbers are used. Flattening the admin tree to 1 would break
callers branching on it today; widening the resource tree to 2-6 would be a real
behaviour change across 467 sites. Picking one needs a decision, not an edit.

**Until then:** `0` and non-zero are the contract. Branch on the `code` field.

### 3. `--json` is not honoured on three surfaces, and a typo reads as success

Measured against the built binary at 0.26.0:

| Invocation                 | Exit  | stdout                                             |
| -------------------------- | ----- | -------------------------------------------------- |
| `nexus --json --help`      | **0** | the help screen, ASCII banner and all — not JSON   |
| `nexus --json --version`   | **0** | `0.26.0` — not JSON                                |
| `nexus --json docs`        | **0** | prose — not JSON                                   |
| `nexus --json agnt --help` | **0** | the **root** help screen — a typo reads as success |
| `nexus --json nosuchcmd`   | 1     | the error document ✅                              |
| `nexus --json agent get`   | 1     | the error document ✅                              |

The last two are the fixed half: `installArgumentRefusalReporting`
(`src/errors.ts:358`) walks the whole tree, turns commander's internal
`process.exit` into a typed throw, and sets JSON mode at the last instant anything
can — so a missing argument, an unknown command, an unknown option, a bad
`.choices()` value and a failing root value parser all produce a document.

The gap is one line, `src/errors.ts:380`:

```ts
if (error.exitCode === 0 && onSuccessfulExit === "exit") return;
```

The callback returns before JSON mode is set. That is correct for `--help` and
`--version`, which genuinely succeed — but it means a JSON consumer that asked for
JSON gets prose at exit 0 and cannot tell the difference between "here is your
help" and "I did not understand you". `nexus --json agnt --help` is the sharp case:
a misspelled namespace prints the root help and exits 0.

**This is being fixed.** It is stated here rather than papered over because a
consumer reading this document today needs to know their typo will not be caught.

**Until then:** do not treat exit 0 under `--json` as proof you got a document.
Check that stdout parses.

### 4. The CLI's verb table is smaller than the platform's route table

A verb absent from `nexus --help` is absent from **this CLI at this version**. It
is not proof the platform cannot do the thing. Routes are served that this CLI has
no verb for at any version, and the dashboard calls them.

`nexus api <METHOD> <path>` reaches `public/v1` and nothing else, so a probe
finding nothing there does not establish an absence either.

**Why we cannot promise it yet:** "the CLI covers the API" is a claim about two
moving surfaces, and nothing measures the gap today.

**Until then:** upgrade before recording a capability as missing, and ask the route
rather than the help screen.

---

## How a breaking change ships

1. It lands with a `CHANGELOG.md` entry that names the old behaviour and the new
   one, in that order, and says plainly which is which. The register to copy is
   the one already in that file: state what a script doing the old thing will now
   experience, not what the code now does.
2. It bumps the minor version today; the major after 1.0.
3. Where the old form can keep working, it keeps working — an alias for a rename
   (`task-eval` kept `eval`), a fallback for a moved field.
4. A removal from an EVOLVING surface is announced one release before it happens,
   in `--help` and in the changelog.

If you find behaviour that changed without one of those, that is a bug in the
release, not a clarification of this document. File it with `nexus ticket create`.

---

## Writing a script that survives

- Always pass `--json`. Never parse a table.
- Check stdout parses as JSON before trusting exit 0. See gap 3.
- Branch on `error.code`, never on `error.message` and never on a non-zero exit
  value.
- Read `--help` for a command's envelope shape before writing the `jq` path. The
  shapes are not uniform and a wrong path returns `null` rather than failing.
- Pass `--yes` to every destructive command. Without a terminal the CLI refuses,
  by design.
- Pin the CLI version if you depend on payload field names.
- Use `--profile` or `NEXUS_API_KEY` to bind the session. The machine-wide active
  profile can be repointed by another terminal mid-run.
- Never script `nexus get`, `nexus new`, `nexus install` or `nexus sync` — all four
  reinstall the binary.

---

## Related

- `README.md` — installation, authentication, per-command usage
- `CHANGELOG.md` — what changed in each release, and what it costs a script
- `nexus --help` — the live epilogue this document formalizes
- `nexus known-issues <route-id>` — live defects on a specific command
- `src/command-universe.ts` — the derived command tree, if you need it in code
