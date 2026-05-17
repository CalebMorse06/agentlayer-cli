import { z } from 'zod';

export const RuntimeSchema = z.object({
  version: z.string().default('1'),
  providers: z
    .object({
      claude: z.object({ enabled: z.boolean().default(true) }).default({}),
      codex: z.object({ enabled: z.boolean().default(true) }).default({}),
    })
    .default({}),
  worktreeRoot: z.string().default('.agent/worktrees'),
  branchPrefix: z.string().default('agent/'),
  backend: z.enum(['host', 'devcontainer']).default('host'),
  defaultProvider: z.enum(['claude', 'codex']).default('claude'),
  defaultCheckPreset: z.string().default('default'),
});

export type RuntimeConfig = z.infer<typeof RuntimeSchema>;

export const PermissionsSchema = z.object({
  version: z.string().default('1'),
  approvalMode: z.enum(['manual', 'on-request', 'never']).default('on-request'),
  allowedPaths: z.array(z.string()).default([]),
  deniedPaths: z
    .array(z.string())
    .default(['.env', '.env.*', '*.pem', '*.key', 'secrets/**']),
  allowedCommands: z.array(z.string()).default([]),
  deniedCommands: z.array(z.string()).default([]),
  networkMode: z.enum(['allow', 'deny', 'prompt']).default('allow'),
});

export type PermissionsConfig = z.infer<typeof PermissionsSchema>;

const CheckPresetSchema = z.object({
  commands: z.array(z.string()).default([]),
  timeout: z.number().default(120),
  failFast: z.boolean().default(false),
});

export type CheckPreset = z.infer<typeof CheckPresetSchema>;

export const ChecksSchema = z.object({
  version: z.string().default('1'),
  presets: z
    .record(z.string(), CheckPresetSchema)
    .default({
      quick: { commands: [], timeout: 60, failFast: true },
      default: { commands: [], timeout: 120, failFast: false },
      full: { commands: [], timeout: 300, failFast: false },
    }),
});

export type ChecksConfig = z.infer<typeof ChecksSchema>;

export interface AgentLayerConfig {
  runtime: RuntimeConfig;
  permissions: PermissionsConfig;
  checks: ChecksConfig;
}
