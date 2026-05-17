import { findRepoRoot } from '../git/git-client';
import { resolveRunId, readRunRecord } from '../core/run-store';
import { runCommand } from './run';
import type { RunOptions } from './run';
import { info, header, divider, kv } from '../util/output';

export interface RerunOptions {
  provider?: string;
  checks?: string;
  approve?: string;
  base?: string;
  task?: string;
}

export async function rerunCommand(runIdArg: string, opts: RerunOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const runId = resolveRunId(repoRoot, runIdArg);
  const record = readRunRecord(repoRoot, runId);

  const task = opts.task ?? record.task;

  header(`Rerun: ${runId}`);
  kv('Original run', runId);
  kv('Task', task);
  if (opts.task) kv('Task override', '(from --task flag)');
  divider();

  info('Starting new run with same task...');

  const runOpts: RunOptions = {
    provider: opts.provider ?? record.provider,
    checks: opts.checks,
    approve: opts.approve,
    base: opts.base ?? record.baseBranch,
  };

  await runCommand(task, runOpts);
}
