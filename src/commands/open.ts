import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { findRepoRoot } from '../git/git-client';
import { resolveRunId, readRunRecord } from '../core/run-store';
import { info, success, warn, error, header, divider, kv } from '../util/output';
import pc from 'picocolors';

export interface OpenOptions {
  editor?: string;
}

export async function openCommand(runIdArg: string, opts: OpenOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const runId = resolveRunId(repoRoot, runIdArg);
  const record = readRunRecord(repoRoot, runId);

  header(`Open: ${runId}`);
  divider();

  if (!fs.existsSync(record.worktreePath)) {
    warn(`Worktree no longer exists: ${record.worktreePath}`);
    warn('The run may have been cleaned or rolled back.');
    info(`Run record and logs are still at .agent/runs/${runId}/`);
    return;
  }

  kv('Worktree', pc.cyan(record.worktreePath));
  kv('Branch', pc.dim(record.branchName));

  // Resolve editor: --editor flag → $VISUAL → $EDITOR → detected editors
  const editorCmd = opts.editor ?? process.env.VISUAL ?? process.env.EDITOR;

  if (editorCmd) {
    info(`Opening in ${editorCmd}...`);
    try {
      execFileSync(editorCmd, [record.worktreePath], { stdio: 'ignore' });
      success('Opened.');
    } catch (err: any) {
      error(`Could not open editor: ${err.message}`);
      info(`Open manually:  ${editorCmd} "${record.worktreePath}"`);
    }
    return;
  }

  // Auto-detect common editors
  const candidates = [
    { cmd: 'code', label: 'VS Code' },
    { cmd: 'cursor', label: 'Cursor' },
    { cmd: 'windsurf', label: 'Windsurf' },
    { cmd: 'idea', label: 'IntelliJ' },
    { cmd: 'zed', label: 'Zed' },
  ];

  for (const { cmd, label } of candidates) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'ignore', timeout: 3000 });
      info(`Opening in ${label}...`);
      execFileSync(cmd, [record.worktreePath], { stdio: 'ignore' });
      success('Opened.');
      return;
    } catch {
      // Not available
    }
  }

  // No editor found — print the path so the developer can open it themselves
  warn('No editor detected on PATH (checked: code, cursor, windsurf, idea, zed).');
  console.log('');
  console.log('Open manually:');
  console.log(`  cd "${record.worktreePath}"`);
  console.log('');
  console.log('Or set your editor:');
  console.log('  export EDITOR=code   # then rerun agentlayer open');
}
