export const DEFAULT_RUNTIME_YML = `# AgentLayer runtime configuration
version: "1"

providers:
  claude:
    enabled: true
  codex:
    enabled: true

# Where Git worktrees are created (relative to repo root)
worktreeRoot: ".agent/worktrees"

# Prefix for branches created by agentlayer
branchPrefix: "agent/"

# Execution backend: "host" or "devcontainer"
backend: "host"

# Default provider when --provider is not specified
defaultProvider: "claude"

# Default check preset to run after each task
defaultCheckPreset: "default"
`;

export const DEFAULT_PERMISSIONS_YML = `# AgentLayer permissions configuration
version: "1"

# Approval mode: "manual" | "on-request" | "never"
#   manual      - approve every action before it runs
#   on-request  - provider prompts for approval on risky actions
#   never       - no approval gates (use carefully)
approvalMode: "on-request"

# Paths the agent is allowed to modify (empty = no restriction)
allowedPaths: []

# Paths the agent must never modify
deniedPaths:
  - ".env"
  - ".env.*"
  - "*.pem"
  - "*.key"
  - "secrets/**"

# Shell commands the agent is allowed to run (empty = no restriction)
allowedCommands: []

# Shell commands the agent must never run
deniedCommands: []

# Network mode: "allow" | "deny" | "prompt"
networkMode: "allow"
`;

export const DEFAULT_CHECKS_YML = `# AgentLayer check presets
# Define named groups of shell commands to run inside the worktree after a task.
version: "1"

presets:
  quick:
    timeout: 60
    failFast: true
    commands: []
    # commands:
    #   - "npm run lint"

  default:
    timeout: 120
    failFast: false
    commands: []
    # commands:
    #   - "npm run lint"
    #   - "npm test"

  full:
    timeout: 300
    failFast: false
    commands: []
    # commands:
    #   - "npm run lint"
    #   - "npm run typecheck"
    #   - "npm test"
    #   - "npm run build"
`;

export const DEFAULT_MEMORY_ARCHITECTURE = `# Architecture

Describe the high-level architecture of this repository.

- What is this project?
- How is it structured?
- What are the main components and layers?
- What patterns or frameworks are used?
- What does a typical request/data flow look like?
`;

export const DEFAULT_MEMORY_CONVENTIONS = `# Conventions

Describe coding conventions, style rules, and norms for this repository.

- Language and framework versions
- Naming conventions (variables, files, functions)
- File organization patterns
- Formatting and linting rules
- Testing conventions and expectations
- How to run the project locally
`;

export const DEFAULT_MEMORY_KNOWN_ISSUES = `# Known Issues

List known bugs, technical debt, and sharp edges an agent should be aware of.

- Known broken things
- Things that are intentionally hacky or deferred
- Footguns and non-obvious behaviors
- Incomplete features or stubs
`;

export const DEFAULT_MEMORY_DECISIONS = `# Decisions

Record important architectural or product decisions made in this repository.

Format each entry as:

## YYYY-MM-DD: Title
Context: Why this decision was needed.
Decision: What was decided.
Consequences: What this means for future work.
`;
