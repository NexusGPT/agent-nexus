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

| Tier         | What it covers                                                                                                                                                                                                                                             | May it break?                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **STABLE**   | Command names and required arguments, global flags, the error document, `--json` yielding ONE parseable document on every terminal path (`--help`, `--version`, `--print-contract`, every refusal), what each exit code MEANS, destructive-command refusal | Only in a release that says so, at the top of `CHANGELOG.md`   |
| **EVOLVING** | The `--json` envelope shape per command, per-command optional flags, help text content, the classified command set, WHICH exit code a given failure gets                                                                                                   | Additions any release; removals only after a deprecation cycle |
| **UNSTABLE** | `--json` payload field names, table columns and widths, `nexus api`, the `apps` and `admin` trees                                                                                                                                                          | Any release, without notice                                    |
| **INTERNAL** | Hidden commands, stderr prose, config file layout, the bundled SDK                                                                                                                                                                                         | No promise at all                                              |

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

The CLI registers **52 top-level commands**, of which **52 are visible** and 0 are
hidden — there are none at all (see INTERNAL). Under them sit **643 command nodes**
and **548 invocable leaves**. Derive these yourself with `deriveCommandNodes()` and
`deriveCommandLeaves()` in `src/command-universe.ts`; they walk the real commander
tree rather than a list somebody maintains.

The 52 visible namespaces:

```
access-card       admin       agent          agent-collection  agent-eval
agent-skill       agent-tool  analytics      api               apps
asset             auth        channel        chat              claude-code
cloud-import      collection  conversation   credential        cue
custom-model      customer    deployment     docs              document
emulator          execution   external-tool  folder            html-template
known-issues      mcp         model          permissions       phone-number
prompt-assistant  role        score          skill-folder      skills
task              task-eval   template       ticket            tool
tracing           tracks      upgrade        user-group        version
workflow          workspace
```

⚠️ **Two of those 52 are carved out of this tier: `apps` and `admin`.** They are
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

### One document on stdout, on EVERY way the process can end

Under `--json` the CLI prints **one** JSON document on stdout and nothing else.
Warnings, the profile banner, progress and the update notice go to stderr, so a
pipe stays parseable.

**That holds for every terminal path, not only for the ones that run a command.**
`--help`, `--version`, an unknown command and an unknown command written beside
`--help` each answer a document:

| Invocation                                 | Exit  | stdout                                                            |
| ------------------------------------------ | ----- | ----------------------------------------------------------------- |
| `nexus --json --help`                      | 0     | `{"help":{"command":"nexus","text":"…"}}`                         |
| `nexus --json agent --help`                | 0     | `{"help":{"command":"nexus agent","text":"…"}}`                   |
| `nexus --json --version`                   | 0     | `{"version":"0.26.0"}`                                            |
| `nexus --json docs`                        | 0     | `{"docs":{"web":…,"llmsIndex":…,"llmsFull":…}}`                   |
| `nexus --json agnt`                        | **1** | the error document, with commander's "did you mean agent?" in it  |
| `nexus --json agnt --help`                 | **1** | the error document — **a typo is a refusal, never a help screen** |
| `nexus --json agent list --print-contract` | 0     | `{"contract":{"command":"nexus agent list","text":"…"}}`          |

The last row used to be the sharp one: a misspelled namespace printed the ROOT
help and exited **0**, so a script that shelled out, read the status and parsed
stdout got a silent wrong answer for a command that does not exist. That was not a
`--json` bug — `nexus agnt --help` exited 0 in prose mode too, because commander
renders a requested help screen before it reports an unknown command.

Two constructions hold this, both in `src/json-terminal-contract.ts`:

- **JSON mode is resolved from argv before the parse**, by wrapping
  `parse`/`parseAsync`. Nothing runs earlier, because nothing runs before a parse.
- **`_outputConfiguration.writeOut` is commander's single stdout door**, and under
  `--json` this CLI owns it. A commander path that writes prose to stdout is
  unrepresentable rather than forbidden.

A stray operand on a namespace is refused where the help would have rendered, so
the typo exits 1 with the error document below.

**The construction has one shape it cannot reach, and it is named here rather
than implied: a call site that writes to `process.stdout` directly and then
exits.** Commander never sees those bytes. `--print-contract`, declared on 177
commands, was exactly that — 196 bytes of prose at exit 0 under `--json`. It now
branches on JSON mode itself, and `every-zero-exit-path-is-ledgered.test.ts`
fails on any `process.exit(` call site in this package that is not written down
with what it does about `--json`, so the next one cannot arrive in silence.

