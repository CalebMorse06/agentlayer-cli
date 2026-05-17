# AgentLayer

Run AI coding agents safely in your repository.

AgentLayer is an open-source CLI that runs Claude Code and Codex in isolated Git worktrees with repo-local memory, permission policies, logs, diffs, checks, and rollback.

---

## What it is

AgentLayer is not a new coding agent.

It is a **repo-level runtime** for existing coding agents.

Each task gets its own Git worktree, its own branch, its own log file, its own diff, and its own check results — all stored locally in `.agent/runs/`. When the task is done, you inspect the diff, run your checks, and either merge the branch, open a PR, or roll it back in one command.

```
one task = one worktree + one run record + one diff + one summary + one review path
```

## What it is not

- Not a new coding agent
- Not a dashboard or SaaS
- Not a cloud runner
- Not an MCP super-platform
- Not an embeddings or indexing system
- Not an enterprise governance suite

## Why use it

Every coding agent — Claude Code, Codex, Cursor, Windsurf — has its own memory format, its own permission model, its own log format, and its own branch behavior. When you use more than one, or just want a repeatable audit trail, there is no neutral layer underneath them.

AgentLayer is that layer. It gives your repo one consistent way to:

- keep agent tasks off your working branch
- feed the agent a small, explicit context packet built from your repo's memory docs
- record exactly what happened: instruction, context, stdout, stderr, diff, checks
- throw the result away cleanly, or hand it to a reviewer as a branch

## Quick start

```bash
npm i -g agentlayer-cli

cd your-project
agentlayer init

# Let Claude read your codebase and write the memory docs automatically
agentlayer memory init

# Run a task — the agent now has real context about your repo
agentlayer run "add input validation to the signup form" --provider claude

# Inspect the result
agentlayer diff <run-id>
agentlayer summary <run-id>

# Keep it or discard it
agentlayer rollback <run-id>
```

## Commands

| Command | What it does |
|---|---|
| `agentlayer init` | Scaffold `.agent/` config, memory docs, and check presets in the current Git repo |
| `agentlayer memory init` | Run Claude once against your codebase to auto-generate all four memory docs |
| `agentlayer run "task" --provider claude\|codex` | Create a worktree, build a context packet, run the agent, capture all artifacts |
| `agentlayer list` | List all runs with status, provider, and branch |
| `agentlayer logs <run>` | Show stdout log (add `--stderr` or `--events` for other log types) |
| `agentlayer diff <run>` | Show the git diff for the run (add `--stat` or `--name-only`) |
| `agentlayer summary <run>` | Show the run summary (add `--handoff` for full handoff notes) |
| `agentlayer check <run>` | Run the configured checks inside the run worktree |
| `agentlayer rollback <run>` | Remove the worktree and local branch; keep the run record |
| `agentlayer clean <run>` | Remove the worktree; keep the run record, diff, and logs |

## What gets created

After `agentlayer init`, your repo gains:

```
.agent/
  runtime.yml        ← provider settings, branch prefix, backend
  permissions.yml    ← denied paths, denied commands, approval mode
  checks.yml         ← named check presets (quick, default, full)
  memory/
    architecture.md  ← describe your project structure here
    conventions.md   ← describe your coding conventions here
    known-issues.md  ← known bugs and sharp edges
    decisions.md     ← important architectural decisions
  runs/              ← one directory per run (gitignored)
  worktrees/         ← git worktrees (gitignored)
```

After `agentlayer run`, each run directory contains:

```
.agent/runs/<run-id>/
  run.json           ← machine-readable manifest (provider, branch, SHA, status, exit code)
  instruction.md     ← exact task prompt handed to the agent
  context.md         ← full context packet assembled from memory + git status
  stdout.log         ← streamed agent output
  stderr.log         ← streamed agent errors
  events.jsonl       ← structured lifecycle events (timestamps, transitions)
  diff.patch         ← git patch against the start SHA
  summary.md         ← short human-readable result
  handoff.md         ← review notes: what changed, what to check, what to do next
  checks.json        ← structured check results
  selected-memory.json  ← which memory docs were included
  relevant-files.json   ← which files were flagged as relevant
```

Every artifact is plain text. Nothing is hidden in a database.

## Memory docs

