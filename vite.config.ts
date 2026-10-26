import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

function buildId(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD').toString().trim();
    const dirty = execSync('git status --porcelain').toString().trim() !== '';
    return dirty ? `${hash}+` : hash;
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
  server: { host: true, port: 5290, strictPort: true },
});
