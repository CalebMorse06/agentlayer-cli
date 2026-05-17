import path from 'node:path';

export function agentDir(repoRoot: string): string {
  return path.join(repoRoot, '.agent');
}

export function runsDir(repoRoot: string): string {
  return path.join(repoRoot, '.agent', 'runs');
}

export function runDir(repoRoot: string, runId: string): string {
  return path.join(repoRoot, '.agent', 'runs', runId);
}

export function memoryDir(repoRoot: string): string {
  return path.join(repoRoot, '.agent', 'memory');
}

export function worktreesDir(repoRoot: string): string {
  return path.join(repoRoot, '.agent', 'worktrees');
}

export function worktreePath(repoRoot: string, runId: string): string {
  return path.join(repoRoot, '.agent', 'worktrees', runId);
}
