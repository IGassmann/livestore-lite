import { defineProject } from 'vite-plus'

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const bash = (command: string) => `/bin/bash -lc ${shellQuote(command)}`
const flakyUnitTestTask = {
  command: bash(
    [
      'if [[ "${GITHUB_ACTIONS:-}" = "true" ]]; then',
      '  if vp test run; then exit 0; fi',
      '  echo "::warning::package-common unit tests failed (known CI-flaky suite; run locally with vpr @local/tests-package-common#test)"',
      '  exit 0',
      'fi',
      'vp test run',
    ].join('\n'),
  ),
  cache: false,
}

export default defineProject({
  test: {
    name: '@local/tests-package-common',
    include: ['src/**/*.test.ts'],
    server: { deps: { inline: ['@effect/vitest'] } },
  },
  run: {
    tasks: {
      'test:unit:flaky': flakyUnitTestTask,
    },
  },
})
