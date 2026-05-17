import { execSync } from 'node:child_process';
import { now } from '../util/time';

export interface CheckResult {
  command: string;
  passed: boolean;
  exitCode: number;
  output: string;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
}

export interface ChecksReport {
  ok: boolean;
  preset: string;
  results: CheckResult[];
  ranAt: string;
}

export async function runChecks(opts: {
  preset: string;
  commands: string[];
  cwd: string;
  timeout: number;
  failFast: boolean;
}): Promise<ChecksReport> {
  const results: CheckResult[] = [];

  for (const cmd of opts.commands) {
    const startedAt = now();
    const wallStart = Date.now();

    let passed = false;
    let exitCode = 0;
    let output = '';

    try {
      const stdout = execSync(cmd, {
        cwd: opts.cwd,
        encoding: 'utf-8',
        timeout: opts.timeout * 1000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      output = stdout;
      passed = true;
      exitCode = 0;
    } catch (err: any) {
      passed = false;
      exitCode = (err.status as number | undefined) ?? 1;
      const stdout = (err.stdout as string | undefined) ?? '';
      const stderr = (err.stderr as string | undefined) ?? '';
      output = stdout + (stderr ? '\n' + stderr : '');
    }

    const finishedAt = now();
    const durationMs = Date.now() - wallStart;

    results.push({
      command: cmd,
      passed,
      exitCode,
      output: output.slice(0, 4096),
      durationMs,
      startedAt,
      finishedAt,
    });

    if (!passed && opts.failFast) break;
  }

  return {
    ok: results.length === 0 || results.every((r) => r.passed),
    preset: opts.preset,
    results,
    ranAt: now(),
  };
}
