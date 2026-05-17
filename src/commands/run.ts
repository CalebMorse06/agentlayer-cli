import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import pc from 'picocolors';

import {
  findRepoRoot,
  revParse,
  currentBranch,
  defaultBranch,
  statusPorcelain,
  addWorktree,
  diffAgainst,
  diffStat,
  changedFiles,
} from '../git/git-client';
import { loadConfig } from '../config/load-config';
import { createRunId } from '../util/ids';
import { worktreePath as buildWorktreePath, runDir } from '../util/paths';
import { writeRunRecord, updateRunRecord } from '../core/run-store';
import { appendJsonl } from '../core/artifact-writer';
import { buildContextPacket, renderContextPacket } from '../context/packet-builder';
import { claudeAdapter } from '../providers/claude';
import { codexAdapter } from '../providers/codex';
import type { ProviderAdapter, ProviderName } from '../providers/types';
import { runChecks } from '../checks/check-runner';
import { now } from '../util/time';
import { info, success, error, warn, header, divider, kv } from '../util/output';

const adapters: Record<ProviderName, ProviderAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
};

export interface RunOptions {
  provider?: string;
  checks?: string;
  approve?: string;
  base?: string;
}

export async function runCommand(task: string, opts: RunOptions): Promise<void> {
  // 1. Repo root + config
  const repoRoot = findRepoRoot(process.cwd());
  const cfg = loadConfig(repoRoot);

  const providerName = (opts.provider ?? cfg.runtime.defaultProvider) as ProviderName;
  const adapter = adapters[providerName];
  if (!adapter) {
    throw new Error(`Unknown provider: "${providerName}". Supported: claude, codex`);
  }

  header('AgentLayer Run');
  kv('Provider', providerName);
  kv('Task', task);
  divider();

  if (!await adapter.isAvailable()) {
    throw new Error(
      `"${providerName}" CLI not found on PATH.\n` +
      `  Claude Code: https://claude.ai/code\n` +
      `  Codex CLI:   https://github.com/openai/codex`
    );
  }

  // 2. Capture start state
  const startSha = revParse('HEAD', repoRoot);
  const baseBranch = opts.base ?? (() => {
    try { return defaultBranch(repoRoot); } catch { return currentBranch(repoRoot); }
  })();
  const gitStatus = statusPorcelain(repoRoot);

  if (gitStatus) {
    warn('Repo has uncommitted changes. The worktree branches from HEAD (committed state).');
  }

  // 3. Create run identity
  const runId = createRunId();
  const branchName = `${cfg.runtime.branchPrefix}${runId.replace(/^run-/, '')}`;
  const wtPath = buildWorktreePath(repoRoot, runId);
  const rDir = runDir(repoRoot, runId);

  kv('Run ID', runId);
  kv('Branch', branchName);
  kv('Worktree', wtPath);
  divider();

  // 4. Create run dir and initial record
  fs.mkdirSync(rDir, { recursive: true });
  writeRunRecord(repoRoot, {
    id: runId,
    provider: providerName,
    task,
    status: 'starting',
    repoRoot,
    worktreePath: wtPath,
    branchName,
    baseBranch,
    startSha,
    startedAt: now(),
  });

  const eventsPath = path.join(rDir, 'events.jsonl');
  appendJsonl(eventsPath, { t: now(), type: 'run.created', runId, provider: providerName, task });

  // 5. Create worktree
  info('Creating Git worktree...');
  addWorktree(repoRoot, wtPath, branchName, startSha);
  appendJsonl(eventsPath, { t: now(), type: 'worktree.created', path: wtPath, branch: branchName });
  updateRunRecord(repoRoot, runId, { status: 'running' });

  // 6. Build context packet
  const presetName = opts.checks ?? cfg.runtime.defaultCheckPreset;
  const checkCommands = cfg.checks.presets[presetName]?.commands ?? [];

  const packet = buildContextPacket({
    repoRoot,
    task,
    gitStatus,
    permissions: cfg.permissions,
    checkCommands,
  });

  const contextText = renderContextPacket(packet);
  const instructionText = `# Task\n\n${task}\n`;

  fs.writeFileSync(path.join(rDir, 'instruction.md'), instructionText, 'utf-8');
  fs.writeFileSync(path.join(rDir, 'context.md'), contextText, 'utf-8');
  fs.writeFileSync(
    path.join(rDir, 'selected-memory.json'),
    JSON.stringify(packet.memory, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(rDir, 'relevant-files.json'),
    JSON.stringify(packet.relevantFiles, null, 2),
    'utf-8'
  );

  // 7. Build provider invocation
  const approvalMode = opts.approve ?? cfg.permissions.approvalMode;
  const spawnSpec = adapter.buildInvocation({
    task,
    contextPacket: contextText,
    worktreePath: wtPath,
    runDir: rDir,
    approvalMode,
  });

  appendJsonl(eventsPath, { t: now(), type: 'provider.starting', cmd: spawnSpec.cmd, interactive: spawnSpec.interactive });

  // 8. Spawn provider
  let exitCode: number;

  if (spawnSpec.interactive) {
    // Interactive mode: hand full control of the terminal to the agent.
    // The developer steers the session live. We capture artifacts after exit.
    info(`Launching ${providerName} interactively in the worktree.`);
    info(`Worktree: ${pc.cyan(wtPath)}`);
    divider();

    const child = spawn(spawnSpec.cmd, spawnSpec.args, {
      cwd: spawnSpec.cwd ?? wtPath,
      env: { ...process.env, ...(spawnSpec.env ?? {}) },
      stdio: 'inherit',
    });

    exitCode = await new Promise<number>((resolve) => {
      child.on('close', (code) => resolve(code ?? 0));
      child.on('error', (err) => {
        error(`Failed to launch ${providerName}: ${err.message}`);
        resolve(1);
      });
    });

    // Note in the log that this was an interactive session
    fs.writeFileSync(
      path.join(rDir, 'stdout.log'),
      `(Interactive ${providerName} session — see diff.patch for what changed)\n`,
      'utf-8'
    );
    fs.writeFileSync(path.join(rDir, 'stderr.log'), '', 'utf-8');
  } else {
    // Non-interactive mode: pipe stdout/stderr to terminal and log files simultaneously.
    info(`Launching ${providerName} (non-interactive)...`);
    divider();

    const stdoutLog = fs.createWriteStream(path.join(rDir, 'stdout.log'));
    const stderrLog = fs.createWriteStream(path.join(rDir, 'stderr.log'));

    const child = spawn(spawnSpec.cmd, spawnSpec.args, {
      cwd: spawnSpec.cwd ?? wtPath,
      env: { ...process.env, ...(spawnSpec.env ?? {}) },
      stdio: [spawnSpec.stdinData ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    if (spawnSpec.stdinData) {
      child.stdin?.write(spawnSpec.stdinData, 'utf-8');
      child.stdin?.end();
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutLog.write(chunk);
      process.stdout.write(chunk);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrLog.write(chunk);
      process.stderr.write(chunk);
    });

    exitCode = await new Promise<number>((resolve) => {
      child.on('close', (code) => resolve(code ?? 0));
      child.on('error', (err) => {
        error(`Failed to launch ${providerName}: ${err.message}`);
        resolve(1);
      });
    });

    stdoutLog.end();
    stderrLog.end();
  }

  divider();
  appendJsonl(eventsPath, { t: now(), type: 'provider.finished', exitCode });

  // 9. Capture diff artifacts
  const patch = diffAgainst(wtPath, startSha);
  const stat = diffStat(wtPath, startSha);
  const files = changedFiles(wtPath, startSha);

  fs.writeFileSync(path.join(rDir, 'diff.patch'), patch, 'utf-8');

  // 10. Run checks if commands are configured
  const checksPreset = cfg.checks.presets[presetName];
  let checksReport = {
    ok: true,
    preset: presetName,
    results: [] as any[],
    ranAt: now(),
  };

  if (checkCommands.length > 0) {
    info(`Running checks (${presetName})...`);
    checksReport = await runChecks({
      preset: presetName,
      commands: checkCommands,
      cwd: wtPath,
      timeout: checksPreset?.timeout ?? 120,
      failFast: checksPreset?.failFast ?? false,
    });

    for (const r of checksReport.results) {
      const icon = r.passed ? pc.green('✓') : pc.red('✗');
      console.log(`  ${icon} ${r.command}`);
    }
  }

  fs.writeFileSync(path.join(rDir, 'checks.json'), JSON.stringify(checksReport, null, 2), 'utf-8');

  // 11. Write human-readable summary and handoff
  const runStatus = exitCode === 0 ? 'completed' : 'failed';
  const checksStatus =
    checkCommands.length === 0 ? 'skipped' : checksReport.ok ? 'passed' : 'failed';

  const summaryLines = [
    `# Run Summary: ${runId}`,
    '',
    `**Task:** ${task}`,
    `**Provider:** ${providerName}`,
    `**Status:** ${runStatus}`,
    `**Exit code:** ${exitCode}`,
    `**Branch:** ${branchName}`,
    `**Start SHA:** ${startSha}`,
    '',
    '## Changes',
    '',
    stat || 'No changes detected.',
    '',
    '## Checks',
    '',
    checkCommands.length === 0
      ? 'No checks configured. Edit `.agent/checks.yml` to add commands.'
      : checksReport.results.map((r: any) => `- ${r.passed ? '✓' : '✗'} \`${r.command}\``).join('\n'),
  ];

  const handoffLines = [
    `# Handoff: ${runId}`,
    '',
    `**Task:** ${task}`,
    `**Status:** ${runStatus}`,
    '',
    '## What Changed',
    '',
    stat || 'No changes.',
    '',
    '## Files Modified',
    '',
    files.length > 0 ? files.map((f) => `- \`${f}\``).join('\n') : 'None.',
    '',
    '## Review Commands',
    '',
    `\`\`\``,
    `agentlayer diff ${runId}`,
    `agentlayer check ${runId}`,
    `git -C ${wtPath} log --oneline`,
    `agentlayer rollback ${runId}   # discard if not needed`,
    `\`\`\``,
  ];

  fs.writeFileSync(path.join(rDir, 'summary.md'), summaryLines.join('\n'), 'utf-8');
  fs.writeFileSync(path.join(rDir, 'handoff.md'), handoffLines.join('\n'), 'utf-8');
  appendJsonl(eventsPath, { t: now(), type: 'artifacts.written' });

  // 12. Finalize run record
  updateRunRecord(repoRoot, runId, {
    status: runStatus,
    exitCode,
    finishedAt: now(),
    changedFilesCount: files.length,
    checkStatus: checksStatus as any,
  });

  appendJsonl(eventsPath, { t: now(), type: 'run.finished', status: runStatus });

  // 13. Print result
  divider();
  if (exitCode === 0) {
    success(`Run completed: ${runId}`);
  } else {
    error(`Run finished with errors (exit ${exitCode}): ${runId}`);
  }

  console.log('');
  kv('Branch', pc.cyan(branchName));
  kv('Worktree', pc.dim(wtPath));
  kv('Changes', files.length > 0 ? pc.yellow(`${files.length} file(s)`) : pc.dim('none'));
  kv('Checks', checksStatus === 'passed' ? pc.green('passed') : checksStatus === 'failed' ? pc.red('failed') : pc.dim('skipped'));
  console.log('');
  console.log('Next:');
  console.log(`  agentlayer diff ${runId}`);
  console.log(`  agentlayer summary ${runId}`);
  console.log(`  agentlayer check ${runId}`);
  console.log(`  agentlayer rollback ${runId}   # discard`);
  console.log('');
}
