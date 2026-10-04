/**
 * Appended to `nexus workflow node delete`: what a node delete takes with it, and
 * what it leaves behind.
 */

export const NODE_DELETE_NOTES = `
Examples:
  $ nexus workflow node delete 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow node delete 11111111-1111-4111-8111-111111111111 node-456 --yes

Notes:
  DELETING A LOOP OR doWhile DELETES EVERY NODE INSIDE IT, and every node inside
  a loop nested in that one. The whole body goes in one call.
  EVERY EDGE TOUCHING A DELETED NODE GOES TOO — INCLUDING THE CONTAINER'S OWN
  INBOUND AND OUTBOUND EDGES, which connect nodes OUTSIDE it. Those nodes stay
  but are left unconnected, and validate will report them as DISCONNECTED_NODE.
  THE OUTPUT IS THE ONLY ACCOUNT OF WHAT WENT, and it is a server response, not
  a CLI confirmation: the verdict line counts the casualties and
  deletedNodeIds / deletedEdgeIds name them, on both channels. severedNodeIds is
  the third list and the one you act on — the SURVIVING nodes an edge was taken
  from, i.e. the repair list; a warning on stderr repeats it. Nothing else
  reports the cascade; before this existed the only way to see it was to diff
  "nexus workflow get" before and after.
  A TRIGGER CANNOT BE DELETED: 403 NODE_TRIGGER_DELETE_FORBIDDEN. Replace it with
  "nexus workflow trigger <wf-id> --type <triggerType>".
  THE ONE EXCEPTION REPAIRS A DAMAGED GRAPH: a trigger-typed node CAN be deleted
  while another REAL trigger remains. That covers a workflow left holding two
  triggers — it runs only the first and silently skips the rest, and "nexus
  workflow validate" names the extras as graphIssues MULTIPLE_TRIGGERS — and a
  stale selectTrigger placeholder left beside a real trigger, which blocks test
  and publish forever. The 403 returns the moment the last real trigger is what
  you are deleting. Both still read deletable:false; that field records the node
  type, not this repair path.
  A loopStart / doWhileStart cannot be deleted either (400) — delete its parent
  loop, which takes the start node with it.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`;
