import fs from 'node:fs'
import path from 'node:path'

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

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const bash = (command: string) => `/bin/bash -lc ${shellQuote(command)}`
const repoCli = (args: string) => `node --experimental-strip-types scripts/src/repo-cli.ts ${args}`
const nodeTs = (file: string, args = '') =>
  `node --experimental-strip-types ${file}${args.length === 0 ? '' : ` ${args}`}`

/*
NOTE we're mapping test projects to absolute paths here to avoid cases where
tests seem to be resolved multiple times, leading to duplicate runs.
*/
const rootDir = import.meta.dirname
const resolveProjectPath = (packageDir: string): string => {
  const rootConfig = path.join(packageDir, 'vite.config.ts')
  if (fs.existsSync(rootConfig)) {
    return rootConfig
  }

  const testsConfig = path.join(packageDir, 'tests/vite.config.ts')
  if (fs.existsSync(testsConfig)) {
    return testsConfig
  }

  return packageDir
}

const rootPackages = fs
  .readdirSync(path.join(rootDir, './packages/@livestore'))
  .filter((dir) => fs.statSync(path.join(rootDir, './packages/@livestore', dir)).isDirectory())
  .map((dir) => resolveProjectPath(path.join(rootDir, './packages/@livestore', dir)))

const cleanArtifacts = [
  'find packages tests docs examples scripts -type d \\( -name dist -o -name .turbo -o -name .cache -o -name .astro \\) -prune -exec rm -rf {} +',
  'find . -name tsconfig.tsbuildinfo -delete',
]

const checkMdImports = [
  "matches=$(grep -rl '^import ' docs/src/content/docs --include='*.md' 2>/dev/null || true)",
  "violations=$(printf '%s\\n' \"$matches\" | grep -v '^docs/src/content/docs/api/' || true)",
  'if [ -n "$violations" ]; then',
  "  echo 'Error: Found .md files with import statements. These must be renamed to .mdx:' >&2",
  '  printf "%s\\n" "$violations" | while IFS= read -r path; do [ -n "$path" ] && echo "  - $path" >&2; done',
  '  exit 1',
  'fi',
].join('\n')

const releaseChangesetVersion = [
  "git ls-files '*package.json' | xargs chmod u+w",
  'vpr -w changeset:version',
  nodeTs('scripts/src/commands/changesets.ts', 'restore-prerelease-changesets'),
  nodeTs('scripts/src/commands/changesets.ts', 'sync-version-source'),
  nodeTs('scripts/src/commands/changesets.ts', 'sync-standalone-consumers'),
  'vp install --lockfile-only --no-frozen-lockfile',
  nodeTs('scripts/src/commands/changesets.ts', 'assert-fixed-versions'),
  nodeTs('scripts/src/commands/changesets.ts', 'write-release-plan --npm-tag "${LIVESTORE_NPM_TAG:-latest}"'),
]

const devtoolsVerify = [
  'artifact_args=(--manifest "${LIVESTORE_DEVTOOLS_MANIFEST:-release/devtools-artifact.json}")',
  'if [[ -n "${LIVESTORE_DEVTOOLS_METADATA:-}" || -n "${LIVESTORE_DEVTOOLS_TARBALL:-}" || -n "${LIVESTORE_DEVTOOLS_CHROME_ZIP:-}" ]]; then',
  '  : "${LIVESTORE_DEVTOOLS_METADATA:?Set both LIVESTORE_DEVTOOLS_METADATA and LIVESTORE_DEVTOOLS_TARBALL, or neither to use the checked-in manifest}"',
  '  : "${LIVESTORE_DEVTOOLS_TARBALL:?Set both LIVESTORE_DEVTOOLS_METADATA and LIVESTORE_DEVTOOLS_TARBALL, or neither to use the checked-in manifest}"',
  '  artifact_args=(--metadata "$LIVESTORE_DEVTOOLS_METADATA" --tarball "$LIVESTORE_DEVTOOLS_TARBALL")',
  '  if [[ -n "${LIVESTORE_DEVTOOLS_CHROME_ZIP:-}" ]]; then artifact_args+=(--chrome-zip "$LIVESTORE_DEVTOOLS_CHROME_ZIP"); fi',
  'fi',
  nodeTs('scripts/src/commands/devtools-artifact.ts', 'verify "${artifact_args[@]}"'),
].join('\n')

const devtoolsRepack = (publishFlag: '--dry-run' | '--publish') =>
  [
    ': "${LIVESTORE_RELEASE_VERSION:?Set LIVESTORE_RELEASE_VERSION to the LiveStore release-group version}"',
    'artifact_args=(--manifest "${LIVESTORE_DEVTOOLS_MANIFEST:-release/devtools-artifact.json}")',
    'if [[ -n "${LIVESTORE_DEVTOOLS_METADATA:-}" || -n "${LIVESTORE_DEVTOOLS_TARBALL:-}" || -n "${LIVESTORE_DEVTOOLS_CHROME_ZIP:-}" ]]; then',
    "  echo 'release:devtools-artifact repack requires LIVESTORE_DEVTOOLS_MANIFEST so release-candidate certification can bind to the selected artifact.' >&2",
    "  echo 'Use release:devtools-artifact:verify for direct metadata/tarball integrity checks.' >&2",
    '  exit 1',
    'fi',
    'certification_path="${LIVESTORE_DEVTOOLS_CERTIFICATION:-release/devtools-artifact.certification.json}"',
    'if [[ -f "$certification_path" ]]; then artifact_args+=(--certification "$certification_path"); fi',
    'if [[ "${LIVESTORE_DEVTOOLS_ALLOW_UNCERTIFIED_REPACK:-}" = "1" ]]; then artifact_args+=(--allow-uncertified); fi',
    nodeTs(
      'scripts/src/commands/devtools-artifact.ts',
      `repack "\${artifact_args[@]}" --version "$LIVESTORE_RELEASE_VERSION" --out-dir "\${LIVESTORE_DEVTOOLS_OUT_DIR:-$(mktemp -d)}" ${publishFlag}`,
    ),
  ].join('\n')

