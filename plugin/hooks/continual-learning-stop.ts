/// <reference types="bun-types-no-globals/lib/index.d.ts" />

import { execSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { stdin } from "bun";

// ---------------------------------------------------------------------------
// Harness detection
// ---------------------------------------------------------------------------

const IS_CLAUDE_CODE = !!process.env.CLAUDE_PLUGIN_ROOT;
const HARNESS_STATE_DIR = IS_CLAUDE_CODE
  ? ".claude/hooks/state"
  : ".cursor/hooks/state";

// ---------------------------------------------------------------------------
// Git worktree resolution — share state across worktrees of the same repo
// ---------------------------------------------------------------------------

function getMainWorktreeRoot(): string | null {
  try {
    const gitCommonDir = execSync("git rev-parse --git-common-dir", {
      encoding: "utf-8",
    }).trim();
    const abs = resolve(gitCommonDir);
    return abs.endsWith("/.git") ? dirname(abs) : null;
  } catch {
    return null;
  }
}

const MAIN_WORKTREE_ROOT = getMainWorktreeRoot();
const STATE_BASE = MAIN_WORKTREE_ROOT ?? process.cwd();

const STATE_PATH = resolve(
  STATE_BASE,
  HARNESS_STATE_DIR,
  "continual-learning.json"
);
const INCREMENTAL_INDEX_PATH = resolve(
  STATE_BASE,
  HARNESS_STATE_DIR,
  "continual-learning-index.json"
);

// ---------------------------------------------------------------------------
// Cadence defaults
// ---------------------------------------------------------------------------

const DEFAULT_MIN_TURNS = 10;
const DEFAULT_MIN_MINUTES = 120;
const TRIAL_DEFAULT_MIN_TURNS = 3;
const TRIAL_DEFAULT_MIN_MINUTES = 15;
const TRIAL_DEFAULT_DURATION_MINUTES = 24 * 60;

// ---------------------------------------------------------------------------
// Helper script path (for committing AGENTS.md to the continual-learning branch)
// ---------------------------------------------------------------------------

const SCRIPT_PATH = resolve(import.meta.dir, "../scripts/propose-agents-update.ts");

// ---------------------------------------------------------------------------
// Background prompt — spawned as a detached `claude -p` process
// ---------------------------------------------------------------------------

const BACKGROUND_PROMPT = `Run the \`continual-learning\` skill now. First run \`git fetch origin\` to get the latest remote state. Then read current AGENTS.md from git: try \`git show origin/continual-learning:AGENTS.md\`, falling back to \`git show origin/main:AGENTS.md\` (detect default branch via \`git symbolic-ref refs/remotes/origin/HEAD\` if needed). If no remote, read from filesystem. Scan transcripts from **all git worktrees** — run \`git worktree list --porcelain\` to discover sibling worktree paths, derive transcript slugs for each. Use incremental transcript processing with index file \`${INCREMENTAL_INDEX_PATH}\`: only read transcripts not in the index or whose mtime is newer than indexed. After processing, write back index mtimes and remove entries for deleted transcripts. Update AGENTS.md only for high-signal, repeated user-correction patterns or durable workspace facts. Exclude one-off/transient details and secrets. Keep each section to at most 12 bullets. Plain bullet points only, no metadata. If no meaningful updates, respond exactly: No high-signal memory updates. Otherwise, write the complete proposed AGENTS.md to a temp file, then run: \`bun run ${SCRIPT_PATH} <tmpfile>\` to commit it to the \`continual-learning\` branch. The script pushes to the remote and retries on conflicts. Falls back to direct write if there's no remote.`;

// ---------------------------------------------------------------------------
// Spawn a detached background `claude -p` process
// ---------------------------------------------------------------------------

function spawnBackgroundClaude(cwd: string): void {
  // Find claude binary
  let claudePath: string;
  try {
    claudePath = execSync("which claude", { encoding: "utf-8" }).trim();
  } catch {
    console.error("[continual-learning-stop] could not find claude binary");
    return;
  }

  // Strip CLAUDECODE env var to avoid "nested session" rejection
  const env = { ...process.env };
  delete env.CLAUDECODE;

  const child = spawn(claudePath, ["-p", "--no-session-persistence", BACKGROUND_PROMPT], {
    detached: true,
    stdio: "ignore",
    cwd,
    env,
  });
  child.unref();
  console.error(`[continual-learning-stop] spawned background claude (pid ${child.pid})`);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StopHookInput {
  // Actual Claude Code Stop hook payload
  session_id: string;
  transcript_path?: string | null;
  cwd?: string;
  hook_event_name?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
  permission_mode?: string;
  // Legacy/Cursor fields
  conversation_id?: string;
  generation_id?: string;
  status?: "completed" | "aborted" | "error" | string;
  loop_count?: number;
}

interface ContinualLearningState {
  version: 1;
  lastRunAtMs: number;
  turnsSinceLastRun: number;
  lastTranscriptMtimeMs: number | null;
  lastProcessedGenerationId: string | null;
  trialStartedAtMs: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const n = value.trim().toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

function readEnvValue(primary: string, legacy: string): string | undefined {
  return process.env[primary] ?? process.env[legacy];
}

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

function loadState(): ContinualLearningState {
  const fallback: ContinualLearningState = {
    version: 1,
    lastRunAtMs: 0,
    turnsSinceLastRun: 0,
    lastTranscriptMtimeMs: null,
    lastProcessedGenerationId: null,
    trialStartedAtMs: null,
  };

  if (!existsSync(STATE_PATH)) return fallback;

  try {
    const raw = readFileSync(STATE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ContinualLearningState>;
    if (parsed.version !== 1) return fallback;
    return {
      version: 1,
      lastRunAtMs:
        typeof parsed.lastRunAtMs === "number" &&
        Number.isFinite(parsed.lastRunAtMs)
          ? parsed.lastRunAtMs
          : 0,
      turnsSinceLastRun:
        typeof parsed.turnsSinceLastRun === "number" &&
        Number.isFinite(parsed.turnsSinceLastRun) &&
        parsed.turnsSinceLastRun >= 0
          ? parsed.turnsSinceLastRun
          : 0,
      lastTranscriptMtimeMs:
        typeof parsed.lastTranscriptMtimeMs === "number" &&
        Number.isFinite(parsed.lastTranscriptMtimeMs)
          ? parsed.lastTranscriptMtimeMs
          : null,
      lastProcessedGenerationId:
        typeof parsed.lastProcessedGenerationId === "string"
          ? parsed.lastProcessedGenerationId
          : null,
      trialStartedAtMs:
        typeof parsed.trialStartedAtMs === "number" &&
        Number.isFinite(parsed.trialStartedAtMs)
          ? parsed.trialStartedAtMs
          : null,
    };
  } catch {
    return fallback;
  }
}

function saveState(state: ContinualLearningState): void {
  const directory = dirname(STATE_PATH);
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

// ---------------------------------------------------------------------------
// Transcript helpers
// ---------------------------------------------------------------------------

function getTranscriptMtimeMs(
  transcriptPath: string | null | undefined
): number | null {
  if (!transcriptPath) return null;
  try {
    return statSync(transcriptPath).mtimeMs;
  } catch {
    return null;
  }
}

function shouldCountTurn(input: StopHookInput): boolean {
  // Claude Code sends hook_event_name="Stop" on every completed turn
  if (input.hook_event_name === "Stop") return true;
  // Legacy/Cursor path
  return input.status === "completed" && input.loop_count === 0;
}

async function parseHookInput<T>(): Promise<T> {
  const text = await stdin.text();
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(args: string[]): Promise<number> {
  try {
    const input = await parseHookInput<StopHookInput>();
    const state = loadState();

    if (
      input.generation_id &&
      input.generation_id === state.lastProcessedGenerationId
    ) {
      console.log(JSON.stringify({}));
      return 0;
    }
    state.lastProcessedGenerationId = input.generation_id ?? null;

    const countedTurn = shouldCountTurn(input);
    const turnIncrement = countedTurn ? 1 : 0;
    const turnsSinceLastRun = state.turnsSinceLastRun + turnIncrement;
    const now = Date.now();

    // Trial mode
    const trialEnabled =
      args.includes("--trial") ||
      parseBoolean(
        readEnvValue(
          "CONTINUAL_LEARNING_TRIAL_MODE",
          "CONTINUOUS_LEARNING_TRIAL_MODE"
        )
      );
    if (trialEnabled && countedTurn && state.trialStartedAtMs === null) {
      state.trialStartedAtMs = now;
    }

    const trialDurationMinutes = parsePositiveInt(
      readEnvValue(
        "CONTINUAL_LEARNING_TRIAL_DURATION_MINUTES",
        "CONTINUOUS_LEARNING_TRIAL_DURATION_MINUTES"
      ),
      TRIAL_DEFAULT_DURATION_MINUTES
    );
    const trialMinTurns = parsePositiveInt(
      readEnvValue(
        "CONTINUAL_LEARNING_TRIAL_MIN_TURNS",
        "CONTINUOUS_LEARNING_TRIAL_MIN_TURNS"
      ),
      TRIAL_DEFAULT_MIN_TURNS
    );
    const trialMinMinutes = parsePositiveInt(
      readEnvValue(
        "CONTINUAL_LEARNING_TRIAL_MIN_MINUTES",
        "CONTINUOUS_LEARNING_TRIAL_MIN_MINUTES"
      ),
      TRIAL_DEFAULT_MIN_MINUTES
    );
    const inTrialWindow =
      trialEnabled &&
      state.trialStartedAtMs !== null &&
      now - state.trialStartedAtMs < trialDurationMinutes * 60_000;

    const minTurns = parsePositiveInt(
      readEnvValue(
        "CONTINUAL_LEARNING_MIN_TURNS",
        "CONTINUOUS_LEARNING_MIN_TURNS"
      ),
      DEFAULT_MIN_TURNS
    );
    const minMinutes = parsePositiveInt(
      readEnvValue(
        "CONTINUAL_LEARNING_MIN_MINUTES",
        "CONTINUOUS_LEARNING_MIN_MINUTES"
      ),
      DEFAULT_MIN_MINUTES
    );

    const effectiveMinTurns = inTrialWindow ? trialMinTurns : minTurns;
    const effectiveMinMinutes = inTrialWindow ? trialMinMinutes : minMinutes;
    const minutesSinceLastRun =
      state.lastRunAtMs > 0
        ? Math.floor((now - state.lastRunAtMs) / 60000)
        : Number.POSITIVE_INFINITY;
    const transcriptMtimeMs = getTranscriptMtimeMs(input.transcript_path);
    const hasTranscriptAdvanced =
      transcriptMtimeMs !== null &&
      (state.lastTranscriptMtimeMs === null ||
        transcriptMtimeMs > state.lastTranscriptMtimeMs);

    const shouldTrigger =
      countedTurn &&
      turnsSinceLastRun >= effectiveMinTurns &&
      minutesSinceLastRun >= effectiveMinMinutes &&
      hasTranscriptAdvanced;

    if (shouldTrigger) {
      state.lastRunAtMs = now;
      state.turnsSinceLastRun = 0;
      state.lastTranscriptMtimeMs = transcriptMtimeMs;
      saveState(state);

      spawnBackgroundClaude(input.cwd ?? process.cwd());
      console.log(JSON.stringify({}));
      return 0;
    }

    state.turnsSinceLastRun = turnsSinceLastRun;
    saveState(state);
    console.log(JSON.stringify({}));
    return 0;
  } catch (error) {
    console.error("[continual-learning-stop] failed", error);
    console.log(JSON.stringify({}));
    return 0;
  }
}

const exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
