/**
 * The `workspace` namespace's own `--help` banner: the two groups of
 * subcommand, the three engines, and how files get in and out. Prose about
 * BEHAVIOUR, which no contract holds — `contract-binding.ts` owns why that
 * stays hand-written beside the commands rather than being generated.
 */
export const WORKSPACE_NAMESPACE_HELP = `
TWO GROUPS OF SUBCOMMAND, AND THEY FAIL FOR OPPOSITE REASONS.

  Public API v1 (need a valid key and the network):
    list · create · rename · delete · search · restore · history · revert · push · pull
  This machine's mount registry (no Public API call):
    mount · remount · unmount · status · credential-process

"unmount" and "status" keep working after a key is revoked or while offline —
they report what THIS machine recorded, never what the server holds. "mount"
and "remount" are in the local group but still reach the server with your API
key — the WebDAV engine to mint a mount token, the direct engine to mint an
hour of storage access — so they are the local-group commands a revoked key
breaks. "credential-process" is the direct engine's own hourly renewal; it is
run by the drive, not by you.

A mounted workspace deleted server-side still appears in "status". When the two
disagree, "list" is the truth and "status" is the local record.

THE DRIVE IS LIVE AND SHARED. Teammates and agents read and write the same
files within seconds, and writes are last-write-wins per file. There is no
checkout, no lock you can rely on and no merge — re-read before you overwrite.

THE WEBDAV ENGINE IS NOT A POSIX FILESYSTEM. It is WebDAV behind a userspace
mount, so in-place edits are not supported: mv, sed -i and >> answer "Function
not implemented". Read the file, transform it in memory, and write the whole
file back. Ordinary create / read / overwrite / delete all work.

DELETING NEEDS workspaces:delete, WHICH write DOES NOT IMPLY — a read-write
mount whose key lacks it fails every rm with a 403 while cp keeps working.
workspaces:read is enough to MOUNT and to read; writing needs workspaces:write,
which does carry the read (that is the only implication scopes have, and it is
same-resource only).

THREE ENGINES, AND THEY DIFFER IN WHO HOLDS THE CREDENTIAL:
  direct   The default on macOS, Linux and Windows. rclone signs storage
           requests itself with a one-hour key that renews itself while you use
           the drive. Faster, and it needs rclone plus a FUSE layer: macFUSE or
           FUSE-T on macOS, fuse3 on Linux, WinFsp on Windows. The drive dies
           at logout or restart; "workspace remount" brings it back and uploads
           whatever the dead mount had not sent.
  webdav   macOS only: the default's fallback there, printed as one line when
           direct cannot run. Nothing to install. Every request is authorised
           by Nexus, so a revoked key stops the drive at once.
  rclone   The fallback on Linux and Windows: rclone mounting the same gateway
           over FUSE, authorised by Nexus per request, working with a raw
           --api-key. Retired on macOS, where the two others cover it.

MOUNTING WITH rclone OR direct NEEDS rclone AND A FUSE LAYER. "workspace mount"
and "workspace remount" check both first and offer to install what is missing:
the pinned official rclone into ~/.nexus-mcp/bin (x64 or arm64, no sudo or
administrator), FUSE-T on macOS, and WinFsp on Windows behind one UAC prompt.
--install-deps installs without asking;
--no-install-deps never offers. By hand:
  Linux    the official rclone, plus: sudo apt-get install fuse3
  Windows  winget install Rclone.Rclone   (plus WinFsp: https://winfsp.dev)
  macOS    the OFFICIAL rclone from https://rclone.org/downloads/ — Homebrew's
           build refuses to mount — plus macFUSE (https://macfuse.github.io) or
           FUSE-T (https://www.fuse-t.org). A macFUSE already installed is
           used, never replaced. Or use --engine webdav, which needs nothing.

A SLUG IS NOT UNIQUE. The same slug can name both an org-owned workspace and
an admin-shared one; the bare slug resolves to the org-owned copy and --shared
picks the other.

HOW FILES GET INTO A WORKSPACE — the first thing people look for. Three routes:

  1. Mount it and write through the drive — the normal way.
  2. "workspace push", when a mount is not available (CI, a container): files
     or folders over the API, in packs, each file delivered or bounced on its
     own.
  3. WebDAV directly, one file per request:
       $ curl -X PUT -u "$NEXUS_API_KEY:" --data-binary @local.md \\
           <base-url>/webdav/<slug>/notes/local.md

HOW FILES GET OUT: "workspace pull" — a folder as one ZIP unpacked in place, or
named files one by one — when a mount is not available. The mount is the
normal way; pull is its inverse the way push is its inverse for writing.

To LIST what is in a workspace without mounting, "workspace search" answers
server-side — and one raw read gives you a plain directory listing:

  $ nexus api GET /workspaces/<slug>/files --query path=<dir>

Neither listing needs a mount, which makes them the cheap answer to "is my file
there" — the question that otherwise drives a mount.`;
