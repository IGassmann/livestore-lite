import { defineConfig } from 'vite-plus'

const buildTask = {
  command: 'astro build',
  input: [{ auto: true }, '!dist/**', '!node_modules/.astro/**'],
  output: ['dist/**'],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}
const snippetsBuildTask = {
  command: 'bun run scripts/build-snippets.ts',
  input: [{ auto: true }, '!node_modules/.astro-twoslash-code/**'],
  output: ['node_modules/.astro-twoslash-code/**'],
  untrackedEnv: ['CI', 'GITHUB_*', 'RUNNER_*'],
}

export default defineConfig({
  run: {
    tasks: {
      'build:cached': buildTask,
      'snippets:build:cached': snippetsBuildTask,
      'test:e2e': {
        command: 'playwright test',
        dependsOn: ['snippets:build:cached'],
        cache: false,
      },
    },
  },
})