const devtoolsCertifyLiveness = [
  ': "${LIVESTORE_RELEASE_VERSION:?Set LIVESTORE_RELEASE_VERSION to the LiveStore release-group version}"',
  'out_dir="${LIVESTORE_DEVTOOLS_OUT_DIR:-$(mktemp -d)}"',
  'mkdir -p "$out_dir"',
  'export LIVESTORE_DEVTOOLS_OUT_DIR="$out_dir"',
  'export LIVESTORE_DEVTOOLS_ALLOW_UNCERTIFIED_REPACK=1',
  'vpr -w release:devtools-artifact:repack-dryrun:no-install',
  'unset LIVESTORE_DEVTOOLS_ALLOW_UNCERTIFIED_REPACK',
  'repacked_tarball="$out_dir/livestore-devtools-vite-$LIVESTORE_RELEASE_VERSION.tgz"',
  'if [ ! -f "$repacked_tarball" ]; then echo "Expected repacked DevTools tarball not found: $repacked_tarball" >&2; exit 1; fi',
  'playwright_bin="tests/integration/node_modules/.bin/playwright"',
  'if [ ! -x "$playwright_bin" ]; then echo "Expected Playwright binary not found: $playwright_bin" >&2; exit 1; fi',
  'backup_dir="$(mktemp -d)"',
  'package_link="tests/integration/node_modules/@livestore/devtools-vite"',
  'if [ ! -e "$package_link" ]; then echo "Expected installed @livestore/devtools-vite package link not found: $package_link" >&2; exit 1; fi',
  'cp -a "$package_link" "$backup_dir/devtools-vite"',
  'restore_node_modules() { rm -rf "$package_link"; cp -a "$backup_dir/devtools-vite" "$package_link"; rm -rf "$backup_dir"; }',
  'trap restore_node_modules EXIT',
  'unpack_dir="$(mktemp -d)"',
  'tar -xzf "$repacked_tarball" -C "$unpack_dir"',
  'rm -rf "$package_link"',
  'cp -a "$unpack_dir/package" "$package_link"',
  'rm -rf "$unpack_dir"',
  'package_version="$(node -e "console.log(require(\'./$package_link/package.json\').version)")"',
  'if [ "$package_version" != "$LIVESTORE_RELEASE_VERSION" ]; then echo "Expected $package_link to contain exact DevTools artifact version $LIVESTORE_RELEASE_VERSION, found $package_version" >&2; exit 1; fi',
  '(cd tests/integration && CI=true FORCE_PLAYWRIGHT_VIA_CLI=1 PLAYWRIGHT_SUITE=devtools PLAYWRIGHT_HEADLESS="${PLAYWRIGHT_HEADLESS:-1}" LIVESTORE_DEVTOOLS_ENFORCE_LICENSE=false ./node_modules/.bin/playwright test src/tests/playwright/devtools/web.play.ts --reporter=line)',
  'certification_path="${LIVESTORE_DEVTOOLS_CERTIFICATION:-release/devtools-artifact.certification.json}"',
  'evidence="DevTools exact-artifact liveness passed for $LIVESTORE_RELEASE_VERSION"',
  'if [[ -n "${GITHUB_SERVER_URL:-}" && -n "${GITHUB_REPOSITORY:-}" && -n "${GITHUB_RUN_ID:-}" ]]; then evidence="$evidence in $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"; fi',
  nodeTs(
    'scripts/src/commands/devtools-artifact.ts',
    'certify --manifest "${LIVESTORE_DEVTOOLS_MANIFEST:-release/devtools-artifact.json}" --version "$LIVESTORE_RELEASE_VERSION" --out "$certification_path" --evidence "$evidence"',
  ),
  'if [[ -n "${GITHUB_ENV:-}" ]]; then echo "LIVESTORE_DEVTOOLS_CERTIFICATION=$certification_path" >> "$GITHUB_ENV"; fi',
].join('\n')

const requireTestSyncProvider = [
  'provider="${TEST_SYNC_PROVIDER:-}"',
  'if [ -z "$provider" ]; then echo "Error: TEST_SYNC_PROVIDER is required" >&2; exit 1; fi',
  'if [[ "$provider" == cf-* ]]; then',
  `  if ${repoCli('test integration sync-provider')} --provider "$provider"; then exit 0; fi`,
  '  echo "::warning::Cloudflare sync-provider tests for $provider failed (flaky; see https://github.com/livestorejs/livestore/issues/625 and upstream https://github.com/cloudflare/workers-sdk/issues/11122)"',
  '  exit 0',
  'fi',
  `${repoCli('test integration sync-provider')} --provider "$provider"`,
].join('\n')

