/**
 * THE HELP-TRUTH LEDGER — every command whose `--help` fails a rule TODAY.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT A LINE MEANS, AND WHAT IT DOES NOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A line is a MEASUREMENT of a defect that is already shipped, never permission
 * for it. `help-truth.test.ts` compares this file against the live scan and
 * fails in FOUR directions, which is what makes it a ratchet rather than a
 * suppression list:
 *
 *   1. a violation on a command NOT listed here          -> RED (a new defect)
 *   2. a listed command that now has NO violations       -> RED (prune the line)
 *   3. a listed command whose violation SET has moved    -> RED, both ways: a key
 *      that appeared is a new defect, a key that vanished is a fix that must be
 *      written down. Without the second arm the ledger stops ratcheting — an
 *      entry recording three defects silently re-permits the two that were fixed.
 *   4. a listed command no longer in the tree            -> RED (renamed or gone)
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * HOW ADDING TO IT IS MADE LOUD — and why that is not the same as impossible
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * No test can stop a person editing this file, and claiming otherwise would be
 * the false green this gate exists to prevent. Two mechanisms make an addition
 * VISIBLE, and each costs a second deliberate edit in the same diff:
 *
 *   - {@link LEDGER_CEILING} is the VIOLATION count as measured — not the entry
 *     count, because one entry carries several keys. One more violation fails
 *     the gate until this number is ALSO raised — a number going the wrong way,
 *     in the diff, where a reviewer reads it.
 *   - {@link CLEAN_NAMESPACES} is WRITTEN OUT, never derived. Derived it would
 *     be true by construction and would gate nothing. Re-opening a namespace
 *     named there costs a third edit that no per-command arm can see.
 *
 * ⚠️ DELETING A LINE IS NEVER HOW A RED BUILD IS FIXED. A red says the command
 * moved: fix the help, or — if the command was renamed — rename the key.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * READING A KEY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   R0-no-example      the leaf shows no `$ nexus …` invocation, so rules 1-4 are
 *                      BLIND to it. This is the tripwire, not a style note.
 *   R0-no-notes        the leaf ships no `Notes:` block.
 *   R1 <code> <flag>   commander refuses the example: the reader cannot run it.
 *   R2 body.<field>    a key inside `--body '{…}'` the route's schema refuses.
 *   R3 --flag=<value>  an id-shaped flag value the route's schema refuses.
 *   R4 arg<n>=<value>  a literal id in a path slot whose format the route sets.
 *
 * A key names the CAUSE — never a line number, never a message — so reflowing
 * prose cannot rot the ledger.
 */

