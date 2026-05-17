import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { memoryDir } from '../util/paths';
import type { PermissionsConfig } from '../config/schemas';

export interface ContextPacket {
  task: string;
  memory: Record<string, string>;
  relevantFiles: string[];
  gitStatus: string;
  permissionsSummary: string;
  checkCommands: string[];
}

export function buildContextPacket(opts: {
  repoRoot: string;
  task: string;
  gitStatus: string;
  permissions: PermissionsConfig;
  checkCommands: string[];
}): ContextPacket {
  const memory = loadMemoryDocs(opts.repoRoot);
  const relevantFiles = findRelevantFiles(opts.repoRoot, opts.task);

  return {
    task: opts.task,
    memory,
    relevantFiles,
    gitStatus: opts.gitStatus,
    permissionsSummary: buildPermissionsSummary(opts.permissions),
    checkCommands: opts.checkCommands,
  };
}

function loadMemoryDocs(repoRoot: string): Record<string, string> {
  const dir = memoryDir(repoRoot);
  if (!fs.existsSync(dir)) return {};

  const memory: Record<string, string> = {};
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8').trim();
    if (content) {
      memory[file.replace('.md', '')] = content;
    }
  }

  return memory;
}

function findRelevantFiles(repoRoot: string, task: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
    'with', 'this', 'that', 'fix', 'add', 'update', 'change', 'make',
    'get', 'set', 'remove', 'delete', 'all', 'any', 'from', 'into',
  ]);

  const keywords = task
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (keywords.length === 0) return [];

  try {
    const pattern = keywords.slice(0, 6).join('|');
    const output = execFileSync(
      'git',
      ['grep', '-l', '-i', '-E', pattern],
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      }
    ).trim();

    return output ? output.split('\n').slice(0, 12) : [];
  } catch {
    return [];
  }
}

function buildPermissionsSummary(permissions: PermissionsConfig): string {
  const lines: string[] = [];

  if (permissions.deniedPaths.length > 0) {
    lines.push(`Never modify these paths: ${permissions.deniedPaths.join(', ')}`);
  }
  if (permissions.deniedCommands.length > 0) {
    lines.push(`Never run these commands: ${permissions.deniedCommands.join(', ')}`);
  }
  if (permissions.allowedPaths.length > 0) {
    lines.push(`Only modify files under: ${permissions.allowedPaths.join(', ')}`);
  }

  return lines.join('\n') || 'No additional constraints.';
}

export function renderContextPacket(packet: ContextPacket): string {
  const sections: string[] = [];

  sections.push(`## Task\n\n${packet.task}`);

  const memoryEntries = Object.entries(packet.memory);
  if (memoryEntries.length > 0) {
    for (const [name, content] of memoryEntries) {
      sections.push(`## Repo Memory: ${name}\n\n${content}`);
    }
  }

  if (packet.relevantFiles.length > 0) {
    sections.push(
      `## Potentially Relevant Files\n\n${packet.relevantFiles.join('\n')}`
    );
  }

  sections.push(
    `## Git Status\n\n${packet.gitStatus || 'Working tree is clean.'}`
  );

  sections.push(`## Constraints\n\n${packet.permissionsSummary}`);

  if (packet.checkCommands.length > 0) {
    sections.push(
      `## Checks to Pass Before Handoff\n\n${packet.checkCommands.join('\n')}`
    );
  }

  return sections.join('\n\n---\n\n');
}
