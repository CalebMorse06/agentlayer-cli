import { randomBytes } from 'node:crypto';

export function createRunId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = randomBytes(3).toString('hex');
  return `run-${date}-${random}`;
}
