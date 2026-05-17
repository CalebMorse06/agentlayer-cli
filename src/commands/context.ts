import { findRepoRoot, statusPorcelain } from '../git/git-client';
import { loadConfig } from '../config/load-config';
import { buildContextPacket, renderContextPacket } from '../context/packet-builder';
import { ConfigNotFoundError } from '../util/errors';
import { agentDir } from '../util/paths';
import fs from 'node:fs';

export interface ContextOptions {
  provider?: string;
  checks?: string;
}

export async function contextCommand(task: string, opts: ContextOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());

  const dir = agentDir(repoRoot);
  if (!fs.existsSync(dir)) {
    throw new ConfigNotFoundError(repoRoot);
  }

  const cfg = loadConfig(repoRoot);
  const presetName = opts.checks ?? cfg.runtime.defaultCheckPreset;
  const checkCommands = cfg.checks.presets[presetName]?.commands ?? [];
  const gitStatus = statusPorcelain(repoRoot);

  const packet = buildContextPacket({
    repoRoot,
    task,
    gitStatus,
    permissions: cfg.permissions,
    checkCommands,
  });

  const contextText = renderContextPacket(packet);

  // Summary header
  const memKeys = Object.keys(packet.memory);
  console.log('');
  console.log('\x1b[1mContext packet preview\x1b[0m');
  console.log(`  Task:           ${task}`);
  console.log(`  Memory docs:    ${memKeys.length > 0 ? memKeys.join(', ') : '(none)'}`);
  console.log(`  Relevant files: ${packet.relevantFiles.length}`);
  console.log(`  Check commands: ${checkCommands.length}`);
  console.log(`  Total size:     ~${Math.round(contextText.length / 1024)}KB`);
  console.log('');
  console.log('─'.repeat(60));
  console.log('');
  console.log(contextText);
  console.log('');
}
