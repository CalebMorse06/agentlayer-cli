import { findRepoRoot } from '../git/git-client';
import { listRunRecords } from '../core/run-store';

const RUN_COMMANDS = [
  'diff', 'logs', 'summary', 'check', 'rollback', 'clean',
  'pr', 'merge', 'rerun', 'open',
];

const ALL_COMMANDS = [
  'init', 'run', 'list', 'logs', 'diff', 'summary', 'check',
  'rollback', 'clean', 'pr', 'merge', 'rerun', 'open', 'context', 'memory',
];

const STATUSES    = ['running', 'completed', 'failed', 'rolled-back', 'cleaned'];
const PROVIDERS   = ['claude', 'codex'];
const APPROVE     = ['manual', 'on-request', 'never'];
const MEMORY_CMDS = ['init', 'show'];

export function completeIdsCommand(): void {
  try {
    const repoRoot = findRepoRoot(process.cwd());
    const records  = listRunRecords(repoRoot);
    for (const r of records) console.log(r.id);
  } catch {
    // Not in a git repo — print nothing, completion silently shows nothing
  }
}

export async function completionCommand(shell: string): Promise<void> {
  const s = shell.toLowerCase();
  const scripts: Record<string, () => string> = {
    bash:        bashScript,
    zsh:         zshScript,
    fish:        fishScript,
    powershell:  powershellScript,
    pwsh:        powershellScript,
  };
  const fn = scripts[s];
  if (!fn) {
    process.stderr.write(`Unknown shell: "${shell}"\nSupported: bash, zsh, fish, powershell\n`);
    process.exit(1);
  }
  process.stdout.write(fn());
}

