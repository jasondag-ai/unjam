import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const VERSION: string = JSON.parse(readFileSync('package.json', 'utf8')).version;

/** First 7 of the commit: GitHub's in the deploy, git's locally ("+" if uncommitted changes). */
function buildId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    const hash = execSync('git rev-parse --short=7 HEAD').toString().trim();
    const dirty = execSync('git status --porcelain').toString().trim() !== '';
    return dirty ? `${hash}+` : hash;
  } catch {
    return 'unknown';
  }
}

const BUILD = buildId();

/** Writes dist/version.json, the same version and build the game shows on screen. */
function versionFile(): Plugin {
  return {
    name: 'unjam-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION, build: BUILD }) });
    },
  };
}

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the build from /unjam/. The dev server stays at the root.
  base: command === 'build' ? '/unjam/' : '/',
  define: { __APP_VERSION__: JSON.stringify(VERSION), __BUILD_ID__: JSON.stringify(BUILD) },
  plugins: [versionFile()],
  server: { host: true, port: 5290, strictPort: true },
}));
