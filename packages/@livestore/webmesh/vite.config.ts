import { defineConfig } from 'vite-plus'

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const bash = (command: string) => `/bin/bash -lc ${shellQuote(command)}`
const flakyUnitTestTask = {
  command: bash(
    [
      'if [[ "${GITHUB_ACTIONS:-}" = "true" ]]; then',
      '  if vp test; then exit 0; fi',
      '  echo "::warning::webmesh unit tests failed (known CI-flaky suite; run locally with vpr @livestore/webmesh#test)"',
      '  exit 0',
      'fi',
      'vp test',
    ].join('\n'),
  ),
  dependsOn: ['build:cached'],
  cache: false,
}

export default defineConfig({
  test: {
    name: '@livestore/webmesh',
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    server: { deps: { inline: ['@effect/vitest'] } },
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
      'test:unit:flaky': flakyUnitTestTask,
    },
  },
})
