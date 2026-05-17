import fs from 'node:fs';
import path from 'node:path';
import { findRepoRoot } from '../git/git-client';
import { resolveRunId, readRunRecord } from '../core/run-store';
import { runDir } from '../util/paths';

export interface LogsOptions {
  stderr?: boolean;
  events?: boolean;
  follow?: boolean;
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

  const logFile = opts.stderr
    ? path.join(dir, 'stderr.log')
    : path.join(dir, 'stdout.log');

  if (!fs.existsSync(logFile)) {
    console.log('No log file found yet — run may not have started.');
    return;
  }

  // Print existing content
  const existing = fs.readFileSync(logFile, 'utf-8');
  if (existing) process.stdout.write(existing);

  if (!opts.follow) return;

  // Check whether the run is still active before entering follow mode
  const record = readRunRecord(repoRoot, runId);
  if (record.status !== 'running' && record.status !== 'starting') {
    // Run is already done — nothing to tail
    return;
  }

  process.stderr.write(`\x1b[2m(following — Ctrl+C to stop)\x1b[0m\n`);

  // Poll for new content every 250ms until the run finishes
  let offset = Buffer.byteLength(existing, 'utf-8');

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      try {
        const stat = fs.statSync(logFile);
        if (stat.size > offset) {
          const buf = Buffer.alloc(stat.size - offset);
          const fd = fs.openSync(logFile, 'r');
          fs.readSync(fd, buf, 0, buf.length, offset);
          fs.closeSync(fd);
          process.stdout.write(buf);
          offset = stat.size;
        }
      } catch {
        // File may be briefly locked; retry next tick
      }

      // Stop when the run record is no longer active
      try {
        const current = readRunRecord(repoRoot, runId);
        if (current.status !== 'running' && current.status !== 'starting') {
          clearInterval(interval);
          resolve();
        }
      } catch {
        clearInterval(interval);
        resolve();
      }
    }, 250);
  });
}
