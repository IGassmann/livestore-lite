import { defineConfig } from 'vite-plus'

const commonUntrackedEnv = ['CI', 'GITHUB_*', 'RUNNER_*']
const branchEnv = ['GITHUB_BRANCH_NAME', 'GITHUB_REF_NAME', 'GITHUB_HEAD_REF', 'GITHUB_REF']
const generatedInputExclusions = [
  '!**/*.tsbuildinfo',
  '!tmp/**',
  '!coverage/**',
  '!test-results/**',
  '!playwright-report/**',
  '!docs/.astro/**',
  '!docs/dist/**',
  '!docs/logs/**',
  '!docs/node_modules/.astro-tldraw/**',
  '!docs/node_modules/.astro-twoslash-code/**',
  '!docs/.cache/snippets/**',
  '!examples/*/dist/**',
  '!examples/*/.wrangler/**',
]

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
        input: [{ auto: true }, ...generatedInputExclusions],
        untrackedEnv: commonUntrackedEnv,
      },
      'ci:examples:build-ready': {
        command: 'true',
        dependsOn: ['ci:examples:build'],
        output: [],
        untrackedEnv: commonUntrackedEnv,
      },
      'ci:examples:deploy-build': {
        command: 'pnpm run examples:deploy:build',
        input: [{ auto: true }, ...generatedInputExclusions],
        env: branchEnv,
        untrackedEnv: ['CI', 'RUNNER_*'],
      },
      'ci:examples:deploy-build:prod': {
        command: 'pnpm run examples:deploy:build:prod',
        input: [{ auto: true }, ...generatedInputExclusions],
        env: branchEnv,
        untrackedEnv: ['CI', 'RUNNER_*'],
      },
      'ci:docs:snippets': {
        command: 'pnpm run docs:build:phase:snippets',
        dependsOn: ['ci:ts:build'],
        input: [{ auto: true }, ...generatedInputExclusions],
        untrackedEnv: commonUntrackedEnv,
      },
      'ci:docs:diagrams': {
        command: 'pnpm run docs:build:phase:diagrams',
        dependsOn: ['ci:ts:build'],
        input: [{ auto: true }, ...generatedInputExclusions],
        untrackedEnv: [...commonUntrackedEnv, 'PUPPETEER_CACHE_DIR', 'PUPPETEER_EXECUTABLE_PATH'],
      },
      'ci:docs:astro': {
        command: 'pnpm run docs:build:phase:astro',
        dependsOn: ['ci:docs:snippets', 'ci:docs:diagrams'],
        input: [{ auto: true }, ...generatedInputExclusions],
        untrackedEnv: commonUntrackedEnv,
      },
      'ci:docs:build': {
        command: 'true',
        dependsOn: ['ci:docs:astro'],
        output: [],
        untrackedEnv: commonUntrackedEnv,
      },
    },
  },
})
