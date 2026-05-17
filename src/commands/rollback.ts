import fs from 'node:fs';
import { findRepoRoot, listWorktrees, removeWorktree, deleteBranch } from '../git/git-client';
import { resolveRunId, readRunRecord, updateRunRecord } from '../core/run-store';
import { info, success, warn, error, header, divider } from '../util/output';

export interface RollbackOptions {
  force?: boolean;
}

export async function rollbackCommand(runIdArg: string, opts: RollbackOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const runId = resolveRunId(repoRoot, runIdArg);
  const record = readRunRecord(repoRoot, runId);

  header(`Rollback: ${runId}`);
  divider();

  if (record.status === 'rolled-back') {
    warn('This run has already been rolled back.');
    return;
  }

  // Remove worktree
  const worktrees = listWorktrees(repoRoot);
  const normalise = (p: string) => p.replace(/\\/g, '/').toLowerCase();
  const wt = worktrees.find(
    (w) => normalise(w.path) === normalise(record.worktreePath)
  );

  if (wt) {
    info(`Removing worktree: ${record.worktreePath}`);
    try {
      removeWorktree(repoRoot, record.worktreePath, opts.force ?? false);
      success('Worktree removed.');
    } catch (err: any) {
      if (opts.force) {
        try {
          fs.rmSync(record.worktreePath, { recursive: true, force: true });
          success('Worktree directory removed (forced).');
        } catch {
          error(`Could not remove worktree directory: ${err.message}`);
        }
      } else {
        error(`Could not remove worktree: ${err.message}`);
        info(`Retry with --force:  agentlayer rollback --force ${runId}`);
        return;
      }
    }
  } else {
    warn('Worktree not found in git — may already be removed.');
  }

  // Delete local branch
  info(`Deleting branch: ${record.branchName}`);
  try {
    deleteBranch(repoRoot, record.branchName);
    success('Branch deleted.');
  } catch (err: any) {
    warn(`Could not delete branch: ${err.message}`);
  }

  updateRunRecord(repoRoot, runId, { status: 'rolled-back' });

  divider();
  success(`Run ${runId} rolled back.`);
  info(`Artifacts preserved at .agent/runs/${runId}/`);
}
