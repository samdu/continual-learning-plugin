/// <reference types="bun-types-no-globals/lib/index.d.ts" />

import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const BRANCH = "continual-learning";
const MAX_RETRIES = 3;
const TAG = "[propose-agents-update]";

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(args: string, cwd?: string): string {
  return execSync(`git ${args}`, {
    encoding: "utf-8",
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function hasRemote(): boolean {
  try {
    git("remote get-url origin");
    return true;
  } catch {
    return false;
  }
}

function getDefaultBranch(): string {
  try {
    return git("symbolic-ref refs/remotes/origin/HEAD").replace(
      "refs/remotes/origin/",
      ""
    );
  } catch {
    for (const name of ["main", "master"]) {
      try {
        git(`rev-parse --verify origin/${name}`);
        return name;
      } catch {}
    }
    return "main";
  }
}

function remoteBranchExists(): boolean {
  try {
    git(`rev-parse --verify origin/${BRANCH}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Merge the default branch into the worktree to keep the continual-learning
 * branch close to main. Uses -X ours so AGENTS.md conflicts resolve to the
 * branch's version (we overwrite it with proposed content anyway).
 */
function mergeDefault(dir: string, defaultBranch: string): void {
  try {
    git(`merge origin/${defaultBranch} -X ours --no-edit`, dir);
  } catch {
    try {
      git("merge --abort", dir);
    } catch {}
  }
}

function hasChanges(dir: string): boolean {
  try {
    git("diff --exit-code AGENTS.md", dir);
  } catch {
    return true;
  }
  return git("status --porcelain AGENTS.md", dir).length > 0;
}

function cleanup(dir: string): void {
  try {
    git(`worktree remove "${dir}" --force`);
  } catch {
    try {
      rmSync(dir, { recursive: true, force: true });
      git("worktree prune");
    } catch {}
  }
}

function fallbackWrite(proposedPath: string): void {
  const content = readFileSync(proposedPath, "utf-8");
  writeFileSync(resolve("AGENTS.md"), content, "utf-8");
  console.error(`${TAG} Fallback: wrote AGENTS.md directly to workspace root`);
}

// ---------------------------------------------------------------------------
// Core workflow
// ---------------------------------------------------------------------------

function main(): number {
  const proposedPath = process.argv[2];
  if (!proposedPath || !existsSync(proposedPath)) {
    console.error(
      `${TAG} Usage: bun run propose-agents-update.ts <proposed-agents.md>`
    );
    return 1;
  }

  if (!hasRemote()) {
    console.error(`${TAG} No git remote, falling back to direct write`);
    fallbackWrite(proposedPath);
    return 0;
  }

  try {
    git("worktree prune");
  } catch {}

  const dir = mkdtempSync(join(tmpdir(), "cl-agents-"));

  try {
    git("fetch origin");
    const defaultBranch = getDefaultBranch();
    const branchOnRemote = remoteBranchExists();
    const startPoint = branchOnRemote
      ? `origin/${BRANCH}`
      : `origin/${defaultBranch}`;

    git(`worktree add --detach "${dir}" ${startPoint}`);

    if (branchOnRemote) {
      mergeDefault(dir, defaultBranch);
    }

    copyFileSync(proposedPath, join(dir, "AGENTS.md"));

    if (!hasChanges(dir)) {
      console.error(`${TAG} No changes to AGENTS.md, skipping`);
      cleanup(dir);
      return 0;
    }

    git("add AGENTS.md", dir);
    git('commit -m "chore: update AGENTS.md with learned patterns"', dir);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        git(`push origin HEAD:refs/heads/${BRANCH}`, dir);
        console.error(`${TAG} Pushed to ${BRANCH} branch`);
        cleanup(dir);
        return 0;
      } catch {
        if (attempt === MAX_RETRIES) break;
        console.error(
          `${TAG} Push attempt ${attempt} failed, retrying...`
        );
        git("fetch origin", dir);
        const resetTo = remoteBranchExists()
          ? `origin/${BRANCH}`
          : `origin/${defaultBranch}`;
        git(`reset --hard ${resetTo}`, dir);
        mergeDefault(dir, defaultBranch);
        copyFileSync(proposedPath, join(dir, "AGENTS.md"));
        git("add AGENTS.md", dir);
        git(
          'commit -m "chore: update AGENTS.md with learned patterns"',
          dir
        );
      }
    }

    throw new Error("Push failed after all retries");
  } catch (error) {
    console.error(
      `${TAG} Git workflow failed, falling back to direct write`,
      error
    );
    cleanup(dir);
    fallbackWrite(proposedPath);
    return 0;
  }
}

process.exit(main());
