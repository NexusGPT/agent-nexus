/** `nexus workspace mount` — the hand-written prose. */
export const WORKSPACE_MOUNT_HELP = `
Examples:
  $ nexus workspace mount support-docs
  $ nexus workspace mount support-docs --at ./ws --claude-md
  $ nexus workspace mount support-docs --read-only
  $ nexus workspace mount support-docs --shared      # mount the admin-shared copy
  $ nexus workspace mount support-docs --engine direct

When a slug names BOTH an org-owned workspace and an admin-shared one, the bare
slug resolves to the org-owned copy. The mount then warns and tells you the id
it picked; pass --shared to mount the shared copy instead.

The default mount point is ~/nexus/<org>/<slug>, where <org> is your
organization's name slugified (its id when the name is unknown), so two orgs
mounting one slug land in two directories. With no organization known at all
(a raw --api-key and no NEXUS_ORGANIZATION_ID) it is the org-less
~/nexus/<slug>. Mount points are still machine-wide: a directory another org's
live mount already occupies is refused — pick another with --at <path>.

Engines — auto (the default) is direct on macOS, Linux and Windows, and falls back to
that platform's gateway engine where direct cannot serve the mount, printing
one line that says why: the workspace list did not answer, a CODE workspace,
an earlier rclone mount whose unsent saves only rclone uploads, a raw --api-key
or no organization (direct re-reads a saved key every hour), a renewal line
this machine's paths cannot hold, or, on macOS, rclone or FUSE-T it cannot
use (not installed, not approved, blocked; "--engine direct" says why). On
Linux and Windows the gateway needs the same rclone and FUSE, so a missing one
is refused.
  • direct  — rclone signing storage requests itself with a one-hour key that
              renews itself while you use the drive (no action from you; a
              renewal that fails posts a macOS notification and shows in
              "workspace status"). Faster, with a local write cache. Needs
              macFUSE or FUSE-T on macOS, FUSE on Linux, WinFsp on Windows,
              where the hourly renewal runs through a renew.cmd wrapper beside
              the drive's aws.config. The drive dies at logout or restart —
              "workspace remount <slug>" brings it back and uploads what the
              dead mount had not sent.
  • webdav  — macOS native mount_webdav. No extra install, no macFUSE, no
              Recovery mode. Every request is authorised by Nexus, so a revoked
              key stops the drive at once. auto's fallback on macOS, and
              macOS-ONLY: asking for it on Linux or Windows is refused outright.
  • rclone  — rclone mounting the same Nexus gateway over FUSE. Authorised by
              Nexus per request like webdav, and it works with a raw --api-key.
              auto's fallback on Linux and Windows (WinFsp).
              Retired on macOS, where webdav and direct cover it: asking for it
              there is refused, naming both.

THE GATEWAY ENGINES (webdav, rclone) ARE THE FALLBACK: CORRECT, NOT FAST. Every
operation on them goes to Nexus and then to storage, so copying many small
files is slow by design — measured at 420× the direct engine on 20 small files
— and that is not scheduled to change. Use direct where it can run. Where it
cannot, the verbs that need no mount are the way around the slow cases:
"workspace push" and "workspace pull" move files in and out, "workspace
history" and "workspace revert" bring an earlier version of a file back.

Prerequisites for the engines that run rclone (rclone, direct):
  Linux    the official rclone — on x64 and arm64 the mount offers to install
           it (no sudo); elsewhere: curl https://rclone.org/install.sh | sudo bash
           sudo apt-get install fuse3
  Windows  the mount offers to install rclone.exe (no administrator) and WinFsp
           (one UAC prompt); by hand: the official rclone.exe from
           https://rclone.org/downloads/ at %USERPROFILE%\\.nexus-mcp\\bin, and
           WinFsp from https://winfsp.dev. An rclone found on PATH is not used
           on Windows: a bare name is looked up in the working folder first.
  macOS    the OFFICIAL rclone binary from https://rclone.org/downloads/ —
           Homebrew's build refuses "rclone mount" — plus ONE FUSE layer:
           macFUSE (https://macfuse.github.io; a kernel extension, approved
           once in Recovery mode on Apple Silicon) or FUSE-T
           (https://www.fuse-t.org; no kernel extension). The mount checks all
           of this before it asks Nexus for any key, names what is missing,
           and offers to install it: the pinned official rclone into
           ~/.nexus-mcp/bin, and FUSE-T. --install-deps installs without
           asking; --no-install-deps never offers. macFUSE is used when present,
           never installed.

Notes:
  THE MOUNT POINT MUST BE EMPTY, and it is created for you if it does not
  exist. A non-empty directory is refused with "Mount point <path> is not
  empty" before anything is mounted — pick another with --at.
  ON WINDOWS --at TAKES A FOLDER OR A FREE DRIVE LETTER (--at X:). A drive
  letter is visible only in the session that mounted it; a folder is visible
  everywhere. --at * is refused (name the letter), and so are a network path,
  a folder inside OneDrive, and names Windows reserves (con, nul, com1…).
  ON THE rclone ENGINE FILES OVER 100 MiB NEVER FINISH UPLOADING: the copy
  looks done while rclone keeps retrying. "workspace push" is no way around
  it: it refuses every file of 45 MiB or more. On Linux and Windows, mount
  with --engine direct to write them.
  THE WEBDAV DRIVE IS NOT POSIX. In-place edits are unsupported there: mv,
  sed -i and >> answer "Function not implemented". Read the file, transform it
  in memory, and write the whole file back. The direct engine's write cache
  supports them.
  workspaces:read IS ENOUGH TO MOUNT AND READ. Writing needs workspaces:write
  and DELETING NEEDS workspaces:delete, which write does not imply — a
  read-write WebDAV mount on a key without it fails every rm with a 403 while
  every cp succeeds. --read-only is a local guard, not the scope. The direct
  engine asks Nexus for the access up front instead: a key without both
  workspaces:write and workspaces:delete gets a READ-ONLY drive, and the
  command says so.
  A SUCCESSFUL MOUNT IS NOT A WORKING MOUNT. mount_webdav and rclone both
  report success on a mount whose gateway then refuses every read. Verify by
  reading one file you know is there.
  --shared PICKS THE ADMIN-SHARED COPY. Without it a slug that names both
  resolves to the org-owned one, and the command warns and prints the id it
  chose — read that line.
  --claude-md WRITES TO ./CLAUDE.md IN THE CURRENT DIRECTORY, creating it if
  needed and replacing only its managed nexus-workspace block.
  THE MOUNT OUTLIVES THIS COMMAND. rclone is detached, so the CLI exits while
  the mount stays up; it survives until "nexus workspace unmount", a logout or
  reboot, or the process being killed. Its log is under the CLI's log
  directory.
  The drive is LIVE and SHARED: teammates and agents see your changes within
  seconds, and you see theirs. Unmount with \`nexus workspace unmount <slug>\`.
  A CODE WORKSPACE IS MOUNTED READ-ONLY FOR YOU, AND --read-only CANNOT BE
  TURNED OFF. CODE is a read-only projection of a git project, so the server
  refuses every PUT, DELETE and MOVE against it; the WebDAV mount is made
  read-only up front, "workspace status" prints Mode ro, and the command prints
  why. Change the files by pushing to the git project instead. --json carries
  storageKind (DRIVE / CODE) and readOnlyReason ("kind" / "requested" /
  "granted" / null) — note that --json's OWN "kind" key is this command's
  OWNERSHIP field (org-owned / admin-shared), a different question with the
  same name.
  THE DIRECT ENGINE REFUSES A CODE WORKSPACE OUTRIGHT: its storage also holds
  engine-owned checkout generations, and a local write cache would accept saves
  the server then drops. auto mounts one through the gateway instead, and
  mounts the gateway too when the workspace list does not answer (the kind is
  then unknown). Under --engine direct with the list unreachable, the mint's
  own answer decides, the minted key is discarded, and the refusal names the
  gateway engine to mount it with.
  THE DIRECT ENGINE REFUSES A RAW --api-key / NEXUS_API_KEY (auto falls back
  to the gateway): its hourly renewal re-reads the key from the profile that
  saved it, and a key that was never saved cannot be re-read. Run "nexus auth
  login" first. It also needs an organization resolved for the profile, and
  records it — later "auth use-org" switches never re-point a live drive.
  IF THE WORKSPACE LIST CANNOT BE FETCHED, THE KIND IS UNKNOWN AND THE MOUNT
  FALLS BACK TO READ-WRITE. Unknown is not "writable" — the server still
  refuses the writes, you just lose the warning. Re-mount once
  "nexus workspace list" works again.
  --json ADDS mountId, access AND pendingUploads FOR A DIRECT MOUNT (null
  otherwise): the per-mount id "workspace credential-process" takes, the access
  Nexus granted, and how many saves a previous mount left in the cache that are
  uploading now — the string "unknown" when that cache is there and cannot be
  read, which is NOT the same as null and must not be counted as zero. An
  rclone mount carries mountId (its cache folder's id) and pendingUploads too.
  Never a bucket, a prefix or a credential value.
  MOUNTING TO ANSWER "IS THAT FILE THERE" IS THE EXPENSIVE WAY.
  "nexus workspace search <slug> --query <text>" runs server-side, needs no
  mount, no rclone and no FUSE, and answers in one call. Mount when you need
  the BYTES; search when you need to know what exists.`;
