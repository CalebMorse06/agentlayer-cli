import pc from 'picocolors';
import { findRepoRoot } from '../git/git-client';
import { listRunRecords } from '../core/run-store';
import { formatDuration } from '../util/time';

export interface ListOptions {
  json?: boolean;
  status?: string;
}

export async function listCommand(opts: ListOptions = {}): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  let records = listRunRecords(repoRoot);

  if (opts.status) {
    const filter = opts.status.toLowerCase();
    records = records.filter((r) => r.status === filter);
  }

  if (opts.json) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }

  if (records.length === 0) {
    if (opts.status) {
      console.log(`\nNo runs with status "${opts.status}".\n`);
    } else {
      console.log('\nNo runs yet.\n');
      console.log('Start one:  agentlayer run "your task" --provider claude\n');
    }
    return;
  }

  console.log('');
  const header = [
    '  ' + 'ID'.padEnd(24),
    'PROVIDER'.padEnd(9),
    'STATUS'.padEnd(12),
    'AGE'.padEnd(8),
    'BRANCH',
  ].join(' ');
  console.log(pc.bold(header));
  console.log('  ' + pc.dim('─'.repeat(76)));

  for (const r of records) {
    const statusColor =
      r.status === 'completed' ? pc.green :
      r.status === 'failed' ? pc.red :
      r.status === 'running' ? pc.yellow :
      pc.dim;

    const age = r.finishedAt
      ? pc.dim(formatDuration(r.startedAt, r.finishedAt))
      : pc.yellow('active');

    const cols = [
      '  ' + r.id.padEnd(24),
      r.provider.padEnd(9),
      statusColor(r.status.padEnd(12)),
      age.padEnd(8),
      pc.dim(r.branchName),
    ];

    console.log(cols.join(' '));
  }

  console.log('');
}
