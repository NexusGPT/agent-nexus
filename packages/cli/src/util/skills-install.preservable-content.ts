import type { SkillsCorpus } from "../skills-corpus/corpus";

/**
 * The bundled CLAUDE.md — the cross-cutting Cue system prompt every SKILL.md
 * cross-references.
 */
export const claudeMdContent = (corpus: SkillsCorpus): Buffer =>
  Buffer.from(corpus.claudeMd, "utf-8");

/**
 * The scoped permission posture (NEX-2461): `.claude/settings.json` declares
 * the allow/ask permission rules and wires the PreToolUse firewall + lifecycle
 * hooks. Like CLAUDE.md it lands at a path a user may have customised, so it
 * gets the same preserve-unless-`--force` treatment.
 */
export const settingsJsonContent = (corpus: SkillsCorpus): Buffer =>
  Buffer.from(corpus.settingsJson, "utf-8");
