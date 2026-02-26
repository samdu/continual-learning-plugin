# Continual Learning (Dual-Harness)

Automatically and incrementally keeps `AGENTS.md` up to date from transcript changes.
Works in both **Cursor** and **Claude Code** — so teammates using either tool contribute
to the same shared memory file.

## How it works

A `stop` hook fires after each completed conversation turn. When enough turns have
accumulated and enough time has passed, it tells the agent to run the `continual-learning`
skill, which:

1. Scans transcripts from **both** Cursor and Claude Code (whichever exist).
2. Processes only new or changed transcripts (incremental index).
3. Extracts high-signal patterns — recurring corrections, durable workspace facts.
4. Updates `AGENTS.md` in place — deduplicating, merging, never blowing away existing bullets.

## Installation

### Cursor

```
/add-plugin ~/github/continual-learning-plugin
```

### Claude Code

Claude Code installs plugins through marketplaces. This repo ships a
`marketplace.json` so it can act as its own single-plugin marketplace.

```bash
# 1. Register the marketplace (from a local path or git URL)
/plugin marketplace add ~/github/continual-learning-plugin

# 2. Install the plugin
/plugin install continual-learning@continual-learning
```

Once pushed to a GitHub repo, teammates can use the `owner/repo` shorthand:

```bash
/plugin marketplace add your-org/continual-learning-plugin
/plugin install continual-learning@continual-learning
```

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

## State files

Each harness stores its own cadence state and transcript index under the workspace:

| Harness | State directory |
|---|---|
| Cursor | `.cursor/hooks/state/` |
| Claude Code | `.claude/hooks/state/` |

Both write to the same `AGENTS.md` at the workspace root.

## AGENTS.md output

The skill maintains two sections:

- `## Learned User Preferences`
- `## Learned Workspace Facts`

Plain bullet points only. No metadata, no confidence scores.

## License

MIT
