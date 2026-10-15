/**
 * THE VOCABULARY OF REFUSALS — why a descriptor the CLI genuinely calls is NOT
 * in the ledger.
 *
 * NO REASON BLOCKS A DESCRIPTOR FOR WANT OF A FLAG ANY MORE. `no-flag-and-no-body`
 * holds zero records:
 *
 *   · `no-flag-and-no-body` — the enum is a QUERY PARAMETER the CLI never sends,
 *     and there is no `--body` to reach it through. Binding one means ADDING A
 *     FLAG — a change to what the CLI can DO, not to what it says, and therefore
 *     a product decision rather than rollout.
 *
 *     Every descriptor that ever carried this reason took the decision instead
 *     of deferring it, and each one paid for itself:
 *
 *       - `tracing generations` — `--sort-by` and `--order` added. Until then
 *         `--provider` printed a hand-typed three-value list while the server
 *         accepted four, so a KIMI generation was unfilterable by anyone
 *         reading --help.
 *       - `tracing traces` — `--source` added, which let `--status`, `--sort-by`
 *         and `--order` bind. All three had hand-typed their values in
 *         DESCRIPTIONS and validated nothing, under a Notes block that claimed
 *         "any other value is refused". Driven, `--sort-by __junk__` reached the
 *         network. A help text asserting a refusal nothing performs is worse
 *         than one saying nothing at all.
 *       - `tracing cost-breakdown` — `--bucket` added.
 *       - `customer list` — `--sort-by`, `--sort-order` and `--channel` added.
 *         The adapter behind that route keeps its own sort allowlist and falls
 *         back silently on a miss, so an unvalidated `--sort-by` did not even
 *         400: it returned a differently-ordered page and said nothing.
 *       - `execution list` — `--sort-by` and `--order` added, unblocking
 *         `--status` on both of its routes.
 *
 *     The reason stays in the union because the SHAPE is real and the next
 *     query parameter somebody adds will wear it. It describes nothing today.
 *     Count it, never quote it.
 *
 *     ⚠️ A BODY FIELD WITH NO FLAG IS A DIFFERENT SHAPE AND IS NOT BLOCKED. A
 *     command carrying `--body` genuinely reaches it, so `bodyOnly` states the
 *     truth and the descriptor binds. `template create` does that for
 *     `Body.type`, and `deployment embed-config-update` for all seven of its
 *     enums. Reading the two as one shape leaves bindable descriptors on the
 *     floor, which is exactly what happened.
 *
 * 🚨 `open-union` HOLDS NO RECORD, AND THE EXAMPLE THIS TEXT USED TO GIVE FOR IT
 * WAS NOT ONE. It read: "`tool connect --service` takes a built-in OAuth service
 * name OR any Pipedream app slug, so `.choices()` would refuse valid input" — and
 * `ToolConnectionConnect` projects exactly one field, `PathVars.toolId`, with no
 * enum and no `service` at all. There was nothing to refuse and therefore nothing
 * to block, which is why the census has always printed `open-union (0)` while
 * this paragraph called it one of two live blocks. The reason stays in the union
 * because an open set IS a real permanent limit; it simply does not describe
 * anything in the contract today. Count it, never quote it.
 *
 * These are NOT blocks, and each was read as one at some point. Each now has a
 * reason of its own, so it is countable instead of being folded into a wall:
 *
 *   · A POSITIONAL ENUM. Commander validates `.choices()` on an `Argument`
 *     exactly as on an `Option` — required, optional and variadic all refuse a
 *     junk value. Bind one with `enumArgument`, never by hand: the
 *     `.argParser()` trap that silently disables `.choices()` is identical on
 *     both. There is no reason for this shape because there is nothing to refuse.
 *   · ONE LEAF SERVING TWO DESCRIPTORS -> `route-twin-bound-elsewhere`. `ticket
 *     list --all-orgs`, `channel setup --auto` and `execution list
 *     --workflow-id` switch route on a flag while `bindCommand` takes one shape.
 *     A DECISION already taken and argued at the call site — the default branch
 *     is bound because the two descriptors' enums are identical. Do not reopen
 *     it.
 *   · A NESTED OR ARRAY-OF-OBJECT BODY ENUM -> `reachable-not-yet-bound`. This
 *     was the largest remaining group and it is now EMPTY: `judgeConfigs[]
 *     .provider` and `filters[].op` were bound with their namespaces, and
 *     `channel whatsapp-template create`, `deployment template attach`,
 *     `workflow batch` and `workflow edge create` — the last four — are bound
 *     here. Each took a `bodyOnly` reason, or in `deployment template attach`'s
 *     case one `enumOption` on a `--type` that already existed and validated
 *     nothing. The reason stays in the union for the next namespace, because
 *     "nobody got to it" must never be spellable as "it cannot be done".
 *
 * One shape stops a NAMESPACE rather than a descriptor: `no-projected-fields`.
 * `ModelList` is `GET /public/v1/models` with no path, query or body, so the
 * generator refuses to write a module for a namespace holding only descriptors
 * like it — every flag bound to one would be offered no values whatever.
 * `model` and `auth` are that class: `auth` reaches only `MeGet` and
 * `MeListOrganizations`, and both project nothing either.
 */

/**
 * Why a descriptor the CLI genuinely calls is NOT in the ledger.
 *
 * ⚠️ NOT AN ENUM OF EVERY POSSIBLE REASON. It is the vocabulary this rollout has
 * needed, and adding to it is a deliberate edit here rather than a sentence
 * somewhere. The taxonomy that preceded it was prose alone, and prose alone is
 * how "commander validates choices on options only" survived long enough to cost
 * four descriptors their binding.
 *
 * IT IS, HOWEVER, TOTAL OVER THE DESCRIPTORS A CLI LEAF CALLS. `contract-blocked
 * .test.ts` derives that population from the contract and the commander tree on
 * every run and fails on one that is neither bound nor named below, so a
 * descriptor cannot be silently unexamined.
 */
export type BlockedReason =
  /** A query parameter with no flag, on a command with no `--body` to reach it
   *  through. Unblocking means ADDING A FLAG — a product decision. */
  | "no-flag-and-no-body"
  /** The value is a closed contract enum OR an open set the contract cannot
   *  name, so `.choices()` would refuse valid input. A permanent limit. */
  | "open-union"
  /** The descriptor projects no fields at all, so the generator refuses to write
   *  a module for a namespace holding only descriptors like it. */
  | "no-projected-fields"
  /** NOT A WALL. Every enum is reachable TODAY — through `--body`, a flag or a
   *  positional — and nobody has written the binding yet. `unreachable` MUST be
   *  empty, and `contract-blocked-audit.ts` proves the reach path by path.
   *  Kept distinct from every other reason because conflating "nobody got to it"
   *  with "it cannot be done" is how the prose taxonomy drifted: a body field
   *  with no flag is this, never `no-flag-and-no-body`. */
  | "reachable-not-yet-bound"
  /** NOT A WALL. One leaf switches route on a flag while `bindCommand` takes one
   *  shape, and the leaf is bound to the twin. A decision taken, argued at the
   *  call site. `unreachable` MUST be empty. */
  | "route-twin-bound-elsewhere";