const requirePlaywrightSuite = [
  'suite="${PLAYWRIGHT_SUITE:-}"',
  'if [ -z "$suite" ]; then echo "Error: PLAYWRIGHT_SUITE is required" >&2; exit 1; fi',
  `if [ "$suite" = "devtools" ]; then ${repoCli('test integration devtools')} || echo "::warning::Script failed but continuing"; exit 0; fi`,
  `${repoCli('test integration')} "$suite"`,
].join('\n')

const uploadPlaywrightTrace = [
  'suite="${PLAYWRIGHT_SUITE:-}"',
  'if [ -z "$suite" ]; then echo "Error: PLAYWRIGHT_SUITE is required" >&2; exit 1; fi',
  'if [ -n "${NETLIFY_AUTH_TOKEN:-}" ]; then',
  '  vp dlx netlify-cli deploy --no-build --dir=tests/integration/playwright-report --site livestore-ci --filter @local/tests-integration --alias "$suite-$(git rev-parse --short HEAD)"',
  'else',
  "  echo 'Skipping Netlify deploy: NETLIFY_AUTH_TOKEN not set'",
  'fi',
].join('\n')

const docsProdDiagnostics = [
  'mkdir -p tmp/ci-docs-prod',
  'date -u +%Y-%m-%dT%H:%M:%SZ | tee tmp/ci-docs-prod/failure-timestamp.log',
  'ps -eo pid,ppid,etime,pcpu,pmem,comm,args > tmp/ci-docs-prod/ps-full.log || true',
  "pgrep -af 'astro|chromium|chrome_crashpad_handler|netlify|node' > tmp/ci-docs-prod/pgrep-procs.log || true",
  'if [ -f tmp/ci-docs-prod/deploy-state.json ]; then echo "--- deploy-state.json ---"; cat tmp/ci-docs-prod/deploy-state.json; fi',
]

const docsBuildDiagnostics = [
  'mkdir -p tmp/ci-docs',
  'date -u +%Y-%m-%dT%H:%M:%SZ | tee tmp/ci-docs/failure-timestamp.log',
  'ps -eo pid,ppid,etime,pcpu,pmem,comm,args > tmp/ci-docs/ps-full.log || true',
  "pgrep -af 'astro|chromium|chrome_crashpad_handler|node' > tmp/ci-docs/pgrep-build-procs.log || true",
]

const cacheable = {
  untrackedEnv: commonUntrackedEnv,
}

const noOutput = {
  output: [],
}

const unitTestConcurrency = [
  'if [[ -n "${LIVESTORE_TEST_UNIT_CONCURRENCY:-}" ]]; then',
  '  if [[ ! "$LIVESTORE_TEST_UNIT_CONCURRENCY" =~ ^[1-9][0-9]*$ ]]; then',
  '    echo "LIVESTORE_TEST_UNIT_CONCURRENCY must be a positive integer, got: $LIVESTORE_TEST_UNIT_CONCURRENCY" >&2',
  '    exit 1',
  '  fi',
  '  export VP_RUN_CONCURRENCY_LIMIT="$LIVESTORE_TEST_UNIT_CONCURRENCY"',
  'fi',
  'vpr -w test:unit:graph',
].join('\n')

const unitTestPackageTask = (packageTask: string) => `vpr ${packageTask}`
const unitTestPackageFilters = (packageNames: ReadonlyArray<string>) =>
  `vpr ${packageNames.map((packageName) => `--filter ${packageName}`).join(' ')} test`

const flakyUnitTestPackageTask = (packageTask: string, warning: string) =>
  bash(
    [
      'if [[ "${GITHUB_ACTIONS:-}" = "true" ]]; then',
      `  if ${unitTestPackageTask(packageTask)}; then exit 0; fi`,
      `  echo "::warning::${warning}"`,
      '  exit 0',
      'fi',
      unitTestPackageTask(packageTask),
    ].join('\n'),
  )

const stableUnitTestPackageFilters = [
  '@livestore/common',
  '@livestore/common-cf',
  '@livestore/livestore',
  '@livestore/react',
  '@livestore/sqlite-wasm',
  '@livestore/utils',
  '@livestore/utils-dev',
  '@local/astro-tldraw',
  '@local/astro-twoslash-code',
]

