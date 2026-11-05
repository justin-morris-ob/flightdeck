import type { FullConfig, Reporter, Suite, TestCase } from '@playwright/test/reporter';

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

function slug(title: string): string {
  const value = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!value) throw new Error(`Demo title cannot produce an MP4 filename: ${title}`);
  return value;
}

async function convertVideo(input: string, output: string): Promise<void> {
  const { promise, resolve: resolveConversion, reject } = Promise.withResolvers<void>();
  const child = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      input,
      '-an',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      output,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  child.once('error', (error: NodeJS.ErrnoException) => {
    reject(
      new Error(
        error.code === 'ENOENT'
          ? 'ffmpeg is required for demo MP4 export. Install it (macOS: brew install ffmpeg), ensure it is on PATH, then rerun pnpm demo:record.'
          : `Could not start ffmpeg: ${error.message}`
      )
    );
  });
  child.once('close', (code, signal) => {
    if (code === 0) resolveConversion();
    else reject(new Error(`ffmpeg exited with ${signal ?? code}: ${stderr.trim()}`));
  });
  return promise;
}

export default class DemoReporter implements Reporter {
  private readonly outputs = new Map<TestCase, string>();
  private readonly errors: string[] = [];

  onBegin(_config: FullConfig, suite: Suite): void {
    const directory = resolve('.local/demos');
    const names = new Set<string>();
    for (const test of suite.allTests()) {
      try {
        mkdirSync(directory, { recursive: true });
        const output = resolve(directory, `${slug(test.title)}.mp4`);
        rmSync(output, { force: true });
        rmSync(`${output}.partial.mp4`, { force: true });
        if (names.has(output)) {
          throw new Error(`Demo titles must have distinct filename slugs: ${test.title}`);
        }
        names.add(output);
        this.outputs.set(test, output);
      } catch (error) {
        this.errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  async onEnd(): Promise<{ status: 'failed' } | void> {
    if (this.errors.length === 0) {
      for (const [test, output] of this.outputs) {
        if (
          test.expectedStatus !== 'passed' ||
          test.results.length === 0 ||
          test.results.some((result) => result.status !== 'passed')
        ) {
          continue;
        }
        const result = test.results[test.results.length - 1];
        const videos = result.attachments.filter((attachment) => attachment.name === 'video');
        const temporary = `${output}.partial.mp4`;
        try {
          if (videos.length !== 1 || !videos[0].path) {
            throw new Error(
              'Expected exactly one recorded video; enable video: on in the demo config.'
            );
          }
          await convertVideo(videos[0].path, temporary);
          await rename(temporary, output);
          console.log(`Demo MP4: ${output}`);
        } catch (error) {
          this.errors.push(
            `${test.title}: ${error instanceof Error ? error.message : String(error)}`
          );
          for (const path of [temporary, output]) {
            try {
              await rm(path, { force: true });
            } catch (cleanupError) {
              this.errors.push(
                `Could not remove incomplete export ${path}: ${String(cleanupError)}`
              );
            }
          }
        }
      }
    }
    if (this.errors.length > 0) {
      for (const error of this.errors) console.error(`Demo export failed: ${error}`);
      return { status: 'failed' };
    }
  }
}
