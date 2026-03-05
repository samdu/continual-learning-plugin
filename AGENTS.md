# AGENTS.md

## Project Structure

- Marketplace manifest lives at `.claude-plugin/marketplace.json` (root level). The actual plugin lives inside `plugin/` with its own manifest at `plugin/.claude-plugin/plugin.json`. These are separate layers — the root is the "marketplace" wrapper, `plugin/` is the installable unit.
- Cursor entry point is `.cursor-plugin/plugin.json` (separate from the Claude Code path).
- No `package.json` or build step. Hooks are TypeScript files executed directly via `bun run`.

## Claude Code Plugin System

- `claude plugin ...` is the CLI syntax. `/plugin ...` is the slash command syntax for interactive sessions. They do the same thing but are not interchangeable — slash commands only work inside a running Claude Code session, CLI commands only work from a terminal.
- `claude plugin install <name>` works without the `@marketplace` qualifier when the plugin name is unique across registered marketplaces. The `plugin@marketplace` form is only needed for disambiguation.
- There is no direct-path install — you cannot `claude plugin install ./some/path`. The marketplace must be registered first, then the plugin installed by name from it. This is a Claude Code platform constraint, not a design choice.
- `claude plugin validate <path>` works on both marketplace roots and plugin directories and is useful for checking manifests.

## Worktree Handling

- The hook resolves the main worktree root via `git rev-parse --git-common-dir` and stores cadence state + incremental index there. All worktrees of the same repo share a single state file.
- The skill discovers all worktree paths via `git worktree list --porcelain` and scans transcript directories for each. This collapses project identity to repo level, not filesystem path.
- Falls back gracefully to single-path behavior for non-git workspaces.

## AGENTS.md Update Flow

- AGENTS.md updates go to a long-lived `continual-learning` branch, not directly to the workspace filesystem. The skill reads baseline content from `origin/continual-learning` (falling back to the default branch), then the helper script at `plugin/scripts/propose-agents-update.ts` handles commit + push.
- The helper script uses a detached-HEAD temp worktree so it never touches the user's working tree. On push conflicts (concurrent sessions), it does fetch-merge-retry up to 3 times.
- If there's no remote, the script falls back to writing AGENTS.md directly to the workspace root.
- The team manually creates PRs from `continual-learning` → `main` to curate and merge learnings.

## Testing Installation

- This repo has no git remote. The GitHub `owner/repo` shorthand in the README is forward-looking and won't work until the repo is pushed.
- To test the full install flow from a clean state: remove the marketplace (`claude plugin marketplace remove continual-learning`), then re-add and install.
- The install is user-scoped by default (`--scope user`). Project and local scopes are also available.
