---
name: continual-learning
description: Incrementally extract recurring user corrections and durable workspace facts from transcript changes, then update AGENTS.md with plain bullet points only. Use when the user asks to mine previous chats, maintain AGENTS.md memory, or build a self-learning preference loop.
---

# Continual Learning

Keep `AGENTS.md` current using transcript deltas instead of full rescans.

## Inputs

- Existing memory: `AGENTS.md` read from git (see Workflow step 1)
- Incremental index: passed in via the hook's followup message (harness-specific path)
- Helper script path: passed in via the hook's followup message
- Transcript sources (scan **both**, if they exist):
  - Cursor: `~/.cursor/projects/*/agent-transcripts/*.jsonl`
  - Claude Code: `~/.claude/projects/*/*.jsonl`

## Transcript Discovery

Collect **all workspace paths** for this repo, not just the current one:

1. Run `git worktree list --porcelain` and collect every line starting with `worktree `.
   Each gives an absolute path to a worktree checkout.
2. If the command fails (not a git repo, git not available), fall back to just the current
   workspace path.

For **each** worktree path, derive transcript directories for both tools:

- Cursor slugs the path by replacing `/` with `-` and dropping the leading slash
  (e.g. `/Users/sam/github/data-dbt` → `Users-sam-github-data-dbt`).
  Transcripts live in `~/.cursor/projects/<slug>/agent-transcripts/`.
- Claude Code prefixes with `-` and uses the same slash-to-dash transform
  (e.g. `-Users-sam-github-data-dbt`).
  Transcripts live directly in `~/.claude/projects/<slug>/`.

Check all directories. Skip any that don't exist. This ensures transcripts from every
worktree of the same repo are processed, so learnings are not siloed to a single checkout.

## Workflow

1. **Read current AGENTS.md from git** (not the filesystem):
   - `git show origin/continual-learning:AGENTS.md`
   - If the branch doesn't exist, fall back to `git show origin/<default-branch>:AGENTS.md`
     (detect default branch via `git symbolic-ref refs/remotes/origin/HEAD`).
   - If neither exists, start with empty content.
   - If there's no remote at all, read from `AGENTS.md` in the workspace root.
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
7. **Propose the update via git**: write the complete proposed `AGENTS.md` to a temp file
   (e.g. `/tmp/proposed-agents-<pid>.md`), then run the helper script whose path is
   provided in the hook trigger message: `bun run <script-path> <tmpfile>`.
   The script commits to the `continual-learning` branch, pushes, and falls back to
   writing `AGENTS.md` directly to the workspace root if there's no remote.

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
