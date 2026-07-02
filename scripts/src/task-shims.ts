#!/usr/bin/env -S node --experimental-strip-types

import { spawnSync } from 'node:child_process'

const workspaceRoot = process.env.WORKSPACE_ROOT ?? process.cwd()
const cliArgs = process.argv.slice(2)
const normalizedArgs = cliArgs[0] === '--' ? cliArgs.slice(1) : cliArgs
const taskName = normalizedArgs[0]
const rawPassthroughArgs = normalizedArgs.slice(1)
const passthroughArgs = rawPassthroughArgs[0] === '--' ? rawPassthroughArgs.slice(1) : rawPassthroughArgs

type TaskSpec =
  | {
      command: string
      env?: Record<string, string | undefined>
    }
  | {
      noop: string
    }

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const appendArgs = (command: string, args: ReadonlyArray<string>) =>
  args.length === 0 ? command : `${command} ${args.map(shellQuote).join(' ')}`

const repoCli = (args: string) => `node --experimental-strip-types scripts/src/repo-cli.ts ${args}`
const nodeTs = (file: string, args = '') =>
  `node --experimental-strip-types ${file}${args.length === 0 ? '' : ` ${args}`}`
const runScript = (script: string) => `pnpm run ${script}`

const cleanArtifacts = [
  'find packages tests docs examples scripts -type d \\( -name dist -o -name .turbo -o -name .cache -o -name .astro \\) -prune -exec rm -rf {} +',
  'find . -name tsconfig.tsbuildinfo -delete',
].join(' && ')

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
  'pnpm exec changeset version',
  nodeTs('scripts/src/commands/changesets.ts', 'restore-prerelease-changesets'),
  nodeTs('scripts/src/commands/changesets.ts', 'sync-version-source'),
  nodeTs('scripts/src/commands/changesets.ts', 'sync-standalone-consumers'),
  'pnpm install --lockfile-only --no-frozen-lockfile',
  nodeTs('scripts/src/commands/changesets.ts', 'assert-fixed-versions'),
  nodeTs('scripts/src/commands/changesets.ts', 'write-release-plan --npm-tag "${LIVESTORE_NPM_TAG:-latest}"'),
].join(' && ')

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
  runScript('release:devtools-artifact:repack-dryrun:no-install'),
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
  '  pnpm dlx netlify-cli deploy --no-build --dir=tests/integration/playwright-report --site livestore-ci --filter @local/tests-integration --alias "$suite-$(git rev-parse --short HEAD)"',
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
].join('\n')

const docsBuildDiagnostics = [
  'mkdir -p tmp/ci-docs',
  'date -u +%Y-%m-%dT%H:%M:%SZ | tee tmp/ci-docs/failure-timestamp.log',
  'ps -eo pid,ppid,etime,pcpu,pmem,comm,args > tmp/ci-docs/ps-full.log || true',
  "pgrep -af 'astro|chromium|chrome_crashpad_handler|node' > tmp/ci-docs/pgrep-build-procs.log || true",
].join('\n')

