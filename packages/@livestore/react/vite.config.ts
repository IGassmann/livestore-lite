import { defineConfig } from 'vite-plus'

const buildTask = {
  command: 'tsc',
  input: [{ auto: true }, '!dist/.tsbuildinfo'],
  output: ['dist/**', '!dist/.tsbuildinfo'],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}

export default defineConfig({
  test: {
    name: '@livestore/react',
    root: import.meta.dirname,
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    // Try node environment with DOM globals for React tests
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    // Setup DOM globals in Node environment
    globals: true,
    server: { deps: { inline: ['@effect/vitest'] } },
  },
  esbuild: {
    // TODO remove once `using` keyword supported OOTB with Vite https://github.com/vitejs/vite/issues/15464#issuecomment-1872485703
    target: 'es2020',
  },
  resolve: {
    alias: {
      '@livestore/wa-sqlite/dist/wa-sqlite.mjs': '@livestore/wa-sqlite/dist/wa-sqlite.node.mjs',
    },
  },
  run: {
    tasks: {
      'build:cached': buildTask,
    },
  },
})
