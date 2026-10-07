import { execFileSync } from 'node:child_process';
import { defineConfig } from '@playwright/test';

// Worktrees running e2e at the same time need different ports: E2E_PORT=4174 npm run e2e
const port = Number(process.env.E2E_PORT ?? 4173);

// Fail with our own message (Playwright's suggests reusing the server). Main process only: workers load this
// config too, by which time the server is up.
if (!process.env.TEST_WORKER_INDEX) {
  const probe = `require('net').createServer().once('error',()=>process.exit(1)).listen(${port},()=>process.exit(0))`;
  try { execFileSync(process.execPath, ['-e', probe]); }
  catch {
    throw new Error(`e2e: port ${port} is already in use, so this run cannot start its own build there. ` +
      `Pick another port (E2E_PORT=${port + 1} npm run e2e), or stop a preview YOU started earlier, by its PID. ` +
      `Do not stop whatever owns the port: it may belong to another worktree or session.`);
  }
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