The memory docs in `.agent/memory/` are the contract between you and the agent. They are plain Markdown files you own and version-control.

| File | Purpose |
|---|---|
| `architecture.md` | What the project is, how it's structured, main components |
| `conventions.md` | Naming rules, how to run/test locally, import patterns |
| `known-issues.md` | Known bugs, tech debt, sharp edges |
| `decisions.md` | Key architectural decisions and their rationale |

**`agentlayer memory init`** runs Claude once against your codebase — reading your file tree, git history, package.json, and entry points — and writes a first draft of all four docs automatically. It takes about 30 seconds.

```bash
agentlayer memory init
# → writes .agent/memory/architecture.md
# → writes .agent/memory/conventions.md
# → writes .agent/memory/known-issues.md
# → writes .agent/memory/decisions.md
```

Review and edit the output. Then every subsequent `agentlayer run` will include that context in the packet handed to the agent — without you having to re-explain your codebase every time.

Run `agentlayer memory init --force` to regenerate after major refactors.

## Context packets

AgentLayer does not dump your entire repo into the agent prompt.

Each run builds a small, explicit context packet from:

- the task instruction
- your repo memory docs (`.agent/memory/`)
- files matched by `git grep` against keywords in the task
- the current `git status`
- your active permission policy
- the check commands that define "done"

## Providers

AgentLayer currently supports two providers:

**Claude Code** (`--provider claude`)  
Requires `claude` on PATH. AgentLayer writes the context packet to `AGENT_CONTEXT.md` in the worktree and calls `claude --print`. Set `approvalMode: never` in `permissions.yml` to pass `--dangerously-skip-permissions`.

**Codex** (`--provider codex`)  
Requires `codex` on PATH. AgentLayer writes the context packet to `AGENT_CONTEXT.md` and calls `codex`. Set `approvalMode: never` to pass `--full-auto`.

## Configuration

### `.agent/runtime.yml`

```yaml
defaultProvider: "claude"
branchPrefix: "agent/"
backend: "host"          # "host" or "devcontainer"
defaultCheckPreset: "default"
```

### `.agent/permissions.yml`

```yaml
approvalMode: "on-request"   # "manual" | "on-request" | "never"
deniedPaths:
  - ".env"
  - ".env.*"
  - "*.key"
deniedCommands: []
```

### `.agent/checks.yml`

```yaml
presets:
  default:
    timeout: 120
    failFast: false
    commands:
      - "npm run lint"
      - "npm test"
```

## Security model

AgentLayer is honest about what it actually enforces:

| What AgentLayer does | What it actually guarantees |
|---|---|
| Git worktree isolation | Strong: the agent's changes are on a separate branch and cannot touch your working tree |
| Logs and diff capture | Observational: a full audit trail after the fact, not prevention |
| Denied path/command checks | Mostly advisory: effective only if all execution goes through AgentLayer's process runner |
| Rollback | Pre-merge only: removes the worktree and branch before any changes are merged |

Worktrees isolate Git state. They do not isolate the host machine. The agent still runs with your user's permissions. Real containment requires `backend: devcontainer` (coming in a later release).

## Requirements

- Node.js 18+
- pnpm
- git
- `claude` CLI (for `--provider claude`) — [Claude Code](https://claude.ai/code)
- `codex` CLI (for `--provider codex`) — [OpenAI Codex](https://github.com/openai/codex)

## Design principles

- CLI first, local first, worktree first
- Provider neutral: same commands regardless of which agent runs the task
- Inspectable by default: every artifact is a plain file you can read, diff, or copy
- Boring code: no magic, no daemons, no hidden state
- No dashboard in v0.1

## Roadmap

- [x] `agentlayer init`
- [x] `agentlayer memory init` — auto-generate memory docs with Claude
- [x] `agentlayer run` with Claude and Codex adapters
- [x] `agentlayer list`, `logs`, `diff`, `summary`, `check`, `rollback`, `clean`
- [ ] `agentlayer pr` — push branch and open a GitHub PR via Octokit
- [ ] `devcontainer` backend for stronger isolation
- [ ] Windows path handling polish

## Status

v0.1 — early, works on macOS and Linux. Windows support is functional but not the primary target yet.

## License

MIT