/** Command path -> the violation keys it produces, sorted. */
export const HELP_TRUTH_LEDGER: Readonly<Record<string, readonly string[]>> = {
  "access-card create": ["R1 threw access-card create --credential-id abc-123 --nam"],
  "admin vibe-build-job claim": ["R0-no-notes"],
  "admin vibe-build-job fail": ["R0-no-example", "R0-no-notes"],
  "admin vibe-build-job succeed": ["R0-no-example", "R0-no-notes"],
  "admin vibe-build-job time-out": ["R0-no-example", "R0-no-notes"],
  "admin vibe-build-job-timeout-sweep trigger": ["R0-no-notes"],
  "admin vibe-build-runner tick": ["R0-no-notes"],
  "admin vibe-consumption-cap get": ["R0-no-notes"],
  "admin vibe-cost-safety get": ["R0-no-notes"],
  "admin vibe-deployment await-approval": ["R0-no-example", "R0-no-notes"],
  "admin vibe-deployment begin-deploy": ["R0-no-example", "R0-no-notes"],
  "admin vibe-deployment mark-failed": ["R0-no-example", "R0-no-notes"],
  "admin vibe-deployment mark-healthy": ["R0-no-example", "R0-no-notes"],
  "admin vibe-deployment mark-rolled-back": ["R0-no-example", "R0-no-notes"],
  "admin vibe-deployment-runner tick": ["R0-no-notes"],
  "admin vibe-rollback-sweep trigger": ["R0-no-notes"],
  "agent delete": ["R4 arg0=abc-123"],
  "agent duplicate": ["R4 arg0=abc-123"],
  "agent generate-profile-picture": ["R4 arg0=abc-123"],
  "agent get": ["R4 arg0=abc-123"],
  "agent update": ["R4 arg0=abc-123"],
  "agent upload-profile-picture": ["R4 arg0=abc-123"],
  "agent-collection list": ["R4 arg0=agt-123"],
  "agent-skill list": ["R0-no-notes"],
  "agent-skill presets": ["R0-no-example", "R0-no-notes"],
  "analytics export": ["R3 --deployment-id=dep-123"],
  "analytics feedback": ["R0-no-notes"],
  "analytics metrics": ["R0-no-notes"],
  "analytics overview": ["R0-no-notes", "R3 --deployment-id=dep-123"],
  "asset delete": ["R4 arg0=asset-123"],
  "asset get": ["R0-no-notes", "R4 arg0=asset-123"],
  "asset list": ["R0-no-notes"],
  "auth list": ["R0-no-notes"],
  "auth switch": ["R0-no-notes"],
  "auth unpin": ["R0-no-notes"],
  "channel whatsapp-sender create": ["R3 --connection-id=abc", "R3 --phone-number-id=def"],
  "channel whatsapp-template create": ["R3 --connection-id=abc"],
  "channel whatsapp-template list": ["R3 --connection-id=abc"],
  "channel whatsapp-template submit-approval": ["R3 --connection-id=abc"],
  "channel whatsapp-template test-send": ["R3 --connection-id=abc"],
  "claude-code list": ["R0-no-notes"],
  "cloud-import browse": [
    "R3 --connection-id=conn-1",
    "R3 --connection-id=conn-2",
    "R3 --connection-id=conn-3"
  ],
  "cloud-import google-drive import": ["R3 --connection-id=conn-1"],
  "cloud-import google-drive list-files": ["R3 --connection-id=conn-1"],
  "cloud-import import": [
    "R3 --connection-id=conn-1",
    "R3 --connection-id=conn-2",
    "R3 --connection-id=conn-3",
    "R3 --parent-id=folder-9"
  ],
  "cloud-import notion import": ["R3 --connection-id=conn-3"],
  "cloud-import notion search": ["R3 --connection-id=conn-3"],
  "cloud-import search": [
    "R3 --connection-id=conn-1",
    "R3 --connection-id=conn-2",
    "R3 --connection-id=conn-3"
  ],
  "cloud-import sharepoint import": ["R3 --connection-id=conn-2"],
  "cloud-import sharepoint list-files": ["R3 --connection-id=conn-2"],
  "collection attach-documents": ["R4 arg0=col-123"],
  "collection delete": ["R4 arg0=col-123"],
  "collection documents": ["R4 arg0=col-123"],
  "collection get": ["R4 arg0=col-123"],
  "collection query": ["R4 arg0=col-123"],
  "collection remove-document": ["R4 arg0=col-123", "R4 arg1=doc-456"],
  "collection search": ["R4 arg0=col-123"],
  "collection stats": ["R4 arg0=col-123"],
  "collection update": ["R4 arg0=col-123"],
  "credential delete": ["R4 arg0=abc-123"],
  "credential get": ["R4 arg0=abc-123"],
  "credential update": ["R4 arg0=abc-123"],
  "custom-model delete": ["R0-no-notes", "R4 arg0=cm-123"],
  "custom-model get": ["R0-no-notes", "R4 arg0=cm-123"],
  "custom-model list": ["R0-no-notes"],
  "custom-model update": ["R4 arg0=cm-123"],
  "customer create": ["R0-no-example", "R0-no-notes"],
  "customer delete": ["R0-no-example", "R0-no-notes"],
  "customer get": ["R0-no-example", "R0-no-notes"],
  "customer get-by-external-id": ["R0-no-example", "R0-no-notes"],
  "customer list": ["R0-no-notes"],
  "customer note": ["R0-no-example", "R0-no-notes"],
  "customer update": ["R0-no-example", "R0-no-notes"],
  "deployment create": ["R3 --agent-id=agt-123", "R3 --agent-id=agt-456"],
  "deployment delete": ["R4 arg0=dep-123"],
  "deployment embed-config": ["R4 arg0=dep-123"],
  "deployment embed-config-update": ["R4 arg0=dep-123"],
  "deployment folder assign": ["R3 --deployment-id=dep-123", "R3 --folder-id=fld-456"],
  "deployment folder create": ["R2 body.parentId"],
  "deployment folder delete": ["R4 arg0=fld-123"],
  "deployment folder update": ["R4 arg0=fld-123"],
  "deployment get": ["R4 arg0=dep-123"],
  "deployment stats": ["R4 arg0=dep-123"],
  "deployment template attach": ["R4 arg0=dep-123"],
  "deployment template detach": ["R4 arg0=dep-123"],
  "deployment template list": ["R4 arg0=dep-123"],
  "deployment template settings": ["R4 arg0=dep-123"],
  "deployment template update": ["R4 arg0=dep-123"],
  "deployment update": ["R3 --agent-id=agt-456", "R4 arg0=dep-123"],
  "docs search": ["R0-no-notes"],
  "document children": ["R4 arg0=doc-123"],
  "document create-folder": ["R3 --parent-id=folder-123"],
  "document delete": ["R4 arg0=doc-123"],
  "document download": ["R4 arg0=doc-123"],
  "document get": ["R4 arg0=doc-123"],
  "document preview": ["R4 arg0=doc-123"],
  "document reprocess": ["R4 arg0=doc-123"],
  "document update": ["R4 arg0=doc-123"],
  "emulator scenario delete": ["R4 arg0=scn-123"],
  "emulator scenario get": ["R4 arg0=scn-123"],
  "emulator scenario list": ["R3 --deployment-id=dep-123"],
  "emulator scenario replay": [
    "R2 body.deploymentId",
    "R3 --deployment-id=dep-456",
    "R4 arg0=scn-123"
  ],
  "emulator scenario save": [
    "R2 body.deploymentId",
    "R2 body.sessionId",
    "R3 --deployment-id=dep-456",
    "R3 --session-id=sess-123"
  ],
  "emulator send": ["R4 arg0=dep-123", "R4 arg1=sess-456"],
  "emulator session create": ["R4 arg0=dep-123"],
  "emulator session delete": ["R4 arg0=dep-123", "R4 arg1=sess-456"],
  "emulator session get": ["R4 arg0=dep-123", "R4 arg1=sess-456"],
  "emulator session list": ["R4 arg0=dep-123"],
  "execution cancel": ["R4 arg0=exec-123"],
  "execution diagnose": ["R4 arg0=exec-123"],
  "execution export": ["R4 arg0=exec-123"],
  "execution follow": ["R4 arg0=exec-123"],
  "execution get": ["R4 arg0=exec-123"],
  "execution list": ["R3 --workflow-id=wf-123"],
  "execution node-result": ["R4 arg0=exec-123"],
  "execution output": ["R4 arg0=exec-123"],
  "execution retry": ["R4 arg0=exec-123"],
  "external-tool delete": ["R0-no-notes", "R4 arg0=ext-123"],
  "external-tool get": ["R4 arg0=ext-123"],
  "external-tool initiate-oauth": ["R0-no-notes"],
  "external-tool list": ["R0-no-notes"],
  "external-tool test": ["R4 arg0=ext-123"],
  "external-tool test-auth": ["R0-no-notes", "R4 arg0=ext-123"],
  "external-tool update": ["R4 arg0=ext-123"],
  "external-tool update-auth": ["R4 arg0=ext-123"],
  "external-tool update-spec": ["R4 arg0=ext-123"],
  "external-tool upload-icon": ["R0-no-notes", "R4 arg0=ext-123"],
  "folder assign": [
    "R2 body.agentId",
    "R2 body.folderId",
    "R3 --agent-id=agt-123",
    "R3 --folder-id=fld-456"
  ],
  "folder create": ["R3 --parent-id=abc-123"],
  "folder delete": ["R4 arg0=abc-123"],
  "folder update": ["R4 arg0=abc-123"],
  "html-template create": ["R3 --deployment-id=dep-123"],
  "html-template delete": ["R4 arg0=tpl-123"],
  "html-template fill": ["R4 arg0=tpl-123"],
  "html-template get": ["R4 arg0=tpl-123"],
  "html-template list": ["R0-no-notes", "R3 --deployment-id=dep-123"],
  "html-template render": ["R4 arg0=tpl-123"],
  "html-template update": ["R4 arg0=tpl-123"],
  "model list": ["R0-no-notes"],
  "permissions access": ["R4 arg1=11111111-1111-1111-1111-111111111111"],
  "phone-number get": ["R4 arg0=abc-123"],
  "phone-number release": ["R4 arg0=abc-123"],
  "skill-folder assign": ["R0-no-example", "R0-no-notes"],
  "skill-folder create": ["R0-no-example", "R0-no-notes"],
  "skill-folder delete": ["R0-no-example", "R0-no-notes"],
  "skill-folder update": ["R0-no-example", "R0-no-notes"],
  "skills list": ["R0-no-notes"],
  "skills version": ["R0-no-notes"],
  "skills where": ["R0-no-notes"],
  "task delete": ["R4 arg0=task-123"],
  "task execute": ["R4 arg0=task-123"],
  "task get": ["R4 arg0=task-123"],
  "task update": ["R4 arg0=task-123"],
  "task-eval dataset add": ["R4 arg0=task-123", "R4 arg1=sess-456"],
  "task-eval dataset list": ["R0-no-notes", "R4 arg0=task-123", "R4 arg1=sess-456"],
  "task-eval execute": ["R0-no-notes", "R4 arg0=task-123", "R4 arg1=sess-456"],
  "task-eval formats": ["R0-no-notes"],
  "task-eval judge": ["R0-no-notes", "R4 arg0=task-123", "R4 arg1=sess-456"],
  "task-eval judges": ["R0-no-notes"],
  "task-eval results": ["R0-no-notes", "R4 arg0=task-123", "R4 arg1=sess-456"],
  "task-eval session create": ["R0-no-notes", "R4 arg0=task-123"],
  "task-eval session delete": ["R4 arg0=task-123", "R4 arg1=sess-456"],
  "task-eval session get": ["R0-no-notes", "R4 arg0=task-123", "R4 arg1=sess-456"],
  "task-eval session list": ["R0-no-notes", "R4 arg0=task-123"],
  "template folder assign": ["R3 --folder-id=fld-456", "R3 --template-id=tmpl-123"],
  "template folder create": ["R3 --parent-id=fld-123"],
  "template folder delete": ["R4 arg0=fld-123"],
  "template folder update": ["R4 arg0=fld-123"],
  "template generate": ["R4 arg0=tmpl-123"],
  "template get": ["R4 arg0=tmpl-123"],
  "template upload": ["R4 arg0=tmpl-123"],
  "ticket create": ["R1 threw --body"],
  "tool connect": ["R4 arg0=tool-123"],
  "tool connection-status": ["R0-no-notes"],
  "tool create-credential": ["R0-no-notes", "R4 arg0=tool-123"],
  "tool credentials": ["R0-no-notes", "R4 arg0=tool-123"],
  "tool delete-credential": ["R4 arg0=tool-123", "R4 arg1=cred-456"],
  "tool execute": ["R4 arg0=tool-123"],
  "tool get": ["R0-no-notes", "R4 arg0=tool-123"],
  "tool resolve-options": ["R0-no-notes", "R4 arg0=tool-123"],
  "tool test": ["R0-no-notes", "R4 arg0=agt-123", "R4 arg1=tool-cfg-456"],
  "tracing delete": ["R4 arg0=abc-123"],
  "tracing export": ["R4 arg0=abc-123"],
  "tracing generation": ["R4 arg0=gen-123"],
  "tracing generations": ["R3 --trace-id=abc-123"],
  "tracing trace": ["R4 arg0=abc-123"],
  "tracing traces": ["R3 --agent-id=abc"],
  "user-group add-member": ["R0-no-notes"],
  "user-group list": ["R0-no-notes"],
  "user-group remove-member": ["R0-no-notes"],
  "vibe app attach-repo": ["R0-no-notes"],
  "vibe app create": ["R0-no-notes"],
  "vibe app delete": ["R0-no-notes"],
  "vibe app edge-token": ["R0-no-notes"],
  "vibe app get": ["R0-no-example", "R0-no-notes"],
  "vibe app list": ["R0-no-example", "R0-no-notes"],
  "vibe app logs": ["R0-no-notes"],
  "vibe app provision-repo": ["R0-no-notes"],
  "vibe app register-as-tool": ["R0-no-notes"],
  "vibe app reprovision-repo": ["R0-no-notes"],
  "vibe app rotate-edge-token": ["R0-no-notes"],
  "vibe app update": ["R0-no-notes"],
  "vibe app visibility": ["R0-no-notes"],
  "vibe approvals decide": ["R0-no-notes"],
  "vibe approvals get": ["R0-no-notes"],
  "vibe approvals pending": ["R0-no-notes"],
  "vibe audit list": ["R0-no-notes"],
  "vibe cluster provision": ["R0-no-notes"],
  "vibe cluster status": ["R0-no-notes"],
  "vibe deploy": ["R0-no-notes"],
  "vibe deploy-state": ["R0-no-notes"],
  "vibe deployments get": ["R0-no-example", "R0-no-notes"],
  "vibe deployments list": ["R0-no-example", "R0-no-notes"],
  "vibe env list": ["R0-no-notes"],
  "vibe env rm": ["R0-no-notes"],
  "vibe env set": ["R0-no-notes"],
  "vibe git-credentials": ["R0-no-notes"],
  "vibe git-project clone": ["R0-no-notes"],
  "vibe git-project create": ["R0-no-notes"],
  "vibe git-project delete": ["R0-no-notes"],
  "vibe git-project get": ["R0-no-notes"],
  "vibe git-project list": ["R0-no-notes"],
  "vibe git-project pull": ["R0-no-notes"],
  "vibe git-project reprovision": ["R0-no-notes"],
  "vibe rollback": ["R0-no-notes"],
  "workflow batch": ["R4 arg0=wf-123"],
  "workflow branch create": ["R4 arg0=wf-123"],
  "workflow branch delete": ["R4 arg0=wf-123"],
  "workflow branch list": ["R4 arg0=wf-123"],
  "workflow branch update": ["R4 arg0=wf-123"],
  "workflow delete": ["R4 arg0=wf-123"],
  "workflow duplicate": ["R4 arg0=wf-123"],
  "workflow edge create": ["R4 arg0=wf-123"],
  "workflow edge delete": ["R4 arg0=wf-123"],
  "workflow get": ["R4 arg0=wf-123"],
  "workflow layout": ["R4 arg0=wf-123"],
  "workflow node create": [
    "R1 threw workflow node create wf-123 --type aiTask --body",
    "R4 arg0=wf-123"
  ],
  "workflow node delete": ["R4 arg0=wf-123"],
  "workflow node get": ["R4 arg0=wf-123"],
  "workflow node output-format": ["R4 arg0=wf-123"],
  "workflow node reload-props": ["R4 arg0=wf-123"],
  "workflow node test": ["R0-no-notes", "R4 arg0=wf-123"],
  "workflow node test-payload": ["R0-no-notes", "R4 arg0=wf-123"],
  "workflow node update": ["R4 arg0=wf-123"],
  "workflow node variables": ["R4 arg0=wf-123"],
  "workflow overview": ["R4 arg0=wf-123"],
  "workflow platform-listener-events": ["R0-no-notes"],
  "workflow publish": ["R4 arg0=wf-123"],
  "workflow test": ["R4 arg0=wf-123"],
  "workflow test-node": ["R4 arg0=wf-123"],
  "workflow trigger": ["R4 arg0=wf-123"],
  "workflow unpublish": ["R4 arg0=wf-123"],
  "workflow update": ["R4 arg0=wf-123"],
  "workflow upload-icon": ["R4 arg0=wf-123"],
  "workflow validate": ["R4 arg0=wf-123"]
};