`emitDocument` in `src/output.ts` enforces first-wins for the printers: the first
document is the payload and goes to stdout; anything after it is diverted to
stderr. **101 leaves build their own document with a bare `console.log`** rather
than going through a printer — the `writes-its-own-json` count in the generated
`src/json-shape.generated.ts`, which is the only derived reading of that number.
A module-level flag cannot see a write it was not asked to make, so that half is
covered by gates rather than by construction: the `json-one-document.test.ts`
gate, which drives **541 of the 548 leaves** and parses each one's stdout, and
`json-contract-is-total.test.ts`, which drives every node's `--help`, the root's
`--version`, an unknown command on every namespace, `--print-contract` on the 177
commands that declare it, and the one command that is invocable AND a namespace
(`docs`, which the leaf population excludes by construction). The gates are
weaker than the construction, and saying so is the point.

### The seven leaves that do NOT print JSON, by design

**`--json` does not make these emit a JSON document, and a script must not
assume it does:**

| leaf                        | what stdout is                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `nexus tracing export`      | the format the caller asked for — `--format csv` is CSV                                          |
| `nexus tracing export-bulk` | same                                                                                             |
| `nexus analytics export`    | same                                                                                             |
| `nexus cue export`          | the transcript corpus, NDJSON by default — many documents by construction, one payload by intent |
| `nexus execution follow`    | a live stream, open until the run ends                                                           |
| `nexus apps logs`           | a live stream, open until you stop it                                                            |
| `nexus mcp serve`           | the MCP stdio transport — newline-delimited JSON-RPC for as long as the host holds the pipe      |

The first four are a **payload passthrough**: stdout is the server's data in the
shape you asked for. The last three **stream**: there is no last document to wait
for. Both are deliberate, both are exempt in
`src/commands/json-one-document.scan.ts`, and the gate asserts that list stays at
**seven or fewer** so it cannot grow quietly.

⚠️ **Only three of the seven say so on their own `--help`** — `cue export`,
`tracing export` and `tracing export-bulk` carry _"THE OUTPUT IS THE PAYLOAD,
VERBATIM"_. On the other four screens the root epilogue's "ONE JSON document on
STDOUT" is the only statement a reader gets, and it is wrong for that command. So
this table, not the per-command help, is the authority on which leaves are
exempt.

**You may rely on:** `nexus --json <cmd> | jq .` never choking on a banner — on
the 541 leaves the gate drives. And on every terminal path — `--help`,
`--version`, `--print-contract`, an unknown command, a refusal — one parseable
document on stdout whether the command succeeded or not.

**You may NOT rely on** the seven leaves above emitting JSON. Everywhere else the
guarantee holds; there it is a payload or a stream — and on four of the seven,
nothing on the command's own screen tells you, which is why the table above is
the authority rather than a convenience.

### What each exit code means

There is ONE taxonomy, declared in `src/exit-codes.ts` and read by every exit path
in the binary. A category name maps to a number; nothing else in the package
writes an exit code as an integer, and `exit-code-taxonomy.test.ts` fails naming
any file that does.

| Code  | Category            | What it means                                                                  |
| ----- | ------------------- | ------------------------------------------------------------------------------ |
| `0`   | success             | The command completed.                                                         |
| `1`   | failed              | A failure with no more specific category.                                      |
| `2`   | not authenticated   | No usable credential, or one the server rejected. HTTP 401.                    |
| `3`   | permission denied   | The credential is good and is not allowed to do this. HTTP 403.                |
| `4`   | not found           | The named thing does not exist. HTTP 404, or a 2xx whose body means absent.    |
| `5`   | invalid input       | The invocation or its payload was refused. Bad flags, HTTP 400 / 409 / 422.    |
| `6`   | remote error        | The request arrived and the server failed. HTTP >= 500.                        |
| `7`   | connection failed   | The API was unreachable — DNS, TLS, socket, offline. RETRYABLE.                |
| `8`   | timed out           | The CLI stopped waiting. THE SERVER MAY STILL BE COMPLETING THE REQUEST.       |
| `9`   | local failed        | A local operation failed — an install, a config write, a spawn.                |
| `10`  | outcome not reached | The operation RAN and the wanted outcome did not happen. Retrying is the trap. |
| `11`  | unmeasured          | The operation ran and its result could not be measured. Neither pass nor fail. |
| `130` | interrupted         | The caller stopped it. `128 + 2` — the shell's number, not one we chose.       |

🚨 **`0` DOES NOT ALWAYS MEAN THE THING HAPPENED.** Several commands accept and
discard input, or file a request instead of acting. Where that is true, the
command's own `--help` Notes say so and name the verification step.

