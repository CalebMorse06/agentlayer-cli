import fs from 'node:fs';
import path from 'node:path';
import {
  findRepoRoot,
  listWorktrees,
  removeWorktree,
  pruneWorktrees,
} from '../git/git-client';
import { resolveRunId, readRunRecord, updateRunRecord } from '../core/run-store';
import { runDir } from '../util/paths';
import { info, success, warn, header, divider } from '../util/output';

export interface CleanOptions {
  keepLogs?: boolean;
}

export async function cleanCommand(runIdArg: string, opts: CleanOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const runId = resolveRunId(repoRoot, runIdArg);
  const record = readRunRecord(repoRoot, runId);
  const dir = runDir(repoRoot, runId);

  header(`Clean: ${runId}`);
  divider();

  // Remove worktree if it still exists
  const worktrees = listWorktrees(repoRoot);
  const normalise = (p: string) => p.replace(/\\/g, '/').toLowerCase();
  const wt = worktrees.find(
    (w) => normalise(w.path) === normalise(record.worktreePath)
  );

  if (wt) {
    info(`Removing worktree: ${record.worktreePath}`);
    try {
      removeWorktree(repoRoot, record.worktreePath, true);
      success('Worktree removed.');
    } catch {
      try {
        fs.rmSync(record.worktreePath, { recursive: true, force: true });
        success('Worktree directory removed.');
      } catch (err: any) {
        warn(`Could not remove worktree: ${err.message}`);
      }
    }
  } else {
    info('Worktree already removed.');
  }

  pruneWorktrees(repoRoot);

  // Remove intermediate artifacts; keep the run record, diff, logs, and summary
  const tempFiles = ['selected-memory.json', 'relevant-files.json', 'AGENT_CONTEXT.md'];
  for (const f of tempFiles) {
    const fp = path.join(dir, f);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
    }
  }

  if (opts.keepLogs === false) {
    for (const f of ['stdout.log', 'stderr.log']) {
      const fp = path.join(dir, f);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  }

  updateRunRecord(repoRoot, runId, { status: 'cleaned' });

  divider();
  success(`Run ${runId} cleaned.`);
  info(`Run record and summary preserved at .agent/runs/${runId}/`);
}
