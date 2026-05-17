import { execFileSync } from 'node:child_process';

function git(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err: any) {
    const stderr = err.stderr?.toString().trim() ?? '';
    throw new Error(`git ${args[0]} failed: ${stderr || err.message}`);
  }
}

export function findRepoRoot(startDir: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: startDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error(`Not a Git repository: ${startDir}`);
  }
}

export function revParse(ref: string, cwd: string): string {
  return git(['rev-parse', ref], cwd);
}

export function currentBranch(cwd: string): string {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

export function defaultBranch(cwd: string): string {
  // Try to detect default branch from remote HEAD
  try {
    const output = git(['remote', 'show', 'origin'], cwd);
    const match = output.match(/HEAD branch: (.+)/);
    if (match) return match[1].trim();
  } catch {
    // No remote or error — fall through
  }
  // Check if main exists
  try {
    git(['rev-parse', '--verify', 'main'], cwd);
    return 'main';
  } catch {
    return 'master';
  }
}

export function statusPorcelain(cwd: string): string {
  return git(['status', '--porcelain'], cwd);
}

export interface WorktreeEntry {
  path: string;
  sha: string;
  branch: string;
}

export function listWorktrees(cwd: string): WorktreeEntry[] {
  const output = git(['worktree', 'list', '--porcelain'], cwd);
  const worktrees: WorktreeEntry[] = [];
  let current: Partial<WorktreeEntry> = {};

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      current.path = line.slice('worktree '.length);
    } else if (line.startsWith('HEAD ')) {
      current.sha = line.slice('HEAD '.length);
    } else if (line.startsWith('branch refs/heads/')) {
      current.branch = line.slice('branch refs/heads/'.length);
    } else if (line === '') {
      if (current.path) {
        worktrees.push({
          path: current.path,
          sha: current.sha ?? '',
          branch: current.branch ?? '(detached)',
        });
      }
      current = {};
    }
  }

  if (current.path) {
    worktrees.push({
      path: current.path,
      sha: current.sha ?? '',
      branch: current.branch ?? '(detached)',
    });
  }

  return worktrees;
}

export function addWorktree(
  repoRoot: string,
  wtPath: string,
  branch: string,
  fromSha: string
): void {
  git(['worktree', 'add', '-b', branch, wtPath, fromSha], repoRoot);
}

export function removeWorktree(repoRoot: string, wtPath: string, force = false): void {
  const args = ['worktree', 'remove', wtPath];
  if (force) args.push('--force');
  git(args, repoRoot);
}

export function pruneWorktrees(repoRoot: string): void {
  try {
    git(['worktree', 'prune'], repoRoot);
  } catch {
    // Non-fatal
  }
}

export function deleteBranch(repoRoot: string, branch: string, force = true): void {
  git(['branch', force ? '-D' : '-d', branch], repoRoot);
}

export function diffAgainst(cwd: string, fromSha: string): string {
  try {
    return execFileSync('git', ['diff', fromSha, 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err: any) {
    // git diff exits non-zero when there are differences; stdout still has the patch
    return (err.stdout as string | undefined) ?? '';
  }
}

export function diffStat(cwd: string, fromSha: string): string {
  try {
    return execFileSync('git', ['diff', '--stat', fromSha, 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err: any) {
    return (err.stdout as string | undefined)?.trim() ?? '';
  }
}

export function changedFiles(cwd: string, fromSha: string): string[] {
  try {
    const output = execFileSync('git', ['diff', '--name-only', fromSha, 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return output ? output.split('\n') : [];
  } catch {
    return [];
  }
}
