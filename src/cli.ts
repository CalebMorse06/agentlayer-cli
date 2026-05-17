#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { runCommand } from './commands/run';
import { listCommand } from './commands/list';
import { logsCommand } from './commands/logs';
import { diffCommand } from './commands/diff';
import { summaryCommand } from './commands/summary';
import { checkCommand } from './commands/check';
import { rollbackCommand } from './commands/rollback';
import { cleanCommand } from './commands/clean';
import { memoryInitCommand } from './commands/memory';
import { error } from './util/output';

function handle(fn: () => Promise<void>): void {
  fn().catch((err: Error) => {
    error(err.message);
    process.exit(1);
  });
}

const program = new Command();

program
  .name('agentlayer')
  .description('Repo-local runtime for AI coding agents in isolated Git worktrees')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize AgentLayer in the current Git repository')
  .action(() => handle(initCommand));

program
  .command('run <task>')
  .description('Run a task with an AI coding agent in an isolated Git worktree')
  .option('--provider <name>', 'Provider to use: claude or codex', 'claude')
  .option('--checks <preset>', 'Check preset name to run after the task')
  .option('--approve <mode>', 'Approval mode: manual | on-request | never')
  .option('--base <branch>', 'Base branch to create the worktree from')
  .action((task: string, opts) => handle(() => runCommand(task, opts)));

program
  .command('list')
  .description('List all runs in this repository')
  .action(() => handle(listCommand));

program
  .command('logs <run>')
  .description('Show logs for a run (stdout by default)')
  .option('--stderr', 'Show stderr log instead of stdout')
  .option('--events', 'Show structured event log (JSONL)')
  .action((run: string, opts) => handle(() => logsCommand(run, opts)));

program
  .command('diff <run>')
  .description('Show the git diff for a run')
  .option('--stat', 'Show diff stat summary only')
  .option('--name-only', 'Show changed file names only')
  .action((run: string, opts) => handle(() => diffCommand(run, opts)));

program
  .command('summary <run>')
  .description('Show the run summary')
  .option('--handoff', 'Show the handoff notes instead')
  .action((run: string, opts) => handle(() => summaryCommand(run, opts)));

program
  .command('check <run>')
  .description('Run checks inside the run worktree')
  .option('--preset <name>', 'Check preset to use')
  .option('--rerun', 'Force re-run even if cached results exist')
  .action((run: string, opts) => handle(() => checkCommand(run, opts)));

program
  .command('rollback <run>')
  .description('Discard a run: remove its worktree and local branch')
  .option('--force', 'Force removal even if the worktree has uncommitted changes')
  .action((run: string, opts) => handle(() => rollbackCommand(run, opts)));

program
  .command('clean <run>')
  .description('Clean up the worktree while keeping the run record and logs')
  .option('--no-keep-logs', 'Also remove stdout/stderr log files')
  .action((run: string, opts) => handle(() => cleanCommand(run, opts)));

// memory subcommands
const memory = program
  .command('memory')
  .description('Manage repo memory docs in .agent/memory/');

memory
  .command('init')
  .description('Auto-generate memory docs by running Claude against your codebase')
  .option('--force', 'Overwrite docs that have already been customized')
  .action((opts) => handle(() => memoryInitCommand(opts)));

program.parse(process.argv);