/**
 * The number of VIOLATIONS the scan produces, as measured. A ceiling, never a
 * target.
 *
 * ⚠️ VIOLATIONS, NOT ENTRIES — `LEDGER 5` compares it against
 * `report.violations.length`, and one entry carries several keys, so the two
 * numbers are far apart and reading this as an entry count makes the ceiling
 * look wildly slack.
 *
 * The gate refuses a scan that produces more. Lowering it as defects are fixed
 * is the ratchet; raising it is the visible cost of writing a new defect down.
 */
export const LEDGER_CEILING = 334;

/**
 * The DENOMINATOR: how many namespaces the CLI registers, as measured.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A NUMERATOR ALONE IS NOT PROGRESS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * {@link CLEAN_NAMESPACES} counts the namespaces that are done. On its own that
 * is a number with nothing to divide by, so "how far along is this?" had no
 * answer anywhere in the repository — and the only two counts that had been
 * written down lived in prose, in `because:` strings and docblocks, where
 * nothing checked them. Both had gone stale by one. That is the whole failure
 * this constant exists to prevent: a count nobody can check reads exactly like a
 * count somebody checked.
 *
 * `PROGRESS 1` asserts this equals the live commander tree, so the denominator
 * cannot rot in silence. Registering a namespace reddens it, and the fix is to
 * raise this number in the same diff — where a reviewer reads it.
 *
 * ⚠️ VISIBLE namespaces. `upgrade` registers 18 hidden aliases (`up`, `bump`,
 * `install`, …); `deriveCommandNamespaces()` drops them, so they are outside
 * this count. They are top-level command NAMES, never namespaces — 65 top-level
 * names are {@link NAMESPACE_TOTAL} namespaces.
 */
