import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ProviderAdapter, ProviderRunInput, SpawnSpec } from './types';

export const claudeAdapter: ProviderAdapter = {
  name: 'claude',

  async isAvailable(): Promise<boolean> {
    try {
      execFileSync('claude', ['--version'], {
        stdio: 'ignore',
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  },

  buildInvocation(input: ProviderRunInput): SpawnSpec {
    // Write context to a file in the worktree root so Claude can reference it.
    // Claude Code already reads CLAUDE.md; we write our context there.
    const claudeMdPath = path.join(input.worktreePath, 'AGENT_CONTEXT.md');
    fs.writeFileSync(claudeMdPath, input.contextPacket, 'utf-8');

    // Claude Code non-interactive invocation via --print flag.
    // The prompt references the context file and states the task.
    const prompt = [
      'Read AGENT_CONTEXT.md in the current directory for full context.',
      '',
      `Task: ${input.task}`,
    ].join('\n');

    const args: string[] = ['--print'];

    // --dangerously-skip-permissions lets the agent run without approval prompts.
    // Only enabled when the user has explicitly set approvalMode: "never".
    if (input.approvalMode === 'never') {
      args.push('--dangerously-skip-permissions');
    }

    args.push(prompt);

    return {
      cmd: 'claude',
      args,
      cwd: input.worktreePath,
    };
  },
};
