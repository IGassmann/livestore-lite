import { cmd, cmdText, LivestoreWorkspace } from '@livestore/utils-dev/node'
import { Console, Effect, Schema } from '@livestore/utils/effect'
import { Cli } from '@livestore/utils/node'

import { runPeerDepCheck } from '../shared/peer-deps.ts'

export class LintError extends Schema.TaggedError<LintError>()('LintError', {
  message: Schema.String,
}) {}

/**
 * Checks that no `.md` files contain ESM import statements.
 * Files with imports must use `.mdx` extension for Astro to process them correctly.
 *
 * Ideally Astro would warn about this natively - see upstream issue:
 * https://github.com/withastro/astro/issues/14966
 */
const checkMdFilesNoImports = Effect.gen(function* () {
  // Use grep to find .md files with import statements
  // grep returns exit code 1 when no matches found, which is what we want (success = no files)
  const result = yield* cmdText('grep -rl "^import " docs/src/content/docs --include="*.md" 2>/dev/null || true', {
    runInShell: true,
  }).pipe(Effect.provide(LivestoreWorkspace.toCwd()))

  const ignoredGeneratedDocPaths = ['docs/src/content/docs/api/']

  const filesWithImports = result
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .filter((line) => ignoredGeneratedDocPaths.every((ignoredPath) => !line.includes(ignoredPath)))

  if (filesWithImports.length > 0) {
    yield* Console.error(
      `Error: Found .md files with import statements. These must be renamed to .mdx:\n${filesWithImports.map((p) => `  - ${p}`).join('\n')}`,
    )
    return yield* new LintError({ message: 'Found .md files with imports' })
  }
}).pipe(Effect.withSpan('checkMdFilesNoImports'))

const runCheck = cmd(['vp', 'check']).pipe(Effect.provide(LivestoreWorkspace.toCwd()), Effect.withSpan('check'))

const runCheckFix = cmd(['vp', 'check', '--fix']).pipe(
  Effect.provide(LivestoreWorkspace.toCwd()),
  Effect.withSpan('checkFix'),
)

export const lintCommand = Cli.Command.make(
  'lint',
  { fix: Cli.Options.boolean('fix').pipe(Cli.Options.withDefault(false)) },
  Effect.fn(function* ({ fix }) {
    // Use Vite+'s composite check path so format and lint share one toolchain entrypoint.
    if (fix === true) {
      yield* runCheckFix
    } else {
      yield* runCheck
    }

    // Check peer dependencies (warn-only for now, doesn't fail the build)
    const peerDepsOk = yield* runPeerDepCheck
    if (peerDepsOk === false) {
      yield* Console.warn('Peer dependency check found violations (see above)')
    }

    // Check that .md files don't contain imports (should be .mdx)
    yield* checkMdFilesNoImports
  }),
)
