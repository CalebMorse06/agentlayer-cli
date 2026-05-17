export class AgentLayerError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'AgentLayerError';
  }
}

export class NotGitRepoError extends AgentLayerError {
  constructor(dir: string) {
    super(`Not a Git repository: ${dir}`, 'NOT_GIT_REPO');
  }
}

export class ConfigNotFoundError extends AgentLayerError {
  constructor(dir: string) {
    super(`AgentLayer not initialized in ${dir}. Run: agentlayer init`, 'CONFIG_NOT_FOUND');
  }
}

export class ProviderNotFoundError extends AgentLayerError {
  constructor(provider: string) {
    super(
      `Provider CLI not found: "${provider}". Install it and make sure it is on PATH.`,
      'PROVIDER_NOT_FOUND'
    );
  }
}

export class RunNotFoundError extends AgentLayerError {
  constructor(runId: string) {
    super(`Run not found: ${runId}`, 'RUN_NOT_FOUND');
  }
}
