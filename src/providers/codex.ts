import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ProviderAdapter, ProviderRunInput, SpawnSpec } from './types';

export const codexAdapter: ProviderAdapter = {
  name: 'codex',

  async isAvailable(): Promise<boolean> {
    try {
      execFileSync('codex', ['--version'], {
        stdio: 'ignore',
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  },

  buildInvocation(input: ProviderRunInput): SpawnSpec {
    // Write context to AGENT_CONTEXT.md in the worktree.
    const contextPath = path.join(input.worktreePath, 'AGENT_CONTEXT.md');
    fs.writeFileSync(contextPath, input.contextPacket, 'utf-8');

    const args: string[] = [];

    // --full-auto skips all approval prompts. Only when approvalMode is "never".
    if (input.approvalMode === 'never') {
      args.push('--full-auto');
    }

    // Codex accepts the task as a positional argument.
    const prompt = [
      'Read AGENT_CONTEXT.md in the current directory for full context.',
      '',
      `Task: ${input.task}`,
    ].join('\n');

    args.push(prompt);

    return {
      cmd: 'codex',
      args,
      cwd: input.worktreePath,
    };
  },
};