🚨 **`130` HAS EXACTLY ONE PRODUCER, AND THE FIRST Ctrl-C IS NOT IT.**
`nexus apps logs --follow` is the only command that can emit it. It counts
signals and exits `130` on the SECOND — the second signal of EITHER kind, because
one counter serves `SIGINT` and `SIGTERM`. The FIRST signal ends the follow
cleanly at `0`, so `nexus apps logs --follow; echo $?` after one Ctrl-C
prints `0`. A Ctrl-C followed by a supervisor's `SIGTERM` reaches `130`, and so
does a `SIGTERM` pair — which reports `130`, never `143`. This taxonomy declares
ONE code in the shell's band on purpose, so "the caller stopped it" is one
category rather than one per signal.

⚠️ **Nothing above `11` is ours except `130`.** `126` is "found and not
executable", `127` is "not found", `128 + n` is "killed by signal n". The taxonomy
refuses to declare a code in that band, and the gate asserts it.

**You may rely on:** `if nexus …; then` working; a non-zero exit always meaning the
command did not complete; and each number above continuing to mean what this table
says it means.

**A break here means:** making a currently-failing invocation exit 0, making a
currently-succeeding one exit non-zero, or giving one of these numbers a different
meaning.

**You may NOT rely on a given failure keeping the same code forever.** Which
category a particular failure falls into is EVOLVING — see below.

### A destructive command with no terminal refuses

**46 commands declare `--yes`**, and every one of them behaves identically:

- `--yes` (or `--force`) → proceed.
- No `--yes`, stdin is a terminal → prompt, and treat anything but `y` as abort.
- No `--yes`, **stdin is not a terminal** → **refuse**, exit non-zero, emit the
  error document.

The refusal is gated on **stdin**, not stdout, so redirecting output does not skip
the prompt and `nexus … > log.txt` cannot delete silently.

All 46 declare the flag through `confirmable()` and ask through
`confirmDestructive()`, both in `src/util/confirm.ts`; the refusal lives in that
one helper, and no command parses `--yes` for itself.

**All 46 refuse, and that is DRIVEN rather than asserted from the source.**
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
`destructive-confirmation.scan.ts` derives **72** candidates by verb —
`delete`, `purge`, `revoke`, `rotate`, `wipe` and 18 more — and every one must
appear in exactly one of three declared sets:

| Set                       | Count | What it means                                             |
| ------------------------- | ----- | --------------------------------------------------------- |
| `CONFIRMS_BEFORE_ACTING`  | 46    | destroys, and confirms. The promise above covers these.   |
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

**414 of the 548 leaves** carry a derived shape line on their `--help`, generated
into `src/json-shape.generated.ts` from the printer each action actually reaches.
`json-shape.codegen.test.ts` recomputes the file and fails on any difference, so a
command whose printer changes turns the build red rather than shipping a `--help`
line describing the old shape.

The remaining 134 carry **no** shape line, and that is the honest output rather
than a gap: 101 write their own document, 17 branch to two shapes, 10 have no
registration the scan can read, 5 reach no printer, and 1 is ambiguous. A default
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

### Which exit code a given failure gets

The MEANINGS are STABLE. Which of them a particular failure lands in is not, and it
moves in one direction: from `1` toward something specific.

`handleError` returned `1` on every branch, at 467 call sites, until the taxonomy
existed. Those sites now get the category their error type names — a 404 exits `4`,
a timeout exits `8`, an unreachable API exits `7` — and `1` is what is left when the
CLI genuinely cannot say more. Refinement continues: a failure that exits `1` today
may exit a specific code in a later release once the CLI can tell which it is.

**You may rely on:** a failure that exits non-zero today continuing to exit
non-zero, and a code narrowing rather than widening — `4` will not become `1`.

**A change here means:** a failure that exited `1` now exits something specific.
That is announced in `CHANGELOG.md` when it affects a documented outcome, and is not
announced when it is one of the 467 sites that never had a contract to break.

⚠️ **THIS SECTION IS ABOUT FAILURES. A SUCCESS BECOMING A FAILURE IS A DIFFERENT
CHANGE, AND IT IS A BREAK.** Everything above says how a non-zero exit may move; a
`0` that starts exiting non-zero moves no code — it changes what the command
CONSIDERS a failure, which is the STABLE promise under "what each exit code
MEANS". It ships with a changelog entry naming the old behaviour and the new one,
like any other break in this tier.

