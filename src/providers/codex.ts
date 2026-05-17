import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ProviderAdapter, ProviderRunInput, SpawnSpec } from './types';

export const codexAdapter: ProviderAdapter = {
  name: 'codex',

  async isAvailable(): Promise<boolean> {
    try {
      execFileSync('codex', ['--version'], { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },

  buildInvocation(input: ProviderRunInput): SpawnSpec {
    // Write context to AGENT_CONTEXT.md — Codex will be told to read it.
    const contextPath = path.join(input.worktreePath, 'AGENT_CONTEXT.md');
    fs.writeFileSync(contextPath, input.contextPacket, 'utf-8');

    if (input.approvalMode === 'never') {
      return {
        cmd: 'codex',
        args: ['--full-auto', `Read AGENT_CONTEXT.md for context. Task: ${input.task}`],
        cwd: input.worktreePath,
        interactive: false,
      };
    }

    // Interactive: codex starts a session; user steers it.
    return {
      cmd: 'codex',
      args: [`Read AGENT_CONTEXT.md for context. Task: ${input.task}`],
      cwd: input.worktreePath,
      interactive: true,
    };
  },
};
