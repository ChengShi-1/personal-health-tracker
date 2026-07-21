import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const githubEnvironment = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;
const repositoryName = githubEnvironment?.GITHUB_REPOSITORY?.split('/')[1];
const base = githubEnvironment?.GITHUB_ACTIONS && repositoryName ? `/${repositoryName}/` : '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