// ---------------------------------------------------------------------------
// Bash
// ---------------------------------------------------------------------------
function bashScript(): string {
  const runCmds  = RUN_COMMANDS.join(' ');
  const allCmds  = ALL_COMMANDS.join(' ');
  const statuses = STATUSES.join(' ');
  const providers= PROVIDERS.join(' ');
  const approve  = APPROVE.join(' ');
  const memCmds  = MEMORY_CMDS.join(' ');

  // Shell variables are written as \${VAR} to prevent TS template interpolation.
  return [
    '# agentlayer bash completion',
    '# Add to ~/.bashrc or ~/.bash_profile:',
    '#   eval "$(agentlayer completion bash)"',
    '',
    '_agentlayer_complete() {',
    '    local cur prev words cword',
    '    _get_comp_words_by_ref -n : cur prev words cword 2>/dev/null || {',
    '        cur="\${COMP_WORDS[COMP_CWORD]}"',
    '        prev="\${COMP_WORDS[COMP_CWORD-1]}"',
    '    }',
    '',
    `    local run_cmds="${runCmds}"`,
    `    local all_cmds="${allCmds}"`,
    '',
    '    case "$prev" in',
    `        --provider) COMPREPLY=(\$(compgen -W "${providers}" -- "$cur")); return ;;`,
    `        --status)   COMPREPLY=(\$(compgen -W "${statuses}"  -- "$cur")); return ;;`,
    `        --approve)  COMPREPLY=(\$(compgen -W "${approve}"   -- "$cur")); return ;;`,
    '    esac',
    '',
    '    if [[ "\${words[1]}" == "memory" ]]; then',
    `        COMPREPLY=(\$(compgen -W "${memCmds}" -- "$cur"))`,
    '        return',
    '    fi',
    '',
    '    if [[ " $run_cmds " =~ " \${words[1]} " && "$cword" -eq 2 ]]; then',
    '        local ids',
    '        ids=$(agentlayer _complete-ids 2>/dev/null)',
    '        COMPREPLY=($(compgen -W "$ids" -- "$cur"))',
    '        return',
    '    fi',
    '',
    '    if [[ "$cword" -eq 1 ]]; then',
    '        COMPREPLY=($(compgen -W "$all_cmds" -- "$cur"))',
    '    fi',
    '}',
    '',
    'complete -F _agentlayer_complete agentlayer',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Zsh
// ---------------------------------------------------------------------------
function zshScript(): string {
  const runPattern = RUN_COMMANDS.join('|');
  const statuses   = STATUSES.join(' ');
  const providers  = PROVIDERS.join(' ');
  const approve    = APPROVE.join(' ');

  return [
    '#compdef agentlayer',
    '# agentlayer zsh completion',
    '# Add to ~/.zshrc:',
    '#   eval "$(agentlayer completion zsh)"',
    '',
    '_agentlayer() {',
    '    local state line',
    '    typeset -A opt_args',
    '',
    '    local -a top_commands',
    '    top_commands=(',
    "        'init:Initialize AgentLayer in the current Git repository'",
    "        'run:Run a task with an AI coding agent in an isolated Git worktree'",
    "        'list:List all runs (--status, --json)'",
    "        'logs:Show logs for a run (--follow to tail a live run)'",
    "        'diff:Show the git diff for a run'",
    "        'summary:Show the run summary'",
    "        'check:Run checks inside the run worktree'",
    "        'rollback:Remove the worktree and local branch'",
    "        'clean:Remove the worktree, keep logs'",
    "        'pr:Push branch and open a GitHub PR'",
    "        'merge:Merge the run branch into the current branch'",
    "        'rerun:Start a new run with the same task'",
    "        'open:Open the run worktree in your editor'",
    "        'context:Preview the context packet for a task'",
    "        'memory:Manage repo memory docs'",
    '    )',
    '',
    '    _arguments -C \\',
    "        '1: :->command' \\",
    "        '*: :->args' && return",
    '',
    '    case $state in',
    '        command)',
    '            _describe "agentlayer command" top_commands',
    '            ;;',
    '        args)',
    `            case \${words[2]} in`,
    `                ${runPattern})`,
    '                    if [[ $CURRENT -eq 3 ]]; then',
    '                        local -a run_ids',
    // zsh parameter expansion ${(f)...} — escape the $ so TS doesn't eat it
    '                        run_ids=(${(f)"$(agentlayer _complete-ids 2>/dev/null)"})',
    '                        _describe "run id" run_ids',
    '                    fi',
    '                    ;;',
    '                memory)',
    '                    local -a mem_cmds',
    "                    mem_cmds=('init:Auto-generate memory docs' 'show:Print memory docs to stdout')",
    '                    _describe "memory command" mem_cmds',
    '                    ;;',
    '                list)',
    '                    _arguments \\',
    "                        '--json[Output as JSON array]' \\",
    `                        '--status[Filter by status]:status:(${statuses})'`,
    '                    ;;',
    '                run|rerun)',
    '                    _arguments \\',
    `                        '--provider[Provider]:provider:(${providers})' \\`,
    `                        '--approve[Approval mode]:mode:(${approve})' \\`,
    "                        '--checks[Check preset]:preset:' \\",
    "                        '--base[Base branch]:branch:'",
    '                    ;;',
    '            esac',
    '            ;;',
    '    esac',
    '}',
    '',
    '_agentlayer',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Fish
// ---------------------------------------------------------------------------
function fishScript(): string {
  const runCmdsStr   = RUN_COMMANDS.join(' ');
  const allCmdsStr   = ALL_COMMANDS.join(' ');
  const perRunLines  = RUN_COMMANDS.map(
    (c) => `complete -c agentlayer -f -n '__fish_seen_subcommand_from ${c}' -a '(__agentlayer_run_ids)'`
  ).join('\n');
  const statuses  = STATUSES.join(' ');
  const providers = PROVIDERS.join(' ');
  const approve   = APPROVE.join(' ');

  return [
    '# agentlayer fish completion',
    '# Install:',
    '#   agentlayer completion fish > ~/.config/fish/completions/agentlayer.fish',
    '# Or source inline:',
    '#   agentlayer completion fish | source',
    '',
    'function __agentlayer_run_ids',
    '    agentlayer _complete-ids 2>/dev/null',
    'end',
    '',
    'function __agentlayer_no_subcommand',
    `    not __fish_seen_subcommand_from ${allCmdsStr}`,
    'end',
    '',
    '# Top-level commands',
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'init'     -d 'Initialize AgentLayer'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'run'      -d 'Run a task with an AI coding agent'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'list'     -d 'List all runs'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'logs'     -d 'Show logs for a run'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'diff'     -d 'Show git diff for a run'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'summary'  -d 'Show run summary'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'check'    -d 'Run checks in the worktree'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'rollback' -d 'Discard a run'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'clean'    -d 'Remove worktree, keep logs'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'pr'       -d 'Open a GitHub PR'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'merge'    -d 'Merge run branch'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'rerun'    -d 'Re-run with same task'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'open'     -d 'Open worktree in editor'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'context'  -d 'Preview context packet'",
    "complete -c agentlayer -f -n '__agentlayer_no_subcommand' -a 'memory'   -d 'Manage memory docs'",
    '',
    '# Run ID completions',
    perRunLines,
    '',
    '# memory subcommands',
    "complete -c agentlayer -f -n '__fish_seen_subcommand_from memory' -a 'init' -d 'Auto-generate memory docs'",
    "complete -c agentlayer -f -n '__fish_seen_subcommand_from memory' -a 'show' -d 'Print memory docs'",
    '',
    '# Flag completions',
    `complete -c agentlayer -n '__fish_seen_subcommand_from run rerun' -l provider -a '${providers}' -d 'Provider'`,
    `complete -c agentlayer -n '__fish_seen_subcommand_from run rerun' -l approve  -a '${approve}'   -d 'Approval mode'`,
    `complete -c agentlayer -n '__fish_seen_subcommand_from list'      -l status   -a '${statuses}'  -d 'Filter by status'`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// PowerShell
// ---------------------------------------------------------------------------
function powershellScript(): string {
  const runCmdsPs  = RUN_COMMANDS.map((c) => `'${c}'`).join(', ');
  const allCmdsPs  = ALL_COMMANDS.map((c) => `'${c}'`).join(', ');
  const statusesPs = STATUSES.map((s) => `'${s}'`).join(', ');
  const providersPs= PROVIDERS.map((p) => `'${p}'`).join(', ');
  const approvePs  = APPROVE.map((m) => `'${m}'`).join(', ');

  // PowerShell variables start with $ — write them as plain strings to avoid
  // TypeScript trying to interpolate them.
  const d = '$';
  return [
    '# agentlayer PowerShell completion',
    '# Add to your $PROFILE:',
    '#   Invoke-Expression (agentlayer completion powershell)',
    '',
    'Register-ArgumentCompleter -Native -CommandName agentlayer -ScriptBlock {',
    `    param(${d}wordToComplete, ${d}commandAst, ${d}cursorPosition)`,
    '',
    `    ${d}tokens    = ${d}commandAst.CommandElements`,
    `    ${d}subCmd    = if (${d}tokens.Count -gt 1) { ${d}tokens[1].Value } else { '' }`,
    `    ${d}argCount  = ${d}tokens.Count`,
    `    ${d}prevToken = if (${d}tokens.Count -gt 1) { ${d}tokens[${d}tokens.Count - 2].Value } else { '' }`,
    '',
    `    ${d}runCmds   = @(${runCmdsPs})`,
    `    ${d}allCmds   = @(${allCmdsPs})`,
    `    ${d}statuses  = @(${statusesPs})`,
    `    ${d}providers = @(${providersPs})`,
    `    ${d}approveModes = @(${approvePs})`,
    '',
    `    function Complete(${d}items) {`,
    `        ${d}items | Where-Object { ${d}_ -like "${d}wordToComplete*" } | ForEach-Object {`,
    `            [System.Management.Automation.CompletionResult]::new(${d}_, ${d}_, 'ParameterValue', ${d}_)`,
    '        }',
    '    }',
    '',
    `    switch (${d}prevToken) {`,
    `        '--provider' { Complete ${d}providers;     return }`,
    `        '--status'   { Complete ${d}statuses;      return }`,
    `        '--approve'  { Complete ${d}approveModes;  return }`,
    '    }',
    '',
    `    if (${d}subCmd -eq 'memory') { Complete @('init', 'show'); return }`,
    '',
    `    if (${d}runCmds -contains ${d}subCmd -and ${d}argCount -eq 3) {`,
    `        ${d}ids = agentlayer _complete-ids 2>${d}null`,
    `        Complete ${d}ids`,
    '        return',
    '    }',
    '',
    `    if (${d}argCount -le 2) { Complete ${d}allCmds }`,
    '}',
    '',
  ].join('\n');
}
