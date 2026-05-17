import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { findRepoRoot } from '../git/git-client';
import { resolveRunId, readRunRecord, updateRunRecord } from '../core/run-store';
import { runDir } from '../util/paths';
import { loadConfig } from '../config/load-config';
import { runChecks, type ChecksReport } from '../checks/check-runner';
import { info, success, error, header, divider } from '../util/output';

export interface CheckOptions {
  preset?: string;
  rerun?: boolean;
}

export async function checkCommand(runIdArg: string, opts: CheckOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const runId = resolveRunId(repoRoot, runIdArg);
  const record = readRunRecord(repoRoot, runId);
  const dir = runDir(repoRoot, runId);
  const cfg = loadConfig(repoRoot);

  const presetName = opts.preset ?? cfg.runtime.defaultCheckPreset;
  const preset = cfg.checks.presets[presetName];

  if (!preset) {
    throw new Error(
      `Check preset "${presetName}" not found. Available: ${Object.keys(cfg.checks.presets).join(', ')}`
    );
  }

  if (preset.commands.length === 0) {
    console.log(`\nNo commands in preset "${presetName}". Edit .agent/checks.yml to add commands.\n`);
    return;
  }

  // Show cached results if worktree is gone and --rerun not requested
  const worktreeExists = fs.existsSync(record.worktreePath);
  if (!worktreeExists && !opts.rerun) {
    const checksPath = path.join(dir, 'checks.json');
    if (fs.existsSync(checksPath)) {
      const report = JSON.parse(fs.readFileSync(checksPath, 'utf-8')) as ChecksReport;
      console.log('');
      info(`Showing cached check results for ${runId}`);
      divider();
      printReport(report);
      return;
    }
    throw new Error(
      `Worktree no longer exists and no cached results found.\n` +
      `Use --rerun to attempt checks anyway, or run "agentlayer check ${runId} --rerun" after restoring the worktree.`
    );
  }

  if (!worktreeExists) {
    throw new Error(`Worktree no longer exists: ${record.worktreePath}`);
  }

  header(`Checks: ${runId} (${presetName})`);
  divider();

  const report = await runChecks({
    preset: presetName,
    commands: preset.commands,
    cwd: record.worktreePath,
    timeout: preset.timeout,
    failFast: preset.failFast,
  });

  fs.writeFileSync(path.join(dir, 'checks.json'), JSON.stringify(report, null, 2), 'utf-8');
  updateRunRecord(repoRoot, runId, {
    checkStatus: report.ok ? 'passed' : 'failed',
  });

  divider();
  printReport(report);
}

function printReport(report: ChecksReport): void {
  for (const r of report.results) {
    const icon = r.passed ? pc.green('✓') : pc.red('✗');
    const dur = pc.dim(`(${r.durationMs}ms)`);
    console.log(`  ${icon} ${r.command} ${dur}`);
    if (!r.passed && r.output.trim()) {
      const excerpt = r.output.trim().split('\n').slice(0, 6).join('\n    ');
      console.log(pc.dim('    ' + excerpt));
    }
  }
  console.log('');
  if (report.ok) {
    success(report.results.length === 0 ? 'No checks configured.' : 'All checks passed.');
  } else {
    error('Some checks failed.');
  }
}
