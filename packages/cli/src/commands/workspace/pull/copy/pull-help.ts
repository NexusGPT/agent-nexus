/** `nexus workspace pull` — the operator prose its `--help` prints after the options. */
export const WORKSPACE_PULL_HELP = `
Examples:
  $ nexus workspace pull support-docs --out ./support-docs          # the whole workspace
  $ nexus workspace pull support-docs:reports --out ./q3            # one folder and its subtree
  $ nexus workspace pull support-docs:reports q3.pdf q4.pdf         # two files, by name
  $ nexus workspace pull support-docs --out ./backup --keep-zip     # keep the archive too

THE MOUNT IS THE NORMAL WAY OUT; THIS IS FOR THE MACHINE THAT CANNOT MOUNT.
A folder comes down as ONE streamed ZIP and is unpacked with the system unzip
(macOS, Linux) or tar (Windows) UNDER ITS OWN NAME, like cp -r: "pull
docs:reports --out ./q3" lands as ./q3/reports/…, and a bare slug lands as
./<out>/<slug>/…. Named files come down one by one, in parallel, each written
directly under --out by its own name.

IT COPIES LIKE cp. A local file that exists is REPLACED, silently. Two named
files sharing a base name are refused before anything is fetched.

IT FAILS LOUD, NOT PARTIAL. Unlike push, nothing here is a mailbag: a folder
the server refuses (empty, or past 50 000 entries / 2 GB) or a file that does
not exist is an error document with its own exit category, never a row.

Notes:
  --json IS THE VERDICT DOCUMENT: {success, message, bytes} for a folder pull
  (plus zip when --keep-zip), {success, message, files} for named files.
  THE ARCHIVE IS SAVED FIRST, THEN UNPACKED. When unpacking fails the run exits
  local-failed and the ZIP stays where --out points, so nothing downloaded is
  lost; unpack it by hand. A download that stops mid-stream leaves NO file
  behind: bytes land in <name>.part and are renamed into place only when
  complete, so a file that exists is a whole file. A disk that refuses the
  write (full, read-only, not yours) exits local-failed, not connection-failed.
  A REFUSED RUN LEAVES THE DISK AS IT FOUND IT. --out is created at the first
  successful byte, never before.
  NOTHING IS RECORDED ABOUT WHAT WAS PULLED. A later "push --if-unchanged"
  will need that record; it is not written yet.`;