export const NAMESPACE_TOTAL = 47;

/**
 * Namespaces asserted to hold NO ledger entry at all — written out, never
 * derived, because a derived list is true by construction and gates nothing.
 *
 * These are the namespaces whose `--help` is true by every rule this gate can
 * check. `role` is the model the rest were written from, so a red here means the
 * FORM has drifted.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS LIST IS THE NUMERATOR, SO IT HAS TO BE COMPLETE IN BOTH DIRECTIONS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `LEDGER 6` guards one direction — a name here must stay clean. That alone
 * makes the list a floor and not a measurement: four namespaces
 * (`agent-tool`, `conversation`, `known-issues`, `upgrade`) had become clean and
 * nobody added them, so the recorded numerator said 6 where the tree said 10 and
 * no gate could tell the difference.
 *
 * `PROGRESS 2` guards the other direction: a namespace with zero violations MUST
 * be named here. Fixing the last defect in a namespace now reddens the build
 * until the name is added.
 *
 * `PROGRESS 3` guards the third side — every name here must still BE a
 * namespace. `LEDGER 6` cannot supply it: it asks whether a declared name holds
 * a ledger entry, and a namespace that does not exist holds none, so a ghost
 * name passes as clean and inflates the count with the build green.
 *
 * Together the three make `CLEAN_NAMESPACES.length / NAMESPACE_TOTAL` the
 * programme's actual progress. Drop `PROGRESS 2` and it reads low; drop
 * `PROGRESS 3` and it reads high.
 */
export const CLEAN_NAMESPACES: readonly string[] = [
  "agent-eval",
  "agent-tool",
  "api",
  "conversation",
  "known-issues",
  "prompt-assistant",
  "role",
  "upgrade",
  "version",
  "workspace"
];
