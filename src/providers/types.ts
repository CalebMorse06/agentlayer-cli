export type ProviderName = 'claude' | 'codex';

export interface SpawnSpec {
  cmd: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export interface ProviderRunInput {
  task: string;
  contextPacket: string;
  worktreePath: string;
  runDir: string;
  approvalMode: string;
}

export interface ProviderAdapter {
  name: ProviderName;
  isAvailable(): Promise<boolean>;
  buildInvocation(input: ProviderRunInput): SpawnSpec;
}
