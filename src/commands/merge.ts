import pc from 'picocolors';
import {
  findRepoRoot,
  currentBranch,
  statusPorcelain,
  mergeBranch,
} from '../git/git-client';
import { resolveRunId, readRunRecord, updateRunRecord } from '../core/run-store';
import { now } from '../util/time';
import { info, success, warn, error, header, divider, kv } from '../util/output';

export interface MergeOptions {
  squash?: boolean;
  into?: string;
}

export async function mergeCommand(runIdArg: string, opts: MergeOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const runId = resolveRunId(repoRoot, runIdArg);
  const record = readRunRecord(repoRoot, runId);

  header(`Merge: ${runId}`);
  divider();

  // Guards
  if (record.status === 'rolled-back') {
    throw new Error(`Run ${runId} was rolled back — nothing to merge.`);
  }
  if (record.status === 'starting' || record.status === 'running') {
    throw new Error(`Run ${runId} is still in progress.`);
  }
  if (record.mergedAt) {
    warn(`Already merged into ${record.mergedInto} at ${record.mergedAt}`);
    return;
  }

  const targetBranch = opts.into ?? currentBranch(repoRoot);

  if (targetBranch === record.branchName) {
    throw new Error(`Cannot merge a run branch into itself. Check out a different branch first.`);
  }

  const dirty = statusPorcelain(repoRoot);
  if (dirty) {
    warn('Working tree has uncommitted changes. Merge may fail or produce unexpected results.');
    warn('Consider stashing first:  git stash');
  }

  kv('Branch', pc.cyan(record.branchName));
  kv('Into', pc.cyan(targetBranch));
  kv('Mode', opts.squash ? 'squash' : 'merge commit (--no-ff)');
  divider();

  info(`Merging ${record.branchName} → ${targetBranch}...`);
  try {
    mergeBranch(repoRoot, record.branchName, {
      squash: opts.squash,
      message: `Merge agentlayer run ${runId}: ${record.task}`,
    });
  } catch (err: any) {
    error(`Merge failed: ${err.message}`);
    info('Resolve conflicts, then commit manually, or run:');
    info(`  git merge --abort`);
    throw new Error('Merge failed — see above.');
  }

  const mergedAt = now();
  updateRunRecord(repoRoot, runId, { mergedAt, mergedInto: targetBranch });

  divider();
  success(`Merged into ${targetBranch}.`);

  if (opts.squash) {
    console.log('');
    warn('Squash merge staged but not committed. Run:');
    console.log(`  git commit -m "feat: ${record.task}"`);
  }

  console.log('');
  console.log('Next:');
  console.log(`  agentlayer clean ${runId}    # remove worktree, keep logs`);
  console.log(`  agentlayer rollback ${runId}  # remove worktree + branch`);
  console.log('');
}
