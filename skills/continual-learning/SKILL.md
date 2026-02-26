---
name: continual-learning
description: Incrementally extract recurring user corrections and durable workspace facts from transcript changes, then update AGENTS.md with plain bullet points only. Use when the user asks to mine previous chats, maintain AGENTS.md memory, or build a self-learning preference loop.
---

# Continual Learning

Keep `AGENTS.md` current using transcript deltas instead of full rescans.

## Inputs

- Existing memory file: `AGENTS.md`
- Incremental index: passed in via the hook's followup message (harness-specific path)
- Transcript sources (scan **both**, if they exist):
  - Cursor: `~/.cursor/projects/*/agent-transcripts/*.jsonl`
  - Claude Code: `~/.claude/projects/*/*.jsonl`

## Transcript Discovery

Identify the current workspace path. Derive transcript directories for both tools:

- Cursor slugs the workspace path by replacing `/` with `-` and dropping the leading slash
  (e.g. `/Users/sam/github/data-dbt` → `Users-sam-github-data-dbt`).
  Transcripts live in `~/.cursor/projects/<slug>/agent-transcripts/`.
- Claude Code prefixes with `-` and uses the same slash-to-dash transform
  (e.g. `-Users-sam-github-data-dbt`).
  Transcripts live directly in `~/.claude/projects/<slug>/`.

Check both directories. Either or both may exist. Skip any that don't.

## Workflow

1. Read existing `AGENTS.md` first.
2. Load incremental index if present (path provided in the hook trigger message).
3. Discover transcript files from **both** Cursor and Claude Code directories.
   Process only:
   - new files not in the index, or
   - files whose mtime is newer than the indexed mtime.
4. Extract only high-signal, reusable information:
   - recurring user corrections/preferences
   - durable workspace facts
5. Merge with existing bullets in `AGENTS.md`:
   - update matching bullets in place
   - add only net-new bullets
   - deduplicate semantically similar bullets
6. Write back the incremental index:
   - store latest mtimes for processed files
   - remove entries for files that no longer exist

## AGENTS.md Output Contract

- Keep only these sections:
  - `## Learned User Preferences`
  - `## Learned Workspace Facts`
- Use plain bullet points only.
- Do not write evidence/confidence tags.
- Do not write process instructions, rationale, or metadata blocks.

## Inclusion Bar

Keep an item only if all are true:

- actionable in future sessions
- stable across sessions
- repeated in multiple transcripts, or explicitly stated as a broad rule
- non-sensitive

## Exclusions

Never store:

- secrets, tokens, credentials, private personal data
- one-off task instructions
- transient details (branch names, commit hashes, temporary errors)

## Incremental Index Format

```json
{
  "version": 1,
  "transcripts": {
    "/abs/path/to/file.jsonl": {
      "mtimeMs": 1730000000000,
      "lastProcessedAt": "2026-02-18T12:00:00.000Z"
    }
  }
}
```
