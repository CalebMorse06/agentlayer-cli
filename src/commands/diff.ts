import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findRepoRoot } from '../git/git-client';
import { resolveRunId, readRunRecord } from '../core/run-store';
import { runDir } from '../util/paths';

export interface DiffOptions {
  stat?: boolean;
  nameOnly?: boolean;
}

export async function diffCommand(runIdArg: string, opts: DiffOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const runId = resolveRunId(repoRoot, runIdArg);
  const record = readRunRecord(repoRoot, runId);
  const dir = runDir(repoRoot, runId);
  const patchPath = path.join(dir, 'diff.patch');

  // If worktree still exists, re-run the diff live for stat/name-only views
  if ((opts.stat || opts.nameOnly) && fs.existsSync(record.worktreePath)) {
    try {
      const args = ['diff'];
      if (opts.stat) args.push('--stat');
      if (opts.nameOnly) args.push('--name-only');
      args.push(record.startSha, 'HEAD');

      const output = execFileSync('git', args, {
        cwd: record.worktreePath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      process.stdout.write(output);
      return;
    } catch {
      // Fall through to saved patch
    }
  }

  if (!fs.existsSync(patchPath)) {
    console.log('No diff patch saved for this run.');
    return;
  }

  if (opts.nameOnly) {
    const patch = fs.readFileSync(patchPath, 'utf-8');
    const files = [...patch.matchAll(/^diff --git a\/.+ b\/(.+)$/gm)].map((m) => m[1]);
    console.log(files.join('\n'));
    return;
  }

  // Default: stream the full patch
  process.stdout.write(fs.readFileSync(patchPath, 'utf-8'));
}
