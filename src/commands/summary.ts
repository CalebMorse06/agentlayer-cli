import fs from 'node:fs';
import path from 'node:path';
import { findRepoRoot } from '../git/git-client';
import { resolveRunId } from '../core/run-store';
import { runDir } from '../util/paths';

export interface SummaryOptions {
  handoff?: boolean;
}

export async function summaryCommand(runIdArg: string, opts: SummaryOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const runId = resolveRunId(repoRoot, runIdArg);
  const dir = runDir(repoRoot, runId);

  const filename = opts.handoff ? 'handoff.md' : 'summary.md';
  const filePath = path.join(dir, filename);

  if (!fs.existsSync(filePath)) {
    console.log(`No ${filename} found for run ${runId}.`);
    return;
  }

  process.stdout.write(fs.readFileSync(filePath, 'utf-8'));
  console.log('');
}
