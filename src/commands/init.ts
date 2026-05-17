import fs from 'node:fs';
import path from 'node:path';
import { findRepoRoot } from '../git/git-client';
import { agentDir, memoryDir, runsDir } from '../util/paths';
import {
  DEFAULT_RUNTIME_YML,
  DEFAULT_PERMISSIONS_YML,
  DEFAULT_CHECKS_YML,
  DEFAULT_MEMORY_ARCHITECTURE,
  DEFAULT_MEMORY_CONVENTIONS,
  DEFAULT_MEMORY_KNOWN_ISSUES,
  DEFAULT_MEMORY_DECISIONS,
} from '../config/defaults';
import { info, success, warn, header, dim, divider } from '../util/output';

export async function initCommand(): Promise<void> {
  let repoRoot: string;
  try {
    repoRoot = findRepoRoot(process.cwd());
  } catch {
    throw new Error('Not a Git repository. Run "git init" first.');
  }

  const dir = agentDir(repoRoot);
  const alreadyExists = fs.existsSync(dir);

  header('Initializing AgentLayer');
  dim(`Repo root: ${repoRoot}`);
  dim(`Agent dir: ${dir}`);

  if (alreadyExists) {
    warn('.agent/ already exists — skipping files that are already present.');
  }

  divider();

  // Create directory structure
  const dirs = [
    dir,
    memoryDir(repoRoot),
    runsDir(repoRoot),
    path.join(dir, 'worktrees'),
    path.join(dir, 'snapshots'),
  ];

  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }

  // Config files — only write if missing
  const configFiles: Array<[string, string]> = [
    [path.join(dir, 'runtime.yml'), DEFAULT_RUNTIME_YML],
    [path.join(dir, 'permissions.yml'), DEFAULT_PERMISSIONS_YML],
    [path.join(dir, 'checks.yml'), DEFAULT_CHECKS_YML],
  ];

  for (const [filePath, content] of configFiles) {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
      info(`Created  ${path.relative(repoRoot, filePath)}`);
    } else {
      dim(`Skipped  ${path.relative(repoRoot, filePath)}`);
    }
  }

  // Memory docs — only write if missing
  const memDir = memoryDir(repoRoot);
  const memoryFiles: Array<[string, string]> = [
    [path.join(memDir, 'architecture.md'), DEFAULT_MEMORY_ARCHITECTURE],
    [path.join(memDir, 'conventions.md'), DEFAULT_MEMORY_CONVENTIONS],
    [path.join(memDir, 'known-issues.md'), DEFAULT_MEMORY_KNOWN_ISSUES],
    [path.join(memDir, 'decisions.md'), DEFAULT_MEMORY_DECISIONS],
  ];

  for (const [filePath, content] of memoryFiles) {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
      info(`Created  ${path.relative(repoRoot, filePath)}`);
    } else {
      dim(`Skipped  ${path.relative(repoRoot, filePath)}`);
    }
  }

  // .gitignore so worktrees/runs don't get committed by accident
  const gitignorePath = path.join(dir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, 'worktrees/\nruns/\nsnapshots/\n', 'utf-8');
    info(`Created  .agent/.gitignore`);
  }

  divider();
  success('AgentLayer initialized.');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Fill in .agent/memory/*.md to describe your codebase');
  console.log('  2. Add test/lint commands to .agent/checks.yml');
  console.log('  3. Run a task:');
  console.log('       agentlayer run "fix the bug in auth middleware" --provider claude');
  console.log('');
}
