import fs from 'node:fs';
import path from 'node:path';

export function writeArtifact(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
}

export function appendJsonl(filePath: string, obj: unknown): void {
  fs.appendFileSync(filePath, JSON.stringify(obj) + '\n', 'utf-8');
}
