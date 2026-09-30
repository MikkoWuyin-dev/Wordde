import { execSync, spawn } from 'node:child_process';

/**
 * Preview-server lifecycle helpers shared by the offline spec (which KILLS
 * the server mid-test to simulate a real network death) and the global
 * teardown (which reaps the respawned server at suite end).
 *
 * Why a respawn: Playwright starts ONE webServer for the whole run and will
 * not restart a dead one. The offline test kills it; without a replacement,
 * every spec ordered after it hits ERR_CONNECTION_REFUSED. The offline spec
 * therefore spawns a fresh `vite preview` in afterAll; globalTeardown kills
 * it so `npm run test:e2e` never leaks a process holding the port.
 */

export const PREVIEW_PORT = process.env.PLAYWRIGHT_PREVIEW_PORT ?? '4174';

/** Kill whatever LISTENS on the preview port (Windows/Unix). Only LISTENING
 * sockets are targeted — outbound ESTABLISHED connections from the test's
 * own browser must never match, or we would kill the browser mid-test.
 * "Port already free" is tolerated: callers use this when the server may
 * already be gone. */
export function killPreviewListener(): void {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr LISTENING | findstr :${PREVIEW_PORT}`, {
        encoding: 'utf8',
      });
      const pids = new Set(
        out
          .split(/\r?\n/)
          .map((l) => l.trim().split(/\s+/).pop())
          .filter((p): p is string => !!p && /^\d+$/.test(p)),
      );
      pids.delete(String(process.pid));
      for (const pid of pids) execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    } else {
      execSync(`kill $(lsof -t -iTCP:${PREVIEW_PORT} -sTCP:LISTEN) 2>/dev/null`, {
        stdio: 'ignore',
      });
    }
  } catch {
    // Port already free — nothing to kill.
  }
}

/** Spawn a detached `vite preview` serving dist/ and resolve once it answers
 * HTTP 200 (bounded wait). The child is unref'd: the Playwright runner must
 * not wait on it — globalTeardown reaps it instead. */
export async function spawnPreview(): Promise<void> {
  const child = spawn(`npm run preview -- --port ${PREVIEW_PORT} --strictPort`, {
    shell: true,
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  });
  child.unref();

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PREVIEW_PORT}/`);
      if (res.ok) return;
    } catch {
      // not up yet — retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Respawned preview server on :${PREVIEW_PORT} never became ready.`);
}
