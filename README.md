# Continual Learning (Dual-Harness)

Automatically and incrementally keeps `AGENTS.md` up to date from transcript changes.
Works in both **Cursor** and **Claude Code** — so teammates using either tool contribute
to the same shared memory file.

## How it works

A `stop` hook fires after each completed conversation turn. When enough turns have
accumulated and enough time has passed, it tells the agent to run the `continual-learning`
skill, which:

1. Reads the current `AGENTS.md` from the `continual-learning` branch in git (not the local filesystem).
2. Scans transcripts from **both** Cursor and Claude Code across **all worktrees**.
3. Processes only new or changed transcripts (incremental index).
4. Extracts high-signal patterns — recurring corrections, durable workspace facts.
5. Commits the updated `AGENTS.md` to the `continual-learning` branch and pushes.

### Two-tier workflow

**Tier 1 (automated):** Each skill run commits directly to a long-lived
`continual-learning` branch. No PR, no review friction — learnings accumulate immediately.

**Tier 2 (manual curation):** The team opens a PR from `continual-learning` → `main`
whenever they're ready to review and merge. Squash-merge is recommended for clean history.

This keeps the fast path frictionless while giving the team a curation checkpoint
before learnings land on `main`.

Falls back to writing `AGENTS.md` directly to the workspace root for repos without
a remote.

## Installation

### Cursor

Run this slash command inside a Cursor chat:

```
/add-plugin ~/github/continual-learning-plugin
```

### Claude Code

Claude Code requires plugins to come from a registered **marketplace** — a
directory or repo containing a `marketplace.json` manifest. This repo ships
one so it can act as its own single-plugin marketplace.

That means installation is two steps: register the marketplace, then install
the plugin from it.

**From inside an interactive Claude Code session** (slash commands):

```
/plugin marketplace add ~/github/continual-learning-plugin
/plugin install continual-learning
```

**From your terminal** (CLI):

```bash
claude plugin marketplace add ~/github/continual-learning-plugin
claude plugin install continual-learning
```

Once pushed to a GitHub repo, teammates can use the `owner/repo` shorthand
instead of a local path:

```bash
claude plugin marketplace add your-org/continual-learning-plugin
claude plugin install continual-learning
```

> **Tip:** You may see the `plugin@marketplace` syntax elsewhere (e.g.
> `continual-learning@continual-learning`). The `@marketplace` qualifier is
> only needed when the same plugin name exists in multiple marketplaces.
> For most setups you can omit it.

## Trigger cadence

Default cadence (after trial window expires):

| Parameter | Default |
|---|---|
| Minimum turns | 10 |
| Minimum minutes since last run | 120 |

Trial mode (first 24 hours after install):

| Parameter | Default |
|---|---|
| Minimum turns | 3 |
| Minimum minutes since last run | 15 |

## Env overrides

All knobs can be overridden via environment variables:

- `CONTINUAL_LEARNING_MIN_TURNS`
- `CONTINUAL_LEARNING_MIN_MINUTES`
- `CONTINUAL_LEARNING_TRIAL_MODE` (1/true/yes/on)
- `CONTINUAL_LEARNING_TRIAL_MIN_TURNS`
- `CONTINUAL_LEARNING_TRIAL_MIN_MINUTES`
- `CONTINUAL_LEARNING_TRIAL_DURATION_MINUTES`

Legacy `CONTINUOUS_LEARNING_*` prefixes also work.

## Git worktree support

If you use multiple worktrees of the same repo (common for parallel AI coding sessions),
the plugin collapses them to repo level:

- **Shared cadence state**: The hook resolves the main worktree via
  `git rev-parse --git-common-dir` and stores state/index there. Multiple worktrees
  won't redundantly trigger learning runs.
- **Cross-worktree transcript discovery**: When the skill runs, it calls
  `git worktree list --porcelain` to find all worktree paths, then scans transcript
  directories for each. Learnings from any worktree are visible everywhere.
- **Shared output via git**: All worktrees commit to the same `continual-learning`
  branch, so learnings from any checkout are visible to every teammate.

Falls back to single-path behavior for non-git workspaces.

## State files

Each harness stores its own cadence state and transcript index under the **main worktree**
root (or workspace root if not in a git repo):

| Harness | State directory |
|---|---|
| Cursor | `.cursor/hooks/state/` |
| Claude Code | `.claude/hooks/state/` |

## AGENTS.md output

The skill maintains two sections:

- `## Learned User Preferences`
- `## Learned Workspace Facts`

Plain bullet points only. No metadata, no confidence scores.

## License

MIT
