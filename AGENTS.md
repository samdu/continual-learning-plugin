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

## Cursor Plugin System

- Cursor has no CLI for plugin management (unlike Claude Code's `claude plugin install`). Plugins are installed via the marketplace UI or by cloning into the cache manually.
- Installed plugins live at `~/.cursor/plugins/cache/<marketplace>/<plugin-name>/<commit-hash>/`. The commit hash is the full 40-char SHA. Cursor reads `.cursor-plugin/plugin.json` from each cached plugin to discover hooks, skills, MCP servers, etc.
- To install from GitHub without the marketplace: `git clone --depth 1 <repo-url> ~/.cursor/plugins/cache/cursor-public/<name>/<commit-hash>/`. A window reload is required afterward.
- `.cursor-plugin/plugin.json` (root level) is the Cursor plugin manifest for distribution. `.cursor/hooks.json` is for project-level hooks. These are separate mechanisms — do not create `.cursor/hooks.json` to wire up a plugin that should be installed via the cache.

## Testing Installation

- Remote is `origin` at `https://github.com/samdu/continual-learning-plugin.git`.
- **Claude Code**: To test from a clean state, remove the marketplace (`claude plugin marketplace remove continual-learning`), then re-add and install. The install is user-scoped by default (`--scope user`).
- **Cursor**: Delete `~/.cursor/plugins/cache/cursor-public/continual-learning/`, re-clone at the current HEAD, and reload the window.
- `.cursor` and `.claude` directories are gitignored — they contain runtime state only.
