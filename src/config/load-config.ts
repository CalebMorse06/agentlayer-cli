import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { RuntimeSchema, PermissionsSchema, ChecksSchema } from './schemas';
import type { AgentLayerConfig } from './schemas';
import { agentDir } from '../util/paths';
import { ConfigNotFoundError } from '../util/errors';

export function loadConfig(repoRoot: string): AgentLayerConfig {
  const dir = agentDir(repoRoot);

  if (!fs.existsSync(dir)) {
    throw new ConfigNotFoundError(repoRoot);
  }

  function readYaml(filename: string): unknown {
    const filePath = path.join(dir, filename);
    return fs.existsSync(filePath)
      ? parseYaml(fs.readFileSync(filePath, 'utf-8'))
      : {};
  }

  const runtimeRaw = readYaml('runtime.yml');
  const permissionsRaw = readYaml('permissions.yml');
  const checksRaw = readYaml('checks.yml');

  const runtimeResult = RuntimeSchema.safeParse(runtimeRaw);
  if (!runtimeResult.success) {
    throw new Error(`Invalid runtime.yml: ${runtimeResult.error.message}`);
  }

  const permissionsResult = PermissionsSchema.safeParse(permissionsRaw);
  if (!permissionsResult.success) {
    throw new Error(`Invalid permissions.yml: ${permissionsResult.error.message}`);
  }

  const checksResult = ChecksSchema.safeParse(checksRaw);
  if (!checksResult.success) {
    throw new Error(`Invalid checks.yml: ${checksResult.error.message}`);
  }

  return {
    runtime: runtimeResult.data,
    permissions: permissionsResult.data,
    checks: checksResult.data,
  };
}