`nexus auth status` is the worked case. It reported a stored key without asking the
API whether the key still worked, so it exited `0` over a revoked one and a
preflight gated on it passed while everything behind it failed on auth. **A verb
that reports a state and cannot fail on that state is a defect in this tier, not a
design** — the exit code is the only surface a script reads, and a `0` it cannot
trust is worse than no verb. It verifies now, and `--no-verify` is how a caller
asks for the old local-only read.

**You may rely on:** a command that reports a state exiting non-zero when that state
is bad, and on the distinction between a bad state and an UNMEASURED one surviving —
a check that could not run (`7` unreachable, `8` timed out, `6` server errored) is
never reported as a check that ran and failed.

🔴 **`nexus upgrade` PUBLISHED FOUR EXIT CODES IN ITS OWN `--help`, AND ALL THREE
NON-ZERO ONES MOVED.** It is the one command in the CLI with a documented exit-code
contract that this release breaks:

| Was | Is   | Outcome                                               |
| --- | ---- | ----------------------------------------------------- |
| `1` | `7`  | the registry was unreachable                          |
| `1` | `9`  | the install command failed                            |
| `2` | `10` | installed, and your shell still resolves the old copy |
| `3` | `11` | installed, and it could not be checked FOR you (sudo) |

`2` and `3` had to move because those numbers already meant "not authenticated" and
"permission denied" everywhere else in the same binary. `1` split because "the
registry was unreachable" and "the install failed" are different categories and a
caller retrying one should not retry the other. **A script branching on `1`, `2` or
`3` from `nexus upgrade` must be updated.**

**No number changed MEANING outside that table.** The admin tree's `2` `3` `4` `5`
`6` mean what they always meant. Two other failures re-categorized rather than
re-numbered, and both left the generic `1`:

- an unreachable admin API now exits `7`, because a network failure is retryable and
  the generic failure is not knowably anything;
- `nexus mcp call` on a failing tool now exits `6` (or `5` when the input was
  refused), which its own `--help` had documented as `1`.

Every other command's help text that named a specific exit code has been corrected
to match the code, and `exit-code-taxonomy.test.ts` asserts the root table is true.

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
548 leaves, **0 unclassified, 0 stale**, 64 classified `safe`.

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

### The `apps` and `admin` trees

`apps` is the internal Git and deployment platform. `admin` drives platform
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

### There are no hidden commands

`src/commands/upgrade.ts` registers **0** hidden top-level commands beside
`upgrade`. It once registered eighteen, every one of which was the same action:
reinstall this CLI. These fifteen were removed:

```
get     new       install      sync          fetch   pull  download
refresh reinstall patch        bump          self-update  selfupdate
self-upgrade      selfupgrade
```

`nexus get`, `nexus new`, `nexus install` and `nexus
sync` are plausible names for something else entirely — `get` ends 40 leaves in
this tree, `update` ends 29, and `install` and `sync` are declared aliases of
`skills update` — and all four replaced the running binary. They were absent from
`--help` by construction, so nothing warned you.

The three that survive are `update`, `latest` and `up`, and they are no longer
hidden commands at all: they are declared aliases on `upgrade`, so they appear in
`--help` as `upgrade|update` and on the generated documentation page. They are
STABLE for the same reason every other command name is — a rename without an alias
is a breaking change.

Verified by walking the tree: 52 top-level commands, 52 visible, 0 hidden, and no
hidden command anywhere in the tree.

**This section is kept because the tier still exists and its population is empty.**
A hidden command promises nothing, and adding one back is a change nobody would see
in `--help`. Nothing currently relies on this tier.

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
`src/command-universe.ts` renders all 643 nodes, and the root program is a 644th
screen that walk does not include.

**`NEXUS_NO_PROMPTS` is read by the CLI and named on no help screen.** Treat it as
internal — an undocumented variable is not a promise, whatever it currently does.

⚠️ It is read at exactly **one** site, in `src/commands/apps.ts`, where it
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

Three things a consumer would reasonably expect us to guarantee, and that we do not
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

### 2. The CLI's verb table is smaller than the platform's route table

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

## How a command is retired

A removal is a mechanism, not a review comment. **A command that stops answering
without an alias or a served deprecation cycle fails the build**, so the promises
above are enforced rather than merely stated.

**0 leaves are on a deprecation cycle today**, out of the **547 paths** the last
release promised. An empty list is the ordinary state — a release that retires
nothing is the normal release — so read the list, never this sentence:
`src/deprecations.ts` is the declaration and it is the whole of it.

### What a cycle is, in three steps

