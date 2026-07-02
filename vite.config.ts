import { defineConfig } from 'vite-plus'

const commonUntrackedEnv = ['CI', 'GITHUB_*', 'RUNNER_*']

export default defineConfig({
  run: {
    tasks: {
      'ci:lint': {
        command: 'pnpm run lint:full',
        output: [],
        untrackedEnv: commonUntrackedEnv,
      },
      'ci:ts:build': {
        command: 'pnpm run ts:build',
        input: [{ auto: true }, '!**/*.tsbuildinfo'],
        output: [{ auto: true }, '!**/*.tsbuildinfo'],
        untrackedEnv: commonUntrackedEnv,
      },
      'ci:test:unit': {
        command: 'pnpm run test:unit',
        dependsOn: ['ci:ts:build'],
        output: [],
        untrackedEnv: [...commonUntrackedEnv, 'LIVESTORE_TEST_UNIT_CONCURRENCY'],
      },
      'ci:examples:build': {
        command: 'pnpm run examples:build:src',
        dependsOn: ['ci:ts:build'],
        untrackedEnv: commonUntrackedEnv,
      },
      'ci:docs:snippets': {
        command: 'pnpm run docs:build:phase:snippets',
        dependsOn: ['ci:ts:build'],
        untrackedEnv: commonUntrackedEnv,
      },
      'ci:docs:diagrams': {
        command: 'pnpm run docs:build:phase:diagrams',
        dependsOn: ['ci:ts:build'],
        untrackedEnv: [...commonUntrackedEnv, 'PUPPETEER_CACHE_DIR'],
      },
      'ci:docs:astro': {
        command: 'pnpm run docs:build:phase:astro',
        dependsOn: ['ci:docs:snippets', 'ci:docs:diagrams'],
        untrackedEnv: commonUntrackedEnv,
      },
    },
  },
})
