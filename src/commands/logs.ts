import fs from 'node:fs';
import path from 'node:path';
import { findRepoRoot } from '../git/git-client';
import { resolveRunId } from '../core/run-store';
import { runDir } from '../util/paths';

export interface LogsOptions {
  stderr?: boolean;
  events?: boolean;
}

export async function logsCommand(runIdArg: string, opts: LogsOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const runId = resolveRunId(repoRoot, runIdArg);
  const dir = runDir(repoRoot, runId);

  if (opts.events) {
    const eventsPath = path.join(dir, 'events.jsonl');
    if (fs.existsSync(eventsPath)) {
      process.stdout.write(fs.readFileSync(eventsPath, 'utf-8'));
    } else {
      console.log('No events log found.');
    }
    return;
  }

  if (opts.stderr) {
    const stderrPath = path.join(dir, 'stderr.log');
    if (fs.existsSync(stderrPath)) {
      process.stdout.write(fs.readFileSync(stderrPath, 'utf-8'));
    } else {
      console.log('No stderr log found.');
    }
    return;
  }

  const stdoutPath = path.join(dir, 'stdout.log');
  if (fs.existsSync(stdoutPath)) {
    process.stdout.write(fs.readFileSync(stdoutPath, 'utf-8'));
  } else {
    console.log('No stdout log found.');
  }
}
