import { spawn, type ChildProcess } from 'node:child_process';
import { loadEnvFile } from 'node:process';

const defaultIntervalMs = 15 * 60 * 1000;
const minIntervalMs = 60_000;

let activeChild: ChildProcess | null = null;
let sleepTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;

try {
  loadEnvFile('.env');
} catch {
  // Optional: platform deployments usually inject env vars directly.
}

function resolveIntervalMs() {
  const rawValue = process.env.CONTROL_PLANE_INTERVAL_MS;
  const intervalMs = rawValue === undefined ? defaultIntervalMs : Number(rawValue);

  if (!Number.isFinite(intervalMs)) {
    throw new Error('CONTROL_PLANE_INTERVAL_MS must be a finite number.');
  }

  if (intervalMs < minIntervalMs) {
    throw new Error(`CONTROL_PLANE_INTERVAL_MS must be at least ${minIntervalMs}.`);
  }

  return intervalMs;
}

function runCommand(command: string, args: string[], options: { allowFailure?: boolean } = {}) {
  return new Promise<number>((resolve, reject) => {
    if (shuttingDown) {
      reject(new Error('Shutdown requested before command could start.'));
      return;
    }

    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });

    activeChild = child;

    child.on('error', (error) => {
      if (activeChild === child) activeChild = null;
      reject(error);
    });

    child.on('exit', (code, signal) => {
      if (activeChild === child) activeChild = null;

      if (signal) {
        reject(new Error(`${command} ${args.join(' ')} terminated by ${signal}`));
        return;
      }

      const exitCode = code ?? 1;
      if (exitCode === 0 || options.allowFailure) {
        resolve(exitCode);
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${exitCode}`));
    });
  });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    sleepTimer = setTimeout(() => {
      sleepTimer = null;
      resolve();
    }, ms);
  });
}

function requestShutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;

  shuttingDown = true;
  console.log(`[control-plane] Received ${signal}; shutting down.`);

  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
  }

  if (activeChild) {
    activeChild.kill(signal);
    return;
  }

  process.exit(0);
}

async function runCycle() {
  const startedAt = new Date();
  console.log(`[control-plane] Cycle started at ${startedAt.toISOString()}`);

  try {
    const testExitCode = await runCommand('pnpm', ['run', 'test:website:db'], {
      allowFailure: true,
    });

    if (testExitCode !== 0) {
      console.error(`[control-plane] Website tests exited with code ${testExitCode}.`);
    }

    await runCommand('pnpm', ['run', 'allure:db']);

    const finishedAt = new Date();
    console.log(`[control-plane] Cycle completed at ${finishedAt.toISOString()}`);
  } catch (error) {
    console.error('[control-plane] Cycle failed:', error);
  }
}

async function main() {
  const intervalMs = resolveIntervalMs();

  process.once('SIGINT', () => requestShutdown('SIGINT'));
  process.once('SIGTERM', () => requestShutdown('SIGTERM'));

  console.log(`[control-plane] Starting with interval ${intervalMs}ms.`);
  await runCommand('pnpm', ['run', 'db:migrate']);

  while (!shuttingDown) {
    await runCycle();
    if (!shuttingDown) await sleep(intervalMs);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[control-plane] Fatal startup failure:', error);
    process.exit(1);
  });
