import pc from 'picocolors';

export function info(msg: string): void {
  console.log(pc.cyan('→') + ' ' + msg);
}

export function success(msg: string): void {
  console.log(pc.green('✓') + ' ' + msg);
}

export function warn(msg: string): void {
  console.warn(pc.yellow('!') + ' ' + msg);
}

export function error(msg: string): void {
  console.error(pc.red('✗') + ' ' + msg);
}

export function dim(msg: string): void {
  console.log(pc.dim(msg));
}

export function header(msg: string): void {
  console.log('\n' + pc.bold(msg));
}

export function divider(): void {
  console.log(pc.dim('─'.repeat(60)));
}

export function kv(key: string, value: string): void {
  console.log('  ' + pc.dim(key.padEnd(12)) + ' ' + value);
}
