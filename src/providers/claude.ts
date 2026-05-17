import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ProviderAdapter, ProviderRunInput, SpawnSpec } from './types';

function buildClaudeMdBlock(input: ProviderRunInput): string {
  return [
    `<!-- agentlayer:start run=${path.basename(input.runDir)} -->`,
    `## Task`,
    ``,
    input.task,
    ``,
    `## Context`,
    ``,
    input.contextPacket,
    `<!-- agentlayer:end -->`,
  ].join('\n');
}

export const claudeAdapter: ProviderAdapter = {
  name: 'claude',

  async isAvailable(): Promise<boolean> {
    try {
      execFileSync('claude', ['--version'], { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },

  buildInvocation(input: ProviderRunInput): SpawnSpec {
    const claudeMdPath = path.join(input.worktreePath, 'CLAUDE.md');

    // Prepend our session block to CLAUDE.md — Claude reads this automatically
    // on startup. If a CLAUDE.md already exists we keep it below ours.
    const agentBlock = buildClaudeMdBlock(input);
    if (fs.existsSync(claudeMdPath)) {
      const existing = fs.readFileSync(claudeMdPath, 'utf-8').trimStart();
      fs.writeFileSync(claudeMdPath, agentBlock + '\n\n---\n\n' + existing, 'utf-8');
    } else {
      fs.writeFileSync(claudeMdPath, agentBlock + '\n', 'utf-8');
    }

    // approvalMode "never" → fully automated non-interactive run.
    // Pipe the full agent block (task + context) via stdin so the prompt is not
    // subject to shell argument-length limits and Claude receives full context.
    // Everything else → interactive: the developer steers Claude live.
    if (input.approvalMode === 'never') {
      return {
        cmd: 'claude',
        args: ['--print', '--dangerously-skip-permissions'],
        cwd: input.worktreePath,
        interactive: false,
        stdinData: agentBlock,
      };
    }

    return {
      cmd: 'claude',
      args: [],
      cwd: input.worktreePath,
      interactive: true,
    };
  },
};