export default defineConfig({
  test: {
    projects: [
      ...rootPackages,
      // path.join(rootDir, 'tests/'),
      path.join(rootDir, 'packages/@local/astro-twoslash-code/vite.config.ts'),
      path.join(rootDir, 'packages/@local/astro-tldraw/vite.config.ts'),
      path.join(rootDir, 'tests/integration/src/tests/adapter-cloudflare/vite.config.ts'),
      path.join(rootDir, 'tests/integration/src/tests/adapter-web/vite.config.ts'),
      path.join(rootDir, 'tests/integration/src/tests/devtools/vite.config.ts'),
      path.join(rootDir, 'tests/package-common/vite.config.ts'),
      path.join(rootDir, 'tests/sync-provider/vite.config.ts'),
      path.join(rootDir, 'tests/wa-sqlite/vite.config.ts'),
      path.join(rootDir, 'docs/vite.config.ts'),
      path.join(rootDir, 'scripts/vite.config.ts'),
    ],
    server: { deps: { inline: ['@effect/vitest'] } },
  },
  fmt: {
    semi: false,
    singleQuote: true,
    printWidth: 120,
    tabWidth: 2,
    useTabs: false,
    trailingComma: 'all',
    sortImports: {
      groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
      internalPattern: ['@livestore/', '@local/'],
      newlinesBetween: true,
    },
    sortPackageJson: true,
    ignorePatterns: [
      '**/node_modules/**',
      '**/.pnpm/**',
      '**/.pnpm-store/**',
      '**/dist/**',
      '**/storybook-static/**',
      '**/.turbo/**',
      '**/tmp/**',
      '**/*.gen.ts',
      '**/*.gen.tsx',
      '**/*.generated.ts',
      '**/*.generated.tsx',
      '**/package.json',
      '**/tsconfig.json',
      '**/tsconfig.*.json',
      'tests/integration/node_modules/**',
      '**/*.mdx',
      'docs/.astro/**',
      'docs/.netlify/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '.github/workflows/*.yml',
    ],
  },
  lint: {
    plugins: ['import', 'typescript', 'unicorn', 'oxc', 'react', 'react-perf'],
    ignorePatterns: [
      '**/node_modules/**',
      '**/.pnpm/**',
      '**/.pnpm-store/**',
      '**/.yarn/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.wrangler/**',
      '**/.netlify/**',
      '**/.astro/**',
      '**/.nitro/**',
      '**/.tanstack/**',
      '**/tmp/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/nix/**',
      '**/wip/**',
      '**/.vite/**',
      '**/patches/**',
      '**/.cache/**',
      '**/.turbo/**',
      'tests/integration/node_modules/**',
      'docs/src/plugins/**',
      'docs/src/content/_assets/code/**',
      'docs/netlify/**',
      'examples/**',
      'tests/perf/**',
      'tests/perf-eventlog/**',
      'tests/integration/src/tests/devtools/fixtures/**',
      'packages/@livestore/wa-sqlite/**/*.js',
      'packages/@livestore/wa-sqlite/**/*.mjs',
      'packages/@livestore/wa-sqlite/src/types/index.d.ts',
      'packages/@livestore/sqlite-wasm/vite.config.ts',
      'packages/@livestore/react/test/setup.ts',
      'packages/@local/astro-twoslash-code/example/**',
      'packages/@local/astro-twoslash-code/example/src/content/_assets/code/diagnostics.ts',
      'packages/@local/astro-twoslash-code/src/vite/test-fixtures/**',
      'packages/@livestore/common-cf/src/ws-rpc/test-fixtures/worker.ts',
    ],
    categories: {
      correctness: 'error',
      suspicious: 'warn',
      pedantic: 'off',
      perf: 'warn',
      style: 'off',
      restriction: 'off',
    },
    rules: {
      'import/no-commonjs': 'error',
      'typescript/consistent-type-imports': 'warn',
      'no-param-reassign': 'off',
      'default-param-last': 'error',
      'typescript/prefer-enum-initializers': 'error',
      'react/self-closing-comp': 'error',
      'typescript/prefer-namespace-keyword': 'error',
      'typescript/no-inferrable-types': 'error',
      'unicorn/no-array-callback-reference': 'off',
      'typescript/no-explicit-any': 'off',
      'typescript/no-deprecated': 'off',
      'typescript/consistent-type-definitions': 'off',
      'no-unused-vars': 'off',
      'no-debugger': 'off',
      'no-shadow': 'off',
      'no-underscore-dangle': 'off',
      'react/no-array-index-key': 'off',
      'no-unmodified-loop-condition': 'off',
      eqeqeq: 'off',
      'react/react-in-jsx-scope': 'off',
      'func-style': 'error',
      'oxc/no-barrel-file': 'off',
      'import/default': 'off',
      'import/no-cycle': 'off',
      'import/no-dynamic-require': 'off',
      'import/no-unassigned-import': 'off',
      'import/namespace': 'off',
      'import/no-named-as-default': 'off',
      'react-perf/jsx-no-new-function-as-prop': 'error',
      'react-perf/jsx-no-new-object-as-prop': 'error',
      'react-perf/jsx-no-jsx-as-prop': 'error',
      'react-perf/jsx-no-new-array-as-prop': 'error',
      'block-scoped-var': 'off',
      'no-await-in-loop': 'off',
      'no-unused-expressions': 'off',
      'require-yield': 'off',
      'unicorn/require-post-message-target-origin': 'off',
      'unicorn/prefer-add-event-listener': 'off',
      'unicorn/no-empty-file': 'off',
      'typescript/no-unsafe-type-assertion': 'off',
      'typescript/no-unnecessary-boolean-literal-compare': 'off',
      'typescript/no-unnecessary-type-arguments': 'off',
      'typescript/no-duplicate-type-constituents': 'error',
      'typescript/no-unnecessary-type-assertion': 'off',
      'typescript/restrict-template-expressions': 'error',
      'typescript/no-floating-promises': 'off',
      'typescript/no-base-to-string': 'error',
      'typescript/consistent-return': 'off',
      'typescript/no-redundant-type-constituents': 'error',
      'typescript/no-unnecessary-template-expression': 'error',
      'typescript/no-meaningless-void-operator': 'error',
      'typescript/no-unnecessary-type-conversion': 'off',
      'typescript/no-unnecessary-type-parameters': 'off',
      'typescript/unbound-method': 'off',
      'typescript/no-misused-spread': 'off',
      'typescript/no-for-in-array': 'off',
      'typescript/no-useless-default-assignment': 'off',
      'no-extraneous-class': 'off',
      'triple-slash-reference': 'off',
      'no-new': 'off',
      'no-empty-pattern': 'off',
      'no-useless-catch': 'off',
      'no-unused-private-class-members': 'off',
      'no-unassigned-vars': 'off',
      'no-unneeded-ternary': 'off',
      'no-unexpected-multiline': 'off',
      'no-extend-native': 'off',
      'oxc/only-used-in-recursion': 'off',
      'oxc/const-comparisons': 'off',
      'oxc/no-map-spread': 'off',
      'oxc/no-accumulating-spread': 'off',
      'constructor-super': 'off',
      'react/jsx-key': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/no-new-array': 'off',
      'import/named': 'off',
      'import/export': 'off',
    },
    overrides: [
      {
        files: ['**/*.cjs', '**/*.cts', '**/*.js'],
        rules: {
          'import/no-commonjs': 'off',
        },
      },
      {
        files: ['**/docs/src/content/_assets/code/**'],
        rules: {
          'import/no-commonjs': 'off',
        },
      },
      {
        files: ['**/vite.config.ts', '**/playwright.config.ts'],
        rules: {
          'func-style': 'off',
        },
      },
      {
        files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**', '**/tests/**'],
        rules: {
          'unicorn/no-array-sort': 'off',
          'unicorn/consistent-function-scoping': 'off',
          'require-yield': 'off',
        },
      },
      {
        files: ['**/*.d.ts'],
        rules: {
          'typescript/consistent-type-imports': 'off',
        },
      },
      {
        files: ['**/*.gen.*', '**/.astro/**', '**/routeTree.gen.ts'],
        rules: {
          'func-style': 'off',
          'import/no-commonjs': 'off',
          'import/no-named-as-default': 'off',
          'import/no-unassigned-import': 'off',
          'oxc/no-barrel-file': 'off',
          'oxc/no-map-spread': 'off',
          'unicorn/consistent-function-scoping': 'off',
        },
      },
      {
        files: ['**/wa-sqlite/**'],
        rules: {
          'func-style': 'off',
          'import/no-commonjs': 'off',
          'typescript/await-thenable': 'off',
          'unicorn/no-new-array': 'off',
          'unicorn/no-array-sort': 'off',
          'unicorn/consistent-function-scoping': 'off',
          'no-param-reassign': 'off',
        },
      },
      {
        files: ['**/*.svelte'],
        rules: {
          'import/no-unassigned-import': 'off',
        },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
      denyWarnings: true,
    },
  },
  staged: {
    '*': 'vp check --fix',
    'docs/**/*': () => [
      'vp exec --filter @local/docs astro sync',
      'git add docs/.astro/types.d.ts docs/.astro/content.d.ts',
    ],
  },
  run: {
    tasks: {
      'build:clean': {
        command: cleanArtifacts,
        cache: false,
      },

      'check:all': {
        command: 'true',
        dependsOn: ['check', 'ts:check', 'check:lockfile', 'check:md-imports'],
        ...noOutput,
        ...cacheable,
      },
      check: {
        command: 'vp check',
        ...noOutput,
        ...cacheable,
      },
      'check:fix': {
        command: 'vp check --fix',
        cache: false,
      },
      'check:lockfile': {
        command: 'vp install --frozen-lockfile --lockfile-only',
        cache: false,
      },
      'check:md-imports': {
        command: checkMdImports,
        ...noOutput,
        ...cacheable,
      },
      'check:quick': {
        command: 'true',
        dependsOn: ['check', 'ts:check'],
        ...noOutput,
        ...cacheable,
      },

      'docs:build': {
        command: 'true',
        dependsOn: ['docs:build:phase:astro'],
        ...noOutput,
        ...cacheable,
      },
      'docs:build:api': {
        command: bash(repoCli('docs build --api-docs')),
        input: [{ auto: true }, ...generatedInputExclusions],
        ...cacheable,
      },
      'docs:build:diagnostics': {
        command: docsBuildDiagnostics,
        cache: false,
      },
      'docs:build:phase:astro': {
        command: `mkdir -p tmp/ci-docs && ${repoCli('docs build --api-docs --skip-deps')}`,
        dependsOn: ['docs:build:phase:snippets', 'docs:build:phase:diagrams'],
        input: [{ auto: true }, ...generatedInputExclusions],
        ...cacheable,
      },
      'docs:build:phase:diagrams': {
        command: `mkdir -p tmp/ci-docs && ${repoCli('docs diagrams build')}`,
        dependsOn: ['ts:build'],
        input: [{ auto: true }, ...generatedInputExclusions],
        untrackedEnv: [...commonUntrackedEnv, 'PUPPETEER_CACHE_DIR', 'PUPPETEER_EXECUTABLE_PATH'],
      },
      'docs:build:phase:snippets': {
        command: `mkdir -p tmp/ci-docs && ${repoCli('docs snippets build')}`,
        dependsOn: ['ts:build'],
        input: [{ auto: true }, ...generatedInputExclusions],
        ...cacheable,
      },
      'docs:deploy': {
        command: bash(repoCli('docs deploy')),
        cache: false,
      },
      'docs:deploy:prod': {
        command: bash(repoCli('docs deploy --prod --build --purge-cdn')),
        cache: false,
      },
      'docs:deploy:prod:diagnostics': {
        command: docsProdDiagnostics,
        cache: false,
      },
      'docs:deploy:prod:phase:build-deploy': {
        command: `mkdir -p tmp/ci-docs-prod && LIVESTORE_DOCS_SITE_URL="https://docs.livestore.dev" ${repoCli('docs deploy --prod --step=upload')}`,
        cache: false,
      },
      'docs:deploy:prod:phase:purge': {
        command: `mkdir -p tmp/ci-docs-prod && ${repoCli('docs deploy --prod --step=purge')}`,
        cache: false,
      },
      'docs:deploy:prod:phase:verify': {
        command: `mkdir -p tmp/ci-docs-prod && ${repoCli('docs deploy --prod --step=verify')}`,
        cache: false,
      },
      'docs:dev': {
        command: bash(repoCli('docs dev')),
        cache: false,
      },
      'docs:search:sync:prod': {
        command:
          ': "${MXBAI_API_KEY:?Missing MXBAI_API_KEY secret}" && export MXBAI_VECTOR_STORE_ID="${MXBAI_VECTOR_STORE_ID:-${MXBAI_VECTOR_STORE_ID_PROD:-}}" && : "${MXBAI_VECTOR_STORE_ID:?Missing MXBAI_VECTOR_STORE_ID or MXBAI_VECTOR_STORE_ID_PROD secret}" && vpr @local/docs#prod:docs:sync:env',
        cache: false,
      },

      'examples:build:src': {
        command: 'true',
        dependsOn: [
          'livestore-workspace#ts:build',
          'livestore-example-web-email-client#build:cached',
          'livestore-example-web-linearlite#build:cached',
          'livestore-example-web-todomvc#build:cached',
          'livestore-example-web-todomvc-script#build:cached',
          'livestore-example-web-todomvc-sync-cf#build:cached',
          'livestore-example-cloudflare-todomvc#build',
        ],
        ...noOutput,
        ...cacheable,
      },
      'examples:deploy:build': {
        command: bash(repoCli('examples build-workers')),
        input: [{ auto: true }, ...generatedInputExclusions],
        env: branchEnv,
        untrackedEnv: ['CI', 'RUNNER_*'],
      },
      'examples:deploy:build:prod': {
        command: bash(repoCli('examples build-workers --prod')),
        input: [{ auto: true }, ...generatedInputExclusions],
        env: branchEnv,
        untrackedEnv: ['CI', 'RUNNER_*'],
      },
      'examples:deploy': {
        command: bash(repoCli('examples deploy')),
        cache: false,
      },
      'examples:deploy:no-build': {
        command: bash(repoCli('examples deploy --skip-build')),
        cache: false,
      },
      'examples:deploy:prod': {
        command: bash(repoCli('examples deploy --prod')),
        cache: false,
      },
      'examples:deploy:prod:no-build': {
        command: bash(repoCli('examples deploy --prod --skip-build')),
        cache: false,
      },
      'examples:install': {
        command: 'cd examples && vp install --frozen-lockfile',
        cache: false,
      },
      'examples:test': {
        command: bash(repoCli('examples test')),
        cache: false,
      },
      'examples:validate-links': {
        command: bash(repoCli('examples validate-links')),
        cache: false,
      },

      'github:rulesets:check': {
        command: bash(repoCli('github rulesets check')),
        cache: false,
      },

      'hooks:install': {
        command: 'vp config --hooks --no-agent',
        cache: false,
      },

      'deps:clean': {
        command: cleanArtifacts,
        cache: false,
      },
      'deps:install': {
        command: 'vp install --frozen-lockfile',
        cache: false,
      },
      'deps:reset-lock-files': {
        command: 'rm -f pnpm-lock.yaml examples/pnpm-lock.yaml docs/pnpm-lock.yaml',
        cache: false,
      },
      'deps:update': {
        command: bash(repoCli('update-deps')),
        cache: false,
      },

      'release:changeset:check-bodies': {
        command: bash(nodeTs('scripts/src/commands/changesets.ts', 'check-bodies')),
        ...noOutput,
        ...cacheable,
      },
      'release:changeset:check-pr': {
        command: bash(
          nodeTs('scripts/src/commands/changesets.ts', 'check-pr --base "${CHANGESET_BASE_REF:-origin/main}"'),
        ),
        env: ['CHANGESET_BASE_REF'],
        ...noOutput,
        ...cacheable,
      },
      'release:changeset:status': {
        command: 'vpr -w changeset:status --since "${CHANGESET_BASE_REF:-origin/main}"',
        env: ['CHANGESET_BASE_REF'],
        ...noOutput,
        ...cacheable,
      },
      'release:changeset:verify-baseline': {
        command: bash(nodeTs('scripts/src/commands/changesets.ts', 'verify-baseline-changelog')),
        ...noOutput,
        ...cacheable,
      },
      'release:changeset:version': {
        command: releaseChangesetVersion,
        cache: false,
      },
      'release:devtools-artifact:certify-liveness': {
        command: ['vpr -w deps:install', bash(devtoolsCertifyLiveness)],
        cache: false,
      },
      'release:devtools-artifact:certify-liveness:no-install': {
        command: bash(devtoolsCertifyLiveness),
        cache: false,
      },
      'release:devtools-artifact:publish': {
        command: ['vpr -w deps:install', bash(devtoolsRepack('--publish'))],
        cache: false,
      },
      'release:devtools-artifact:publish:no-install': {
        command: bash(devtoolsRepack('--publish')),
        cache: false,
      },
      'release:devtools-artifact:repack-dryrun': {
        command: ['vpr -w deps:install', bash(devtoolsRepack('--dry-run'))],
        cache: false,
      },
      'release:devtools-artifact:repack-dryrun:no-install': {
        command: bash(devtoolsRepack('--dry-run')),
        cache: false,
      },
      'release:devtools-artifact:verify': {
        command: ['vpr -w deps:install', bash(devtoolsVerify)],
        cache: false,
      },
      'release:notes:extract': {
        command: bash(repoCli('release extract-release-notes')),
        cache: false,
      },
      'release:plan': {
        command: `: "\${LIVESTORE_RELEASE_VERSION:?Set LIVESTORE_RELEASE_VERSION to the LiveStore release-group version}" && ${repoCli('release plan')} --release-version "$LIVESTORE_RELEASE_VERSION" --npm-tag "\${LIVESTORE_NPM_TAG:-latest}"`,
        cache: false,
      },
      'release:snapshot': {
        command: bash(repoCli('release snapshot')),
        cache: false,
      },
      'release:snapshot:git-sha': {
        command: `: "\${GIT_SHA:?Error: GIT_SHA is required}" && ${repoCli('release snapshot')} --git-sha="$GIT_SHA" --yes`,
        cache: false,
      },
      'release:stable:dryrun': {
        command: bash(repoCli('release stable --dry-run --yes')),
        cache: false,
      },
      'release:stable:publish': {
        command: bash(repoCli('release stable --yes --allow-existing')),
        cache: false,
      },

      'setup:run': {
        command: ['vpr -w deps:install', 'vpr -w hooks:install', 'vpr -w ts:build'],
        cache: false,
      },
      'setup:strict': {
        command: ['vpr -w deps:install', 'vpr -w hooks:install', 'vpr -w ts:build'],
        cache: false,
      },

      test: {
        command: bash(repoCli('test')),
        cache: false,
      },
      'test:integration:devtools': {
        command: bash(repoCli('test integration devtools')),
        cache: false,
      },
      'test:integration': {
        command: bash(repoCli('test integration all')),
        cache: false,
      },
      'test:integration:misc': {
        command: bash(repoCli('test integration misc')),
        cache: false,
      },
      'test:integration:playwright:suite': {
        command: bash(requirePlaywrightSuite),
        cache: false,
      },
      'test:integration:playwright:upload-trace': {
        command: uploadPlaywrightTrace,
        cache: false,
      },
      'test:integration:sync-provider': {
        command: bash(repoCli('test integration sync-provider')),
        cache: false,
      },
      'test:integration:sync-provider:cf-do-rpc-d1': {
        command: bash(repoCli('test integration sync-provider --provider cf-do-rpc-d1')),
        cache: false,
      },
      'test:integration:sync-provider:cf-do-rpc-do': {
        command: bash(repoCli('test integration sync-provider --provider cf-do-rpc-do')),
        cache: false,
      },
      'test:integration:sync-provider:cf-http-d1': {
        command: bash(repoCli('test integration sync-provider --provider cf-http-d1')),
        cache: false,
      },
      'test:integration:sync-provider:cf-http-do': {
        command: bash(repoCli('test integration sync-provider --provider cf-http-do')),
        cache: false,
      },
      'test:integration:sync-provider:cf-ws-d1': {
        command: bash(repoCli('test integration sync-provider --provider cf-ws-d1')),
        cache: false,
      },
      'test:integration:sync-provider:cf-ws-do': {
        command: bash(repoCli('test integration sync-provider --provider cf-ws-do')),
        cache: false,
      },
      'test:integration:sync-provider:matrix': {
        command: bash(requireTestSyncProvider),
        cache: false,
      },
      'test:integration:sync-provider:mock': {
        command: bash(repoCli('test integration sync-provider --provider mock')),
        cache: false,
      },
      'test:integration:todomvc': {
        command: bash(repoCli('test integration todomvc')),
        cache: false,
      },
      'test:integration:wa-sqlite': {
        command: bash(repoCli('test integration wa-sqlite')),
        cache: false,
      },
      'test:integration:wa-sqlite:build': {
        command: 'cd packages/@livestore/wa-sqlite && nix run .#build',
        cache: false,
      },
      'test:perf': {
        command: bash(repoCli('test perf')),
        cache: false,
      },
      'test:unit:stable:common': {
        command: unitTestPackageTask('@livestore/common#test'),
        dependsOn: ['ts:build'],
        ...noOutput,
        ...cacheable,
      },
      'test:unit:stable:common-cf': {
        command: unitTestPackageTask('@livestore/common-cf#test'),
        dependsOn: ['ts:build'],
        ...noOutput,
        ...cacheable,
      },
      'test:unit:stable:livestore': {
        command: unitTestPackageTask('@livestore/livestore#test'),
        dependsOn: ['ts:build'],
        ...noOutput,
        ...cacheable,
      },
      'test:unit:stable:react': {
        command: unitTestPackageTask('@livestore/react#test'),
        dependsOn: ['ts:build'],
        ...noOutput,
        ...cacheable,
      },
      'test:unit:stable:sqlite-wasm': {
        command: unitTestPackageTask('@livestore/sqlite-wasm#test'),
        dependsOn: ['ts:build'],
        ...noOutput,
        ...cacheable,
      },
      'test:unit:stable:utils': {
        command: unitTestPackageTask('@livestore/utils#test'),
        dependsOn: ['ts:build'],
        ...noOutput,
        ...cacheable,
      },
      'test:unit:stable:utils-dev': {
        command: unitTestPackageTask('@livestore/utils-dev#test'),
        dependsOn: ['ts:build'],
        ...noOutput,
        ...cacheable,
      },
      'test:unit:stable:astro-tldraw': {
        command: unitTestPackageTask('@local/astro-tldraw#test'),
        dependsOn: ['ts:build'],
        ...noOutput,
        ...cacheable,
      },
      'test:unit:stable:astro-twoslash-code': {
        command: unitTestPackageTask('@local/astro-twoslash-code#test'),
        dependsOn: ['ts:build'],
        ...noOutput,
        ...cacheable,
      },
      'test:unit:flaky:webmesh': {
        command: [
          'vpr -w test:unit:packages',
          flakyUnitTestPackageTask(
            '@livestore/webmesh#test',
            'webmesh unit tests failed (known CI-flaky suite; run locally with vpr @livestore/webmesh#test)',
          ),
        ],
        cache: false,
      },
      'test:unit:flaky:package-common': {
        command: [
          'vpr -w test:unit:flaky:webmesh',
          flakyUnitTestPackageTask(
            '@local/tests-package-common#test',
            'package-common unit tests failed (known CI-flaky suite; run locally with vpr @local/tests-package-common#test)',
          ),
        ],
        cache: false,
      },
      'test:unit:packages': {
        command: ['vpr -w ts:build', unitTestPackageFilters(stableUnitTestPackageFilters)],
        cache: false,
      },
      'test:unit:flaky': {
        command: 'vpr -w test:unit:flaky:package-common',
        cache: false,
      },
      'test:unit:graph': {
        command: 'vpr -w test:unit:flaky',
        cache: false,
      },
      'test:unit': {
        command: bash(unitTestConcurrency),
        ...noOutput,
        untrackedEnv: [...commonUntrackedEnv, 'LIVESTORE_TEST_UNIT_CONCURRENCY'],
      },
      'test:unit:legacy': {
        command: bash(repoCli('test unit')),
        cache: false,
      },

      'ts:build': {
        command: bash(repoCli('ts')),
        input: [{ auto: true }, '!**/*.tsbuildinfo'],
        output: [{ auto: true }, '!**/*.tsbuildinfo'],
        ...cacheable,
      },
      'ts:build-watch': {
        command: bash(repoCli('ts --watch')),
        cache: false,
      },
      'ts:check': {
        command: bash(repoCli('ts')),
        input: [{ auto: true }, '!**/*.tsbuildinfo'],
        output: [{ auto: true }, '!**/*.tsbuildinfo'],
        ...cacheable,
      },
      'ts:check:strict': {
        command: 'tsc --build tsconfig.dev.json',
        input: [{ auto: true }, '!**/*.tsbuildinfo'],
        output: [{ auto: true }, '!**/*.tsbuildinfo'],
        ...cacheable,
      },
      'ts:clean': {
        command: bash(repoCli('ts --clean')),
        cache: false,
      },
      'ts:effect-lsp': {
        command: 'effect-tsgo --build tsconfig.dev.json',
        input: [{ auto: true }, '!**/*.tsbuildinfo'],
        output: [{ auto: true }, '!**/*.tsbuildinfo'],
        ...cacheable,
      },
      'ts:emit': {
        command: 'tsc --build tsconfig.dev.json --noCheck',
        input: [{ auto: true }, '!**/*.tsbuildinfo'],
        output: [{ auto: true }, '!**/*.tsbuildinfo'],
        ...cacheable,
      },
      typecheck: {
        command: 'vpr -w ts:check',
        ...noOutput,
        ...cacheable,
      },
      'update-deps': {
        command: bash(repoCli('update-deps')),
        cache: false,
      },

      'ci:check': {
        command: 'true',
        dependsOn: ['check:all'],
        ...noOutput,
        ...cacheable,
      },
      'ci:ts:build': {
        command: 'true',
        dependsOn: ['ts:build'],
        ...noOutput,
        ...cacheable,
      },
      'ci:test:unit': {
        command: bash(repoCli('test unit')),
        dependsOn: ['ts:build'],
        cache: false,
      },
      'ci:examples:build': {
        command: 'true',
        dependsOn: ['examples:build:src'],
        ...noOutput,
        ...cacheable,
      },
      'ci:examples:build-ready': {
        command: 'true',
        dependsOn: ['examples:build:src'],
        ...noOutput,
        ...cacheable,
      },
      'ci:examples:deploy-build': {
        command: 'true',
        dependsOn: ['examples:deploy:build'],
        ...noOutput,
        ...cacheable,
      },
      'ci:examples:deploy-build:prod': {
        command: 'true',
        dependsOn: ['examples:deploy:build:prod'],
        ...noOutput,
        ...cacheable,
      },
      'ci:docs:snippets': {
        command: 'true',
        dependsOn: ['docs:build:phase:snippets'],
        ...noOutput,
        ...cacheable,
      },
      'ci:docs:diagrams': {
        command: 'true',
        dependsOn: ['docs:build:phase:diagrams'],
        ...noOutput,
        ...cacheable,
      },
      'ci:docs:astro': {
        command: 'true',
        dependsOn: ['docs:build:phase:astro'],
        ...noOutput,
        ...cacheable,
      },
      'ci:docs:build': {
        command: 'true',
        dependsOn: ['docs:build'],
        ...noOutput,
        ...cacheable,
      },
    },
  },
})
