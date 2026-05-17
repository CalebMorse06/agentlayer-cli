import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findRepoRoot } from '../git/git-client';
import { agentDir, memoryDir } from '../util/paths';
import { ConfigNotFoundError } from '../util/errors';
import { info, success, warn, error, header, divider, dim } from '../util/output';

// Matches the default placeholder templates written by `agentlayer init`.
// If a doc still starts with one of these, it hasn't been filled in.
const PLACEHOLDER_PREFIXES = [
  '# Architecture\n\nDescribe',
  '# Conventions\n\nDescribe',
  '# Known Issues\n\nList known',
  '# Decisions\n\nRecord important',
];

function isPlaceholder(content: string): boolean {
  const trimmed = content.trimStart();
  return PLACEHOLDER_PREFIXES.some((p) => trimmed.startsWith(p));
}

function gatherRepoContext(repoRoot: string): string {
  const sections: string[] = [];

  // All tracked files — gives Claude the shape of the codebase
  try {
    const files = execFileSync('git', ['ls-files'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    }).trim();
    // Skip dotfiles and limit to 300 lines so the context stays manageable
    const lines = files
      .split('\n')
      .filter((f) => f && !f.startsWith('.'))
      .slice(0, 300);
    sections.push(`## Repository Files\n${lines.join('\n')}`);
  } catch {
    // Non-fatal — continue without file list
  }

  // Recent commits — reveals project activity and conventions
  try {
    const log = execFileSync('git', ['log', '--oneline', '-30'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    if (log) sections.push(`## Recent Commits\n${log}`);
  } catch {}

  // Key config and manifest files
  const configFiles = [
    'package.json',
    'tsconfig.json',
    'README.md',
    'go.mod',
    'Cargo.toml',
    'pyproject.toml',
    'requirements.txt',
    'composer.json',
    'pom.xml',
    'build.gradle',
  ];

  for (const f of configFiles) {
    const fp = path.join(repoRoot, f);
    if (fs.existsSync(fp)) {
      const raw = fs.readFileSync(fp, 'utf-8');
      // Cap each file at 3000 chars to keep overall context reasonable
      const content = raw.length > 3000 ? raw.slice(0, 3000) + '\n...(truncated)' : raw;
      sections.push(`## ${f}\n\`\`\`\n${content}\n\`\`\``);
    }
  }

  // Main entry point — shows conventions and architecture in code
  const entryPoints = [
    'src/index.ts',
    'src/main.ts',
    'src/app.ts',
    'src/cli.ts',
    'index.ts',
    'main.ts',
    'main.go',
    'main.py',
    'app.py',
    'app.ts',
  ];
  for (const ep of entryPoints) {
    const fp = path.join(repoRoot, ep);
    if (fs.existsSync(fp)) {
      const raw = fs.readFileSync(fp, 'utf-8');
      const content = raw.length > 3000 ? raw.slice(0, 3000) + '\n...(truncated)' : raw;
      sections.push(`## ${ep} (entry point)\n\`\`\`\n${content}\n\`\`\``);
      break;
    }
  }

  return sections.join('\n\n');
}

function buildPrompt(context: string): string {
  return `You are analyzing a Git repository to produce four memory documents that AI coding agents will use as standing context when working in this codebase.

Output EXACTLY the following structure with no text before or after:

<ARCHITECTURE>
# Architecture

...your content...
</ARCHITECTURE>

<CONVENTIONS>
# Conventions

...your content...
</CONVENTIONS>

<KNOWN_ISSUES>
# Known Issues

...your content...
</KNOWN_ISSUES>

<DECISIONS>
# Decisions

...your content...
</DECISIONS>

Document guidelines:

architecture.md
- What the project is and what it does
- Main components and how they relate
- Tech stack and key dependencies
- Directory structure (what each major directory contains)
- Typical data or request flow if applicable
- Aim for 200-400 words. Be specific, not generic.

conventions.md
- Language version and framework conventions
- Naming patterns for files, variables, functions, classes
- How to run the project and tests locally (include actual commands)
- Import and module patterns
- Any style rules clearly visible in the code
- Aim for 150-300 words. Include real commands.

known-issues.md
- TODOs, FIXMEs, or HACKs visible in git history or code
- Known rough edges or non-obvious behaviors
- Incomplete features or intentional stubs
- If nothing notable, write two sentences saying so. Do not pad.
- Aim for under 200 words.

decisions.md
- Key architectural or product decisions visible from the repo
- Each entry: ## YYYY-MM-DD: Title / Context / Decision / Consequences
- Use "Unknown" for date if not determinable from git history
- Maximum 4 entries. Only include decisions that are genuinely non-obvious.

Be concrete. Write for a developer seeing this codebase for the first time.

---

${context}`;
}

function parseOutput(output: string): Record<string, string> {
  const docs: Record<string, string> = {};
  const tags: Array<[string, string]> = [
    ['architecture', 'ARCHITECTURE'],
    ['conventions', 'CONVENTIONS'],
    ['known-issues', 'KNOWN_ISSUES'],
    ['decisions', 'DECISIONS'],
  ];

  for (const [key, tag] of tags) {
    const match = output.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (match) {
      docs[key] = match[1].trim();
    }
  }

  return docs;
}

export interface MemoryInitOptions {
  force?: boolean;
}

export async function memoryInitCommand(opts: MemoryInitOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const dir = agentDir(repoRoot);

  if (!fs.existsSync(dir)) {
    throw new ConfigNotFoundError(repoRoot);
  }

  // Require claude
  try {
    execFileSync('claude', ['--version'], { stdio: 'ignore', timeout: 5000 });
  } catch {
    throw new Error(
      'Claude Code CLI not found on PATH.\nInstall it from https://claude.ai/code'
    );
  }

  header('agentlayer memory init');
  dim(`Repo: ${repoRoot}`);
  divider();

  const memDir = memoryDir(repoRoot);
  fs.mkdirSync(memDir, { recursive: true });

  const docNames = ['architecture', 'conventions', 'known-issues', 'decisions'];

  // Identify which docs are already customized (skip unless --force)
  const skipped: string[] = [];
  if (!opts.force) {
    for (const name of docNames) {
      const fp = path.join(memDir, `${name}.md`);
      if (fs.existsSync(fp) && !isPlaceholder(fs.readFileSync(fp, 'utf-8'))) {
        skipped.push(name);
      }
    }
    if (skipped.length > 0) {
      warn(`Skipping already-customized docs: ${skipped.join(', ')}`);
      warn(`Run with --force to regenerate them.`);
    }
  }

  const toGenerate = opts.force ? docNames : docNames.filter((n) => !skipped.includes(n));

  if (toGenerate.length === 0) {
    info('All memory docs are already customized. Use --force to regenerate.');
    return;
  }

  // Gather context
  info('Gathering repo context...');
  const context = gatherRepoContext(repoRoot);
  dim(`Context: ~${Math.round(context.length / 1024)}KB`);

  // Single Claude call
  info('Running Claude to analyze the codebase...');
  dim('This usually takes 20-60 seconds.');
  console.log('');

  const prompt = buildPrompt(context);

  let rawOutput: string;
  try {
    rawOutput = execFileSync('claude', ['--print', prompt], {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err: any) {
    const stderr = (err.stderr as string | undefined)?.trim() ?? '';
    // claude --print exits non-zero if it encounters an error, but may still
    // have written useful output to stdout
    const stdout = (err.stdout as string | undefined)?.trim() ?? '';
    if (stdout && stdout.includes('<ARCHITECTURE>')) {
      rawOutput = stdout;
    } else {
      // Save debug output
      const debugPath = path.join(dir, 'memory-init-debug.txt');
      fs.writeFileSync(debugPath, stderr + '\n---\n' + stdout, 'utf-8');
      throw new Error(
        `Claude returned an error. Debug output saved to .agent/memory-init-debug.txt\n${stderr || err.message}`
      );
    }
  }

  // Parse tagged sections
  const docs = parseOutput(rawOutput);

  if (Object.keys(docs).length === 0) {
    // Claude didn't follow the format — save raw output so the user can inspect
    const debugPath = path.join(dir, 'memory-init-debug.txt');
    fs.writeFileSync(debugPath, rawOutput, 'utf-8');
    throw new Error(
      'Claude did not use the expected output format.\n' +
      'Raw output saved to .agent/memory-init-debug.txt — you can copy the content manually.'
    );
  }

  // Write docs
  let written = 0;
  for (const name of toGenerate) {
    const content = docs[name];
    if (!content) {
      warn(`No content generated for ${name}.md — skipping.`);
      continue;
    }
    fs.writeFileSync(path.join(memDir, `${name}.md`), content + '\n', 'utf-8');
    success(`Wrote .agent/memory/${name}.md`);
    written++;
  }

  divider();

  if (written === 0) {
    error('No docs were written. Check .agent/memory-init-debug.txt if it exists.');
    return;
  }

  success(`Generated ${written} memory doc(s).`);
  console.log('');
  console.log('Review and edit before using:');
  for (const name of toGenerate) {
    if (docs[name]) console.log(`  .agent/memory/${name}.md`);
  }
  console.log('');
  console.log('Then run a task:');
  console.log('  agentlayer run "your task" --provider claude');
  console.log('');
}
