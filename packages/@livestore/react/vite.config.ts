import { defineConfig } from 'vite-plus'

const stableUnitTestTask = {
  command: ["/bin/bash -lc 'vp test'", "/bin/bash -lc 'REACT_STRICT_MODE=1 vp test'"],
  dependsOn: ['build:cached'],
  output: [],
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
      'build:cached': {
        command: "/bin/bash -lc 'tsc'",
        dependsOn: [{ task: 'build:cached', from: ['dependencies', 'devDependencies'] }],
        input: [{ auto: true }, '!**/*.tsbuildinfo'],
        output: ['dist/**', '!**/*.tsbuildinfo'],
        untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
      },
      'test:unit:stable': stableUnitTestTask,
    },
  },
})
