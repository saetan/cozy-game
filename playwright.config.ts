import { execFileSync } from 'node:child_process';
import { defineConfig } from '@playwright/test';

// Worktrees running e2e at the same time need different ports: E2E_PORT=4174 npm run e2e
const rawPort = process.env.E2E_PORT ?? '4173';
const port = /^\d+$/.test(rawPort) ? Number(rawPort) : NaN;
if (!(port >= 1 && port <= 65535)) throw new Error(`e2e: E2E_PORT must be an integer from 1 to 65535, got "${rawPort}"`);

// Fail with our own message (Playwright's suggests reusing the server). Probe once per run: the first load of this
// config sets E2E_PORT_CHECKED, and later loads skip it (workers inherit it; Playwright's test server, UI mode and
// the VS Code extension reload the config in-process after the run's own server is up, when the port is busy by design).
if (!process.env.E2E_PORT_CHECKED) {
  // Connect, don't bind: a wildcard bind succeeds on macOS while `vite preview` holds [::1] on the same port.
  // Connecting to localhost tests what Playwright will actually use.
  const probe = `require('net').connect({host:'localhost',port:${port}}).once('connect',()=>process.exit(1)).once('error',()=>process.exit(0))`;
  try { execFileSync(process.execPath, ['-e', probe], { timeout: 5000 }); }
  catch (e) {
    // exit 1 = something answered; a timeout (killed) = cannot tell. Both fail, with different wording.
    const unknown = (e as { signal?: string }).signal;
    throw new Error(unknown
      ? `e2e: could not tell whether port ${port} is free (the check timed out). Try another port: E2E_PORT=${port + 1} npm run e2e`
      : `e2e: port ${port} is already in use, so this run cannot start its own build there. ` +
        `Pick another port (E2E_PORT=${port + 1} npm run e2e), or stop a preview YOU started earlier, by its PID. ` +
        `Do not stop whatever owns the port: it may belong to another worktree or session.`);
  }
  process.env.E2E_PORT_CHECKED = '1';
}

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // CI runners render WebGL in software (SwiftShader) on 2 vCPUs: run serially with a longer budget
  workers: process.env.CI ? 1 : 2, // software WebGL: more local workers overload it and starve the frame loop
  timeout: process.env.CI ? 120_000 : 30_000,
  retries: 0,
  // CI shards write blob reports that a later job merges into one HTML report
  reporter: process.env.CI ? [['list'], ['blob']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // Never reuse a server: whatever sits on the port may be an old build without the current test hooks.
    // The check above fails a busy port with instructions; --strictPort is the backstop.
    // Production build in e2e mode (test hooks on); a plain `npm run build` ships none.
    command: `npx vite build --mode e2e --outDir dist-e2e && npx vite preview --mode e2e --outDir dist-e2e --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
