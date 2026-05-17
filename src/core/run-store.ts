import fs from 'node:fs';
import path from 'node:path';
import { runDir, runsDir } from '../util/paths';

export type RunStatus =
  | 'starting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rolled-back'
  | 'cleaned';

export interface RunRecord {
  id: string;
  provider: string;
  task: string;
  status: RunStatus;
  repoRoot: string;
  worktreePath: string;
  branchName: string;
  baseBranch: string;
  startSha: string;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  changedFilesCount?: number;
  checkStatus?: 'passed' | 'failed' | 'skipped';
  prUrl?: string;
}

export function writeRunRecord(repoRoot: string, record: RunRecord): void {
  const dir = runDir(repoRoot, record.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'run.json'),
    JSON.stringify(record, null, 2),
    'utf-8'
  );
}

export function readRunRecord(repoRoot: string, runId: string): RunRecord {
  const file = path.join(runDir(repoRoot, runId), 'run.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Run not found: ${runId}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as RunRecord;
}

export function updateRunRecord(
  repoRoot: string,
  runId: string,
  updates: Partial<RunRecord>
): RunRecord {
  const record = readRunRecord(repoRoot, runId);
  const updated = { ...record, ...updates };
  writeRunRecord(repoRoot, updated);
  return updated;
}

export function listRunRecords(repoRoot: string): RunRecord[] {
  const dir = runsDir(repoRoot);
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const records: RunRecord[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const record = readRunRecord(repoRoot, entry.name);
      records.push(record);
    } catch {
      // Skip corrupt run records
    }
  }

  return records.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function resolveRunId(repoRoot: string, partialId: string): string {
  const records = listRunRecords(repoRoot);

  const exact = records.find((r) => r.id === partialId);
  if (exact) return exact.id;

  const matches = records.filter((r) => r.id.startsWith(partialId));
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous run ID prefix "${partialId}" matches:\n${matches.map((r) => `  ${r.id}`).join('\n')}`
    );
  }

  throw new Error(`Run not found: ${partialId}`);
}