1. **Announce.** A record goes into `DEPRECATIONS` in `src/deprecations.ts`, keyed
   by the leaf's `shape` from `src/cli-surface.generated.ts` — the rename-stable
   identity, which is 12 hex characters of the module, flags, arguments and
   description WITHOUT the path. Keying on the path would let a rename discharge a
   deprecation. The `CHANGELOG.md` entry for that release names the command.
2. **Warn.** From the moment the record lands, the command carries a `DEPRECATED:`
   line on its own `--help`, and invoking it writes one sentence to **stderr** —
   what is going, what replaces it, and the release it goes in. **Never to
   stdout.** A notice on stdout would break every `--json` consumer one release
   EARLY, which is the opposite of what an announcement is for.
3. **Remove**, in a LATER release. Not the same one.

### What is enforced, and by what

`src/cli-surface.baseline.generated.ts` records the surface of the last released
version. `src/deprecation-cycle.ts` compares the tree against it and gives every
promised path one of four verdicts:

| Verdict   | What it means                                        | Owed a cycle?                  |
| --------- | ---------------------------------------------------- | ------------------------------ |
| `present` | still a leaf under the same spelling                 | no                             |
| `aliased` | not the canonical name, and it still resolves        | **no** — the sanctioned rename |
| `moved`   | renamed with NO alias, so the old line stops working | yes, on a STABLE leaf          |
| `removed` | the path and the identity are both gone              | yes, on a STABLE leaf          |

`aliased` asks whether the old line still **runs** something, not whether it still
parses. A leaf turned into a namespace — `access-card delete` gaining
`access-card delete card` under it — still resolves, and prints a help screen
instead of deleting. That is a removal, and it is refused as one.

A STABLE removal is permitted only when the record was captured into the baseline
at a release, its `announcedIn` is at or before that release, and the changelog
entry for that version NAMES THE PATH — in a code span, as `` `agent list` `` or
`` `nexus agent list` ``. A version heading alone is not an announcement, since
every past release already has one; and a path that merely appears inside a
LONGER command does not count, because `agent list` is a substring of
`agent list-templates` and of `workflow agent list` alike.

**UNSTABLE and INTERNAL owe no cycle**, because this document promises them
nothing: `admin`, `api` and `apps` "may change in any release, without a changelog
entry", and a hidden command has "no promise at all". The tier is read off the
BASELINE row, not recomputed — so hiding a command in the same commit that deletes
it does not launder it out of the promise it was under.

### What this cannot do

⚠️ **A hand-edit of `src/cli-surface.baseline.generated.ts` walks around all of
it**, and no arrangement of a checked-in file prevents that. What the design buys
is that the walk-around is a deletion from a file whose header says GENERATED, in
the same commit as the command it excuses — the same act as deleting the gate.

⚠️ **A rename that changes a flag or the description in the SAME commit** moves the
path and the identity together, so it reads as a removal. Keep the old name as an
alias and the verdict is `aliased` whatever the identity did.

⚠️ **Two leaves that share a `shape`** cannot be told apart, so neither can be
deprecated by identity and a vanished one is reported as `removed` rather than
moved. The manifest's generated header names every colliding group; there are none
today.

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
- Branch on the exit code first, then parse. Every terminal path under `--json`
  puts one parseable document on stdout, including `--help`, `--version` and a
  refusal — so a non-zero exit is the failure signal, and the document tells you
  which failure it was.
- Branch on `$?` to decide whether to RETRY — `7` and `8` are worth retrying, `5`
  never is. Branch on `error.code` to decide what to SAY. Never branch on
  `error.message`, which is prose and gets rewritten.
- Read `--help` for a command's envelope shape before writing the `jq` path. The
  shapes are not uniform and a wrong path returns `null` rather than failing.
- Pass `--yes` to every destructive command. Without a terminal the CLI refuses,
  by design.
- Pin the CLI version if you depend on payload field names.
- Use `--profile` or `NEXUS_API_KEY` to bind the session. The machine-wide active
  profile can be repointed by another terminal mid-run.
- `nexus get`, `nexus new`, `nexus install` and `nexus sync` are not commands. They
  were hidden aliases that reinstalled the binary and they were removed; each now
  exits non-zero with `unknown command`. The words survive only after a namespace —
  `nexus skills install`, `nexus workflow get` — where they mean what they say.

---

## Related

- `README.md` — installation, authentication, per-command usage
- `CHANGELOG.md` — what changed in each release, and what it costs a script
- `nexus --help` — the live epilogue this document formalizes
- `nexus known-issues <route-id>` — live defects on a specific command
- `src/command-universe.ts` — the derived command tree, if you need it in code
