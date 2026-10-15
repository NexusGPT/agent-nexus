/**
 * `nexus mcp install --help`'s after-block, in its own module so the registrar
 * stays inside the per-function line cap. Interpolated verbatim; the bytes a
 * reader sees are the bytes below.
 */
export const INSTALL_NOTES = `
Examples:
  $ nexus mcp install
  $ nexus mcp install --client cursor
  $ nexus mcp install --client claude-desktop --apply
  $ nexus mcp install --client claude-code --apply --force
  $ nexus mcp install --name nexus-prod --profile prod
  $ nexus mcp install --no-pin

Notes:
  WITHOUT --apply THIS WRITES NOTHING. It prints the block and the path it
  belongs in, which is the safe default for a file you may keep under version
  control. --apply MERGES the block into that file, preserving every other server
  already configured there, and creates the file when it does not exist.
  WHERE THE BLOCK GOES DEPENDS ON THE CLIENT, and two of the three are outside
  this directory: claude-code writes .mcp.json in the CURRENT WORKING DIRECTORY
  (project scope — it is normally committed), cursor writes ~/.cursor/mcp.json
  and claude-desktop writes the desktop app's own config under your home
  directory. The command prints the resolved path before it writes.
  🚨 THE BLOCK CONTAINS NO API KEY, DELIBERATELY. It launches "nexus mcp serve",
  which resolves the profile at start, so the credential stays in the CLI's
  config and never lands in a file that gets committed. A block carrying a key is
  not something this command emits.
  THE PROFILE IS PINNED BY DEFAULT, and that is the flag that matters. The active
  profile is machine-global state that "nexus auth switch" repoints from any
  terminal, silently, so an unpinned host would change organization under a
  running editor. --no-pin drops the pin when following the active profile is
  what you actually want.
  AN EXISTING ENTRY OF THE SAME NAME IS REFUSED, not overwritten. Pass --force to
  replace it, or --name <other> to keep both. A config file that is not valid
  JSON is refused too — this command will not discard a file it cannot read.
  RESTART THE HOST AFTER --apply. None of these clients re-read their MCP config
  while running, so a block that is correct on disk changes nothing until then.`;
