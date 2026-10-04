/** `nexus cloud-import` — the namespace epilogue. */
export const CLOUD_IMPORT_HELP = `
Every command here needs a --connection-id, and THERE IS NO COMMAND THAT MAKES
ONE. Connecting a Google, SharePoint or Notion account is an OAuth flow that
happens in the app; the id it produces is what you paste here.

THAT ID IS A UUID, AND IT IS CHECKED BEFORE ANYTHING ELSE IN YOUR CALL. The
"conn-1" style ids in the examples below are placeholders, not a shape the API
takes: a value that is not a UUID is refused on the connectionId field alone, so
every OTHER mistake in the same command — a missing --site-id, a bad item id —
stays hidden until you put a real id in. Test a new call with a real connection.

A CONNECTION THAT DOES NOT RESOLVE IS REPORTED AS AN API-KEY FAILURE, AND THE
PRINTED HINT IS WRONG. The message names your Nexus credentials and tells you to
run "nexus auth login". Re-authenticating cannot fix it — the rejected thing is
the PROVIDER connection. Reconnect the account in the app instead.

SHAREPOINT ALSO NEEDS A --site-id, AND NO COMMAND HERE REPORTS ONE. Five
commands take it and none produces it: the sub-command that used to list sites
is gone. Read the site id in the app, under the connected SharePoint account,
the same way you read the connection id.

The shape of a working import is always the same:
  1. "cloud-import browse <provider> --connection-id ... --folder-id root"
     (or "search") to get item ids — you cannot guess them.
  2. "cloud-import import <provider> --connection-id ... --item-ids id1,id2"
  3. "nexus document get <id>" on each returned document, until READY.

TWO THINGS THE IMPORT WILL NOT TELL YOU:
  • IT IMPORTS ROWS, NOT CONTENT. A 2xx means the documents were created; their
    text is fetched and indexed afterwards. Attaching them to a collection
    before they read READY attaches documents that retrieve nothing.
  • AN ITEM THAT FAILS IS SKIPPED IN SILENCE. Unreadable items are dropped and
    the rest proceed, so importedCount can be lower than the number of ids you
    passed with no error anywhere. Compare the two. Only a run where EVERY item
    failed is reported, as a 400.

The per-provider sub-commands (google-drive, sharepoint, notion) call the same
endpoints as the provider-agnostic ones. THEY DO NOT TAKE THE SAME FLAGS, and
the one that bites is --folder-id:

  cloud-import browse <provider>         --folder-id is REQUIRED. There is no
                                         default; omitting it is refused before
                                         a request is built. Pass "root".
  cloud-import google-drive list-files   --folder-id DEFAULTS to "root", so
                                         omitting it lists the drive root.

Both statements are true of their own command — this is a difference in the CLI
surface, not in the route behind it. A script moved from one spelling to the
other therefore keeps working or starts failing depending on which direction it
moved, with no change in what the server does.`;
