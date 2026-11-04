import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { dirname } from 'node:path';

export class CommandExitError extends Error {
  exitCode: number;

  constructor(code: number | null, signal: NodeJS.Signals | null) {
    const exitCode = code ?? (signal ? 128 + constants.signals[signal] : 1);
    super(`Command exited with ${signal ?? exitCode}.`);
    this.name = 'CommandExitError';
    this.exitCode = exitCode;
  }
}

export async function runCommand(
  executable: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; captureOutput?: boolean }
): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const child = spawn(executable, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
      PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`,
    },
    stdio: options.captureOutput ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  let stdout = '';
  if (options.captureOutput) {
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
  }
  const interrupt = () => {
    child.kill('SIGINT');
  };
  const terminate = () => {
    child.kill('SIGTERM');
  };
  const cleanup = () => {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  child.once('error', (error) => {
    cleanup();
    reject(error);
  });
  child.once('close', (code, signal) => {
    cleanup();
    if (code === 0) resolve(stdout);
    else reject(new CommandExitError(code, signal));
  });
  return promise;
}