const tasks: Record<string, TaskSpec> = {
  'build:clean': { command: cleanArtifacts },
  'check:all': {
    command: [runScript('lint:full'), runScript('ts:check')].join(' && '),
  },
  'check:quick': { command: [runScript('lint'), runScript('ts:check')].join(' && ') },

  'docs:build': { command: repoCli('docs build') },
  'docs:build:api': { command: repoCli('docs build --api-docs') },
  'docs:build:diagnostics': { command: docsBuildDiagnostics },
  'docs:build:phase:astro': { command: `mkdir -p tmp/ci-docs && ${repoCli('docs build --api-docs --skip-deps')}` },
  'docs:build:phase:diagrams': { command: `mkdir -p tmp/ci-docs && ${repoCli('docs diagrams build')}` },
  'docs:build:phase:snippets': { command: `mkdir -p tmp/ci-docs && ${repoCli('docs snippets build')}` },
  'docs:deploy': { command: repoCli('docs deploy') },
  'docs:deploy:prod': { command: repoCli('docs deploy --prod --build --purge-cdn') },
  'docs:deploy:prod:diagnostics': { command: docsProdDiagnostics },
  'docs:deploy:prod:phase:build-deploy': {
    command: `mkdir -p tmp/ci-docs-prod && LIVESTORE_DOCS_SITE_URL="https://docs.livestore.dev" ${repoCli('docs deploy --prod --step=upload')}`,
  },
  'docs:deploy:prod:phase:purge': {
    command: `mkdir -p tmp/ci-docs-prod && ${repoCli('docs deploy --prod --step=purge')}`,
  },
  'docs:deploy:prod:phase:verify': {
    command: `mkdir -p tmp/ci-docs-prod && ${repoCli('docs deploy --prod --step=verify')}`,
  },
  'docs:dev': { command: repoCli('docs dev') },
  'docs:search:sync:prod': {
    command:
      ': "${MXBAI_API_KEY:?Missing MXBAI_API_KEY secret}" && : "${MXBAI_VECTOR_STORE_ID:?Missing MXBAI_VECTOR_STORE_ID secret}" && pnpm --dir docs exec mxbai store sync "$MXBAI_VECTOR_STORE_ID" "./src/content/**/*.mdx" "./src/content/**/*.md" --yes --strategy fast',
  },

  'examples:build:src': {
    command:
      'npm_config_manage_package_manager_versions=false pnpm --dir examples --filter "livestore-example-*" --workspace-concurrency=1 build',
  },
  'examples:deploy': { command: repoCli('examples deploy') },
  'examples:deploy:prod': { command: repoCli('examples deploy --prod') },
  'examples:install': {
    command: 'npm_config_manage_package_manager_versions=false pnpm install --frozen-lockfile --dir examples',
  },
  'examples:test': { command: repoCli('examples test') },
  'examples:validate-links': { command: repoCli('examples validate-links') },

  'github:rulesets:check': { command: repoCli('github rulesets check') },

  lint: { command: repoCli('lint') },
  'lint:check': {
    command: [runScript('lint:check:format'), runScript('lint:check:lockfile'), runScript('lint:check:oxlint')].join(
      ' && ',
    ),
  },
  'lint:check:format': { command: "oxfmt --check . '!.github/workflows/*.yml'" },
  'lint:check:lockfile': { command: 'pnpm install --frozen-lockfile --lockfile-only' },
  'lint:check:md-imports': { command: checkMdImports },
  'lint:check:oxlint': { command: 'oxlint --import-plugin --deny-warnings' },
  'lint:fix': { command: [runScript('lint:fix:format'), runScript('lint:fix:oxlint')].join(' && ') },
  'lint:fix:format': { command: "oxfmt . '!.github/workflows/*.yml'" },
  'lint:fix:oxlint': { command: 'oxlint --import-plugin --deny-warnings --fix' },
  'lint:full': {
    command: [runScript('lint:check'), runScript('lint:check:md-imports')].join(' && '),
  },
  'lint:full:fix': {
    command: [runScript('lint:fix'), runScript('lint:check:md-imports')].join(' && '),
  },
  'pnpm:clean': { command: cleanArtifacts },
  'pnpm:install': { command: 'pnpm install --frozen-lockfile' },
  'pnpm:reset-lock-files': { command: 'rm -f pnpm-lock.yaml examples/pnpm-lock.yaml docs/pnpm-lock.yaml' },
  'pnpm:update': { command: repoCli('update-deps') },

  'release:changeset:check-bodies': { command: nodeTs('scripts/src/commands/changesets.ts', 'check-bodies') },
  'release:changeset:check-pr': {
    command: nodeTs('scripts/src/commands/changesets.ts', 'check-pr --base "${CHANGESET_BASE_REF:-origin/main}"'),
  },
  'release:changeset:status': { command: 'pnpm exec changeset status --since "${CHANGESET_BASE_REF:-origin/main}"' },
  'release:changeset:verify-baseline': {
    command: nodeTs('scripts/src/commands/changesets.ts', 'verify-baseline-changelog'),
  },
  'release:changeset:version': { command: releaseChangesetVersion },
  'release:devtools-artifact:certify-liveness': {
    command: [runScript('pnpm:install'), devtoolsCertifyLiveness].join(' && '),
  },
  'release:devtools-artifact:certify-liveness:no-install': { command: devtoolsCertifyLiveness },
  'release:devtools-artifact:publish': {
    command: [runScript('pnpm:install'), devtoolsRepack('--publish')].join(' && '),
  },
  'release:devtools-artifact:publish:no-install': { command: devtoolsRepack('--publish') },
  'release:devtools-artifact:repack-dryrun': {
    command: [runScript('pnpm:install'), devtoolsRepack('--dry-run')].join(' && '),
  },
  'release:devtools-artifact:repack-dryrun:no-install': { command: devtoolsRepack('--dry-run') },
  'release:devtools-artifact:verify': { command: [runScript('pnpm:install'), devtoolsVerify].join(' && ') },
  'release:notes:extract': { command: repoCli('release extract-release-notes') },
  'release:plan': {
    command: `: "\${LIVESTORE_RELEASE_VERSION:?Set LIVESTORE_RELEASE_VERSION to the LiveStore release-group version}" && ${repoCli('release plan')} --release-version "$LIVESTORE_RELEASE_VERSION" --npm-tag "\${LIVESTORE_NPM_TAG:-latest}"`,
  },
  'release:snapshot': { command: repoCli('release snapshot') },
  'release:snapshot:git-sha': {
    command: `: "\${GIT_SHA:?Error: GIT_SHA is required}" && ${repoCli('release snapshot')} --git-sha="$GIT_SHA" --yes`,
  },
  'release:stable:dryrun': { command: repoCli('release stable --dry-run --yes') },
  'release:stable:publish': { command: repoCli('release stable --yes --allow-existing') },

  'setup:run': { command: [runScript('pnpm:install'), runScript('ts:build')].join(' && ') },
  'setup:strict': { command: [runScript('pnpm:install'), runScript('ts:build')].join(' && ') },

  'test:integration:devtools': { command: repoCli('test integration devtools') },
  'test:integration': { command: repoCli('test integration all') },
  'test:integration:misc': { command: repoCli('test integration misc') },
  'test:integration:playwright:suite': { command: requirePlaywrightSuite },
  'test:integration:playwright:upload-trace': { command: uploadPlaywrightTrace },
  'test:integration:sync-provider': { command: repoCli('test integration sync-provider') },
  'test:integration:sync-provider:cf-do-rpc-d1': {
    command: repoCli('test integration sync-provider --provider cf-do-rpc-d1'),
  },
  'test:integration:sync-provider:cf-do-rpc-do': {
    command: repoCli('test integration sync-provider --provider cf-do-rpc-do'),
  },
  'test:integration:sync-provider:cf-http-d1': {
    command: repoCli('test integration sync-provider --provider cf-http-d1'),
  },
  'test:integration:sync-provider:cf-http-do': {
    command: repoCli('test integration sync-provider --provider cf-http-do'),
  },
  'test:integration:sync-provider:cf-ws-d1': { command: repoCli('test integration sync-provider --provider cf-ws-d1') },
  'test:integration:sync-provider:cf-ws-do': { command: repoCli('test integration sync-provider --provider cf-ws-do') },
  'test:integration:sync-provider:matrix': { command: requireTestSyncProvider },
  'test:integration:sync-provider:mock': { command: repoCli('test integration sync-provider --provider mock') },
  'test:integration:todomvc': { command: repoCli('test integration todomvc') },
  'test:integration:wa-sqlite': { command: repoCli('test integration wa-sqlite') },
  'test:integration:wa-sqlite:build': { command: 'cd packages/@livestore/wa-sqlite && nix run .#build' },
  'test:perf': { command: repoCli('test perf') },
  'test:unit': { command: repoCli('test unit') },

  'ts:build': { command: repoCli('ts') },
  'ts:build-watch': { command: repoCli('ts --watch') },
  'ts:check': { command: repoCli('ts') },
  'ts:check:strict': { command: 'tsc --build tsconfig.dev.json' },
  'ts:clean': { command: repoCli('ts --clean') },
  'ts:effect-lsp': { command: 'effect-tsgo --build tsconfig.dev.json' },
  'ts:emit': { command: 'tsc --build tsconfig.dev.json --noCheck' },
}

if (taskName === undefined || taskName === '--help' || taskName === '-h') {
  console.log(
    `Usage: node --experimental-strip-types scripts/src/task-shims.ts <task> [args...]\n\nTasks:\n${Object.keys(tasks).join('\n')}`,
  )
  process.exit(taskName === undefined ? 1 : 0)
}

const task = tasks[taskName]
if (task === undefined) {
  console.error(`Unknown task: ${taskName}`)
  process.exit(1)
}

if ('noop' in task) {
  console.log(task.noop)
  process.exit(0)
}

const rawCommand = appendArgs(task.command, passthroughArgs)
const result = spawnSync(rawCommand, {
  cwd: workspaceRoot,
  env: { ...process.env, WORKSPACE_ROOT: workspaceRoot, ...task.env },
  shell: '/bin/bash',
  stdio: 'inherit',
})

if (result.error !== undefined) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
